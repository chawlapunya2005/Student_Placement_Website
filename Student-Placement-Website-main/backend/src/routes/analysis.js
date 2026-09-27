import express from "express";
import multer from "multer";
import pdfParse from "pdf-parse";
import db from "../config/db.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { askNvidia } from "../services/aiClient.js";
import { deleteDocument, getFinalProfile, regenerateFinalProfile } from "../services/profileService.js";
import { logAction } from "../utils/logger.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function parseJson(text) {
  const cleaned = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  if (!cleaned) {
    throw new Error("NVIDIA returned an empty response. Try the document again or check the configured model.");
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return { raw: cleaned };
      }
    }
    return { raw: cleaned };
  }
}

async function saveResult(userId, kind, result, fileName = null, inputData = "") {
  await db.query(
    "INSERT INTO analysis_results (user_id, kind, file_name, input_data, result_data) VALUES ($1, $2, $3, $4, $5)",
    [userId, kind, fileName, inputData, JSON.stringify(result)]
  );
}

async function extractDocumentText(file, label) {
  if (file.mimetype === "application/pdf") {
    const parsed = await pdfParse(file.buffer);
    const text = parsed.text.trim();
    if (!text) {
      throw new Error(`The ${label} PDF has no selectable text. Upload a searchable PDF or export it as a clear image.`);
    }
    return text;
  }

  if (file.mimetype.startsWith("image/")) {
    return (await askNvidia(`Extract all readable text from this ${label} image. Preserve headings, bullet points, dates, and keywords. Return plain text only. Do not summarize or invent information.`, file)).trim();
  }

  throw new Error(`${label} must be a PDF, PNG, JPG, JPEG, or WebP file.`);
}

function documentRoute(kind, prompt) {
  return async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Please upload a PDF or image file." });
      if (req.file.mimetype !== "application/pdf" && !req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({ error: "Only PDF, PNG, JPG, JPEG, and WebP files are supported." });
      }

      const result = req.file.mimetype === "application/pdf"
        ? parseJson(await askNvidia(`${prompt}\n\nDOCUMENT TEXT:\n${await extractDocumentText(req.file, kind)}`))
        : parseJson(await askNvidia(prompt, req.file));
      if (result.raw === "") {
        throw new Error("NVIDIA returned no structured analysis for this document. Try a clearer PDF or image.");
      }
      const previous = await db.query(
        "SELECT id FROM analysis_results WHERE user_id = $1 AND kind = $2",
        [req.user.id, kind]
      );
      await db.query("DELETE FROM analysis_results WHERE user_id = $1 AND kind = $2", [req.user.id, kind]);
      await saveResult(req.user.id, kind, result, req.file.originalname);
      const profile = await regenerateFinalProfile(req.user.id);
      logAction(previous.rows.length ? "document.updated" : "document.analyzed", { userId: req.user.id, kind, fileName: req.file.originalname });
      res.json({ kind, data: result, profile });
    } catch (error) {
      console.error(`${kind} analysis failed:`, error);
      res.status(500).json({ error: error.message || "Analysis failed" });
    }
  };
}

router.post(
  "/resume-image",
  authMiddleware,
  upload.single("file"),
  documentRoute(
    "resume",
    `Extract and evaluate this resume image. Return only valid JSON with this shape:
{
  "profile": {"name":"", "email":"", "phone":"", "linkedin":"", "github":"", "education":[], "skills":[], "projects":[], "experience":[], "certifications":[], "achievements":[], "career_objective":""},
  "analysis": {"total_score": 0, "summary":"", "strengths":[], "weaknesses":[], "suggestions":[]}
}
Use empty values when information is not visible. Do not invent facts.`
  )
);

router.post(
  "/transcript",
  authMiddleware,
  upload.single("file"),
  documentRoute(
    "transcript",
    `Read this academic transcript image. Return only valid JSON with this shape:
{
  "student": {"name":"", "registration_number":"", "semester_year":""},
  "gpa":"",
  "total_credits":"",
  "subjects":[{"course_code":"","course_name":"","credits":"","grade":""}],
  "analysis":{"summary":"","top_subjects":[],"areas_to_improve":[],"academic_strengths":[]}
}
Only include information visible in the image.`
  )
);

