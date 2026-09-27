import express from "express";
import db from "../config/db.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// ✅ Fetch logged-in user profile with skills and certifications
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch user info
    const userResult = await db.query(
      "SELECT id, name, email, created_at FROM users WHERE id = $1",
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    // Fetch skills
    const skillsResult = await db.query(
      "SELECT skill_name, proficiency FROM skills WHERE user_id = $1 ORDER BY added_at DESC",
      [userId]
    );

    // Fetch certifications
    const certsResult = await db.query(
      "SELECT cert_name, provider, date_earned, credential_link FROM certifications WHERE user_id = $1 ORDER BY added_at DESC",
      [userId]
    );

    res.json({
      user,
      skills: skillsResult.rows,
      certifications: certsResult.rows,
    });
  } catch (err) {
    console.error("Profile fetch error:", err.message);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
