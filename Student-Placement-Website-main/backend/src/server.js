import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.js";
import resumeRoutes from "./routes/resume.js";
import profileRoutes from "./routes/profile.js";
import analysisRoutes from "./routes/analysis.js";
import requestLogger from "./middleware/requestLogger.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json());
app.use(requestLogger);

app.use("/api/auth", authRoutes);
app.use("/api/resume", resumeRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/analysis", analysisRoutes);

app.listen(port, () => console.log(`Server running on port ${port}`));