router.post(
  "/certificate",
  authMiddleware,
  upload.single("file"),
  documentRoute(
    "certificate",
    `Identify the certificate in this image and explain its career value. Return only valid JSON with this shape:
{
  "certificate_name":"",
  "issuer":"",
  "skills_gained":[],
  "knowledge_areas":[],
  "employer_value":"",
  "summary":""
}
Do not invent an issuer if it is not visible.`
  )
);

router.post(
  "/match-files",
  authMiddleware,
  upload.single("jobDescriptionFile"),
  async (req, res) => {
    try {
      const jobDescriptionFile = req.file;
      if (!jobDescriptionFile) {
        return res.status(400).json({ error: "Upload a job description file." });
      }

      const storedResume = await db.query(
        "SELECT result_data, file_name FROM analysis_results WHERE user_id = $1 AND kind = 'resume' ORDER BY created_at DESC LIMIT 1",
        [req.user.id]
      );
      if (!storedResume.rows.length) {
        return res.status(400).json({ error: "Analyze and save your resume in Profile Analyzer before matching it." });
      }

      const jobDescription = await extractDocumentText(jobDescriptionFile, "job description");
      const resumeText = storedResume.rows[0].result_data;

      if (jobDescription.length < 30) {
        return res.status(400).json({ error: "The job description file needs to contain readable text." });
      }

      const response = await askNvidia(`Compare this resume with the job description. Return only valid JSON:
{
  "match_score": 0,
  "matching_keywords": [],
  "missing_keywords": [],
  "summary": "",
  "suggested_courses": [{"name":"", "reason":"", "link":""}]
}
Calculate a 0-100 match score, identify relevant matching and missing keywords, explain the fit briefly, and suggest 3-5 practical courses or certifications.

RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDescription}`);
      const result = parseJson(response);
      await saveResult(
        req.user.id,
        "match",
        result,
        `Stored resume (${storedResume.rows[0].file_name}) + ${jobDescriptionFile.originalname}`,
        JSON.stringify({ resumeText, jobDescription })
      );

      logAction("match.completed", { userId: req.user.id, resumeFile: storedResume.rows[0].file_name, jobDescriptionFile: jobDescriptionFile.originalname });
      res.json({ data: result });
    } catch (error) {
      console.error("File match failed:", error);
      res.status(500).json({ error: error.message || "Failed to process the uploaded files." });
    }
  }
);

async function getUserContext(userId) {
  const [profile, latestResume] = await Promise.all([
    db.query("SELECT id, name, email FROM users WHERE id = $1", [userId]),
    db.query("SELECT resume_text, feedback FROM resumes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1", [userId]),
  ]);

  return {
    user: profile.rows[0] || {},
    latest_resume: latestResume.rows[0] || {},
  };
}

async function requireAnalyzedDocument(userId) {
  const result = await db.query(
    "SELECT id FROM analysis_results WHERE user_id = $1 AND kind IN ('resume', 'transcript', 'certificate') LIMIT 1",
    [userId]
  );
  return result.rows.length > 0;
}

router.post("/pathway", authMiddleware, async (req, res) => {
  try {
    if (!(await requireAnalyzedDocument(req.user.id))) {
      return res.status(403).json({ error: "Analyze a resume, transcript, or certificate before using this tool." });
    }
    const targetCareer = String(req.body.targetCareer || "").trim();
    if (!targetCareer) return res.status(400).json({ error: "targetCareer is required" });

    const context = await getUserContext(req.user.id);
    const result = parseJson(await askNvidia(`Create a progressive skill pathway for the target career: ${targetCareer}.
Use the student's context below. Return only valid JSON:
{
  "target_career":"",
  "user_profile":{"current_skills":[],"experience_level":"","interests":[]},
  "skill_gaps":{"technical":[],"soft":[]},
  "technical_pathway":[{"stage":"Beginner","skills":[],"reasoning":""},{"stage":"Intermediate","skills":[],"reasoning":""},{"stage":"Advanced","skills":[],"reasoning":""}],
  "soft_skill_pathway":[{"stage":"Foundational","skills":[],"reasoning":""},{"stage":"Growth","skills":[],"reasoning":""}],
  "final_explanation":""
}
Student context:
${JSON.stringify(context)}`));

    await saveResult(req.user.id, "pathway", result, null, targetCareer);
    logAction("pathway.generated", { userId: req.user.id, targetCareer });
    res.json({ data: result });
  } catch (error) {
    console.error("Pathway generation failed:", error);
    res.status(500).json({ error: error.message || "Pathway generation failed" });
  }
});

