import db from "../config/db.js";
import { askNvidia } from "./aiClient.js";
import { logAction } from "../utils/logger.js";

const emptyProfile = {
  subjects: [],
  skills: [],
  interests: [],
  skill_gaps: [],
  summary_notes: "",
};

function parseJson(text) {
  const cleaned = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  if (!cleaned) throw new Error("NVIDIA returned an empty profile response");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("NVIDIA returned an invalid profile response");
  }
}

export async function regenerateFinalProfile(userId) {
  const documents = await db.query(
    "SELECT kind, file_name, result_data FROM analysis_results WHERE user_id = $1 AND kind IN ('resume', 'transcript', 'certificate') ORDER BY created_at ASC",
    [userId]
  );

  if (!documents.rows.length) {
    await saveProfile(userId, emptyProfile);
    logAction("profile.regenerated", { userId, documentCount: 0 });
    return emptyProfile;
  }

  const prompt = `Synthesize the student's uploaded profile documents into one practical career profile. Some document types may be missing. Return only valid JSON with exactly this shape:
${JSON.stringify(emptyProfile, null, 2)}
Use only information present in the uploaded analyses. Do not invent facts.

UPLOADED DOCUMENT ANALYSES:
${JSON.stringify(documents.rows.map((document) => ({
  type: document.kind,
  file: document.file_name,
  analysis: parseJson(document.result_data),
})), null, 2)}`;

  const profile = { ...emptyProfile, ...parseJson(await askNvidia(prompt)) };
  await saveProfile(userId, profile);
  logAction("profile.regenerated", { userId, documentCount: documents.rows.length });
  return profile;
}

async function saveProfile(userId, profile) {
  await db.query(
    `INSERT INTO final_profiles (user_id, profile_data, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET profile_data = excluded.profile_data, updated_at = CURRENT_TIMESTAMP`,
    [userId, JSON.stringify(profile)]
  );
}

export async function getFinalProfile(userId) {
  const result = await db.query(
    "SELECT profile_data, updated_at FROM final_profiles WHERE user_id = $1",
    [userId]
  );
  const row = result.rows[0];
  return { profile: row ? JSON.parse(row.profile_data) : null, updated_at: row?.updated_at || null };
}

export async function deleteDocument(userId, documentId) {
  const result = await db.query(
    "DELETE FROM analysis_results WHERE id = $1 AND user_id = $2 RETURNING id, kind",
    [documentId, userId]
  );
  if (!result.rows.length) return null;
  const profile = await regenerateFinalProfile(userId);
  logAction("document.deleted", { userId, documentId, kind: result.rows[0].kind });
  return { deleted: result.rows[0], profile };
}
