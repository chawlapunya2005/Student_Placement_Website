import express from "express";
import db from "../config/db.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { askNvidia } from "../services/aiClient.js";

const router = express.Router();

// ✅ Fetch user’s resume history
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await db.query(
      "SELECT id, resume_text, readiness_score, feedback, created_at FROM resumes WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching resumes:", err);
    res.status(500).json({ error: "Failed to load resume history" });
  }
});


// ✅ Resume upload + analysis
router.post("/upload", authMiddleware, async (req, res) => {
  try {
    const { resumeText } = req.body;
    const userId = req.user.id;

    if (!resumeText || resumeText.trim().length < 30) {
      return res.status(400).json({ error: "Please paste a valid resume text." });
    }

    // Prompt for NVIDIA (cleaner + consistent format)
    const prompt = `
You are an expert career advisor and resume evaluator.

Evaluate the given resume using a detailed scoring system based on multiple key criteria.

Return your response in **strict JSON only**, following this structure:

{
  "total_score": <0–100>,
  "criteria_breakdown": {
    "Formatting_and_Presentation": {
      "score": <0–20>,
      "remarks": ""
    },
    "Clarity_and_Structure": {
      "score": <0–15>,
      "remarks": ""
    },
    "Education_and_Experience_Relevance": {
      "score": <0–20>,
      "remarks": ""
    },
    "Technical_Skills_and_Tools": {
      "score": <0–15>,
      "remarks": ""
    },
    "Achievements_and_Impact": {
      "score": <0–15>,
      "remarks": ""
    },
    "Language_and_Professional_Tone": {
      "score": <0–15>,
      "remarks": ""
    }
  },
  "summary": "",
  "strengths": [],
  "weaknesses": [],
  "suggestions": []
}

Scoring Guidelines:
- Each criterion is scored independently, and the sum of all scores = 100.
- "Formatting_and_Presentation" evaluates visual clarity, section order, spacing, and readability.
- "Clarity_and_Structure" checks logical flow, clear headings, and concise language.
- "Education_and_Experience_Relevance" evaluates if academic and work experiences align with target roles.
- "Technical_Skills_and_Tools" checks for completeness and relevance of listed skills.
- "Achievements_and_Impact" rewards quantifiable results, measurable outcomes, and initiative shown.
- "Language_and_Professional_Tone" evaluates grammar, tone, and use of professional vocabulary.

The final "total_score" should be a sum of all the above category scores.

Finally:
- Keep the "summary" concise (1–3 sentences).
- "strengths" should highlight what is done well.
- "weaknesses" should point out clear gaps.
- "suggestions" should provide 3–6 actionable improvements.
- Do NOT include markdown, commentary, or text outside the JSON format.

Resume:
${resumeText}
`;


    // Call NVIDIA API
    const response = await askNvidia(prompt);

    // 🧹 Clean JSON
    const cleaned = response.replace(/```json/gi, "").replace(/```/g, "").trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch (err) {
      console.warn("⚠️ Could not parse JSON, using fallback parser");
      const scoreMatch = response.match(/"score"\s*:\s*(\d+)/);
      result = {
        summary: "Partial analysis due to formatting issue.",
        score: scoreMatch ? parseInt(scoreMatch[1]) : 0,
        strengths: [],
        weaknesses: [],
        suggestions: []
      };
    }

const readinessScore = Math.min(result.total_score || 0, 100);

    // ✅ Save in DB
    const dbResult = await db.query(
      "INSERT INTO resumes (user_id, resume_text, readiness_score, feedback) VALUES ($1, $2, $3, $4) RETURNING *",
      [userId, resumeText, readinessScore, JSON.stringify(result, null, 2)]
    );

    // ✅ Return consistent structure
    res.json({
      message: "✅ Resume analyzed successfully!",
      data: result,
      resume: dbResult.rows[0],
    });

  } catch (err) {
    console.error("❌ Resume analysis failed:", err);
    res.status(500).json({ error: "Failed to analyze resume" });
  }
});

// ✅ Match Resume with Job Description
router.post("/match", authMiddleware, async (req, res) => {
  try {
    const { resumeText, jobDescription } = req.body;
    const userId = req.user.id;

    if (!resumeText || !jobDescription) {
      return res.status(400).json({ error: "Please provide both resume text and job description." });
    }

    // Prompt for NVIDIA
    const prompt = `
You are an AI resume-job matcher and career advisor.

Compare the following resume and job description. Perform these tasks:

1. Compute a similarity score (0–100).
2. Extract matching and missing keywords.
3. Provide a short summary of how well the candidate fits the job.
4. Suggest **specific online courses or certifications** that will help the candidate bridge the gap.
   - Include 3–5 recommendations.
   - Prefer Coursera, Udemy, Google Career Certificates, or LinkedIn Learning.
   - Provide **course name, short reason, and direct link**.

Return only valid JSON in this format:

{
  "match_score": <0–100>,
  "matching_keywords": [],
  "missing_keywords": [],
  "summary": "",
  "suggested_courses": [
    {
      "name": "",
      "reason": "",
      "link": ""
    }
  ]
}

Resume:
${resumeText}

Job Description:
${jobDescription}
`;


    const response = await askNvidia(prompt);

    let jsonString = response
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let matchData = { match_score: 0, matching_keywords: [], missing_keywords: [], summary: "" };
    try {
      matchData = JSON.parse(jsonString);
    } catch (err) {
      console.warn("⚠️ Could not parse NVIDIA JSON, fallback to regex");
      const scoreMatch = response.match(/"match_score"\s*:\s*(\d+)/);
      matchData.match_score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
    }

    // ✅ Save to DB (optional)
    await db.query(
  `UPDATE resumes 
   SET job_description = $1 
   WHERE id = (
     SELECT id FROM resumes 
     WHERE user_id = $2 
     ORDER BY created_at DESC 
     LIMIT 1
   )`,
  [jobDescription, userId]
);


    res.json({
      message: "✅ Resume-job match completed",
      data: matchData,
    });
  } catch (err) {
    console.error("❌ Match analysis failed:", err);
    res.status(500).json({ error: "Failed to analyze resume-job match" });
  }
});



export default router;