router.post("/courses", authMiddleware, async (req, res) => {
  try {
    if (!(await requireAnalyzedDocument(req.user.id))) {
      return res.status(403).json({ error: "Analyze a resume, transcript, or certificate before using this tool." });
    }
    const targetCareer = String(req.body.targetCareer || "").trim();
    const profileResponse = await getFinalProfile(req.user.id);
    const profile = profileResponse.profile || {};
    const filteredProfile = {
      skills: (profile.skills || []).slice(0, 30),
      interests: (profile.interests || []).slice(0, 10),
      skill_gaps: (profile.skill_gaps || []).slice(0, 10),
      subjects: (profile.subjects || []).slice(0, 10),
    };
    const topics = filteredProfile.skill_gaps.slice(0, 3).length
      ? filteredProfile.skill_gaps.slice(0, 3)
      : filteredProfile.interests.slice(0, 3).length
        ? filteredProfile.interests.slice(0, 3)
        : [targetCareer || "online course"];
    const query = topics.map((topic) => `online course for ${topic} skills`).join(" OR ");
    if (!process.env.TAVILY_API_KEY || process.env.TAVILY_API_KEY.startsWith("your-")) {
      throw new Error("TAVILY_API_KEY is not configured");
    }

    const tavilyResponse = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: "basic",
        max_results: 8,
        include_raw_content: false,
        include_answer: false,
      }),
    });
    if (!tavilyResponse.ok) throw new Error(`Tavily search failed with status ${tavilyResponse.status}`);
    const tavilyData = await tavilyResponse.json();
    const courses = (tavilyData.results || []).map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.content || item.snippet || "",
    })).filter((item) => item.url);
    if (!courses.length) throw new Error("Tavily returned no relevant courses");

    let result;
    try {
      result = parseJson(await askNvidia(`Recommend at most 5 courses from the Tavily results below for this student. Keep each URL exactly as provided; never invent or change URLs. Return only valid JSON:
{
  "recommendations":[{"title":"","provider":"","url":"","reason":"","course_summary":"","skills_covered":[],"prerequisites":{"completed":[],"todo":[]}}]
}
TARGET CAREER: ${targetCareer || "Not specified"}
STUDENT PROFILE:
${JSON.stringify(filteredProfile, null, 2)}
TAVILY RESULTS:
${JSON.stringify(courses, null, 2)}`));
    } catch (error) {
      logAction("courses.nvidia_fallback", { userId: req.user.id, reason: error.message });
      result = {
        recommendations: courses.slice(0, 5).map((course) => ({
          title: course.title,
          provider: "Tavily result",
          url: course.url,
          reason: course.snippet || `Relevant to ${targetCareer || "your career goals"}.`,
          course_summary: course.snippet,
          skills_covered: [],
          prerequisites: { completed: [], todo: [] },
        })),
      };
    }

    const validUrls = new Set(courses.map((course) => course.url));
    result.recommendations = (result.recommendations || []).slice(0, 5).map((recommendation) => ({
      ...recommendation,
      url: validUrls.has(recommendation.url) ? recommendation.url : courses[0].url,
    }));

    await saveResult(req.user.id, "courses", result, null, targetCareer);
    logAction("courses.generated", { userId: req.user.id, targetCareer });
    res.json({ data: result });
  } catch (error) {
    console.error("Course recommendation failed:", error);
    res.status(500).json({ error: error.message || "Course recommendation failed" });
  }
});

router.get("/history", authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, kind, file_name, input_data, result_data, created_at FROM analysis_results WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(result.rows.map((row) => ({ ...row, result_data: parseJson(row.result_data) })));
  } catch (error) {
    console.error("Analysis history failed:", error);
    res.status(500).json({ error: "Failed to load analysis history" });
  }
});

router.get("/profile", authMiddleware, async (req, res) => {
  try {
    res.json(await getFinalProfile(req.user.id));
  } catch (error) {
    console.error("Final profile fetch failed:", error);
    res.status(500).json({ error: "Failed to load overall profile" });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const result = await deleteDocument(req.user.id, req.params.id);
    if (!result) return res.status(404).json({ error: "Document not found" });
    res.json({ message: "Document deleted", ...result });
  } catch (error) {
    console.error("Document deletion failed:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

export default router;
