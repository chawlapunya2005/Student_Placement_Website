import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api.js";
import AnalysisToolkit from "../components/AnalysisToolkit.jsx";
import "../styles/dashboard.css";

function PreviewBlock({ title, value }) {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  const values = Array.isArray(value) ? value : [value];
  return (
    <div className="preview-block">
      <h4>{title}</h4>
      {values.map((item, index) => <p key={`${title}-${index}`}>{typeof item === "object" ? JSON.stringify(item) : item}</p>)}
    </div>
  );
}

function DocumentAnalysisPreview({ document }) {
  const data = document.result_data || {};
  const analysis = data.analysis || data;
  const score = data.match_score ?? analysis.total_score;
  return (
    <div className="document-preview">
      {score !== undefined && <div className="preview-score">{score}<span>/100</span></div>}
      <PreviewBlock title="Summary" value={analysis.summary || data.summary} />
      <div className="preview-grid">
        <PreviewBlock title="Strengths" value={analysis.strengths || data.skills_gained || analysis.academic_strengths || data.matching_keywords} />
        <PreviewBlock title="Areas to improve" value={analysis.weaknesses || analysis.areas_to_improve || data.missing_keywords || data.skill_gaps} />
        <PreviewBlock title="Suggestions" value={analysis.suggestions || data.knowledge_areas || data.suggested_courses} />
        <PreviewBlock title="Profile details" value={data.profile?.skills || data.subjects || data.skills} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [resumeTextAnalyze, setResumeTextAnalyze] = useState("");
  const [jobDescriptionFile, setJobDescriptionFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [matchResult, setMatchResult] = useState(null);
  const [matchError, setMatchError] = useState("");
const [analyzeLoading, setAnalyzeLoading] = useState(false);
const [matchLoading, setMatchLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [resumes, setResumes] = useState([]);
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [overallProfile, setOverallProfile] = useState(null);
  const uploadedDocuments = analysisHistory.filter((item) => ["resume", "transcript", "certificate", "match"].includes(item.kind));
  const navigate = useNavigate();

  // ✅ Fetch profile
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get("/profile/me");
        setUser(res.data.user);
      } catch {
        navigate("/login");
      }
    };
    fetchProfile();
  }, [navigate]);

  useEffect(() => {
    api.get("/analysis/history")
      .then((res) => setAnalysisHistory(res.data))
      .catch(() => setAnalysisHistory([]));
  }, []);

  useEffect(() => {
    api.get("/analysis/profile")
      .then((res) => setOverallProfile(res.data.profile))
      .catch(() => setOverallProfile(null));
  }, [analysisHistory.length]);

  // ✅ Fetch resume history
  const fetchResumes = async () => {
    const res = await api.get("/resume/history");
    setResumes(res.data);
  };

  const deleteDocument = async (documentId) => {
    if (!window.confirm("Delete this document and refresh your overall profile?")) return;
    try {
      const response = await api.delete(`/analysis/${documentId}`);
      setAnalysisHistory((current) => current.filter((item) => item.id !== documentId));
      if (response.data.profile) setOverallProfile(response.data.profile);
    } catch (error) {
      alert(error.response?.data?.error || "Unable to delete document");
    }
  };

  // ✅ Reset all on refresh
  useEffect(() => {
    setResumeTextAnalyze("");
    setJobDescriptionFile(null);
    setAnalysis(null);
    setMatchResult(null);
    setActiveTab("dashboard");
  }, []);

  // 🔹 Helper: format analysis as plaintext
const formatAnalysis = (data) => {
  if (!data) return "";

  // ✅ Handle both formats (new + old) safely
  const {
    total_score,
    score, // fallback for older responses
    summary,
    strengths,
    weaknesses,
    suggestions,
    criteria_breakdown
  } = data;

  const readinessScore = total_score ?? score ?? 0;

  let output = `🎯 Resume Readiness Score: ${readinessScore}/100\n\n`;

  // 🧩 Optional: include breakdown if available
  if (criteria_breakdown) {
    output += "📊 Detailed Scoring Breakdown:\n";
    for (const [key, val] of Object.entries(criteria_breakdown)) {
      output += `- ${key.replace(/_/g, " ")}: ${val.score}/${
        key === "Formatting_and_Presentation" ? 20 :
        key === "Clarity_and_Structure" ? 15 :
        key === "Education_and_Experience_Relevance" ? 20 :
        key === "Technical_Skills_and_Tools" ? 15 :
        key === "Achievements_and_Impact" ? 15 :
        key === "Language_and_Professional_Tone" ? 15 : 0
      } (${val.remarks})\n`;
    }
    output += `\n`;
  }

  if (summary) output += `📝 Summary:\n${summary}\n\n`;

  if (strengths?.length) {
    output += `✅ Strengths:\n`;
    strengths.forEach((s) => (output += `- ${s}\n`));
    output += `\n`;
  }

  if (weaknesses?.length) {
    output += `⚠️ Weaknesses:\n`;
    weaknesses.forEach((w) => (output += `- ${w}\n`));
    output += `\n`;
  }

  if (suggestions?.length) {
    output += `💡 Suggestions:\n`;
    suggestions.forEach((s) => (output += `- ${s}\n`));
  }

  return output.trim();
};


  // 🔹 Helper: format match results as plaintext
  const formatMatchResult = (data) => {
    if (!data) return "";
    const { match_score, summary, matching_keywords, missing_keywords, suggested_courses } = data;
    let output = `🎯 Match Score: ${match_score}/100\n\n`;
    if (summary) output += `📝 Summary:\n${summary}\n\n`;
    if (matching_keywords?.length) output += `✅ Matching Keywords:\n- ${matching_keywords.join("\n- ")}\n\n`;
    if (missing_keywords?.length) output += `❌ Missing Keywords:\n- ${missing_keywords.join("\n- ")}\n\n`;
    if (suggested_courses?.length) {
      output += `🎓 Recommended Courses:\n`;
      suggested_courses.forEach((course) => {
        output += `- ${course.name} (${course.reason})\n  Link: ${course.link}\n`;
      });
    }
    return output.trim();
  };

  // ✅ Analyze Resume
const handleAnalyze = async () => {
  if (!resumeTextAnalyze.trim()) return alert("Please paste your resume text!");
  setAnalyzeLoading(true);
  try {
    const res = await api.post("/resume/upload", { resumeText: resumeTextAnalyze });
    setAnalysis(res.data.data); // store raw JSON, format later
    setResumeTextAnalyze("");
    fetchResumes();
  } catch {
    alert("Error analyzing resume");
  } finally {
    setAnalyzeLoading(false);
  }
};

// ✅ Match Resume with Job Description
const handleMatch = async () => {
  if (!jobDescriptionFile) {
    return alert("Please upload a job description file.");
  }
  setMatchLoading(true);
  setMatchError("");
  try {
    const formData = new FormData();
    formData.append("jobDescriptionFile", jobDescriptionFile);
    const res = await api.post("/analysis/match-files", formData);
    setMatchResult(res.data.data);
  } catch (error) {
    setMatchError(error.response?.data?.error || "Error processing the uploaded files.");
  } finally {
    setMatchLoading(false);
  }
};

// ✅ Logout
const handleLogout = () => {
  // Clear local/session storage
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  sessionStorage.clear();

  // Redirect to login
  navigate("/login");
};


  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <h2>My Dashboard</h2>
        {user && (
          <p className="logged-in">
            Logged in as <b>{user.name}</b>
          </p>
        )}
        <nav className="sidebar-menu" aria-label="Dashboard sections">
          <button className={activeTab === "dashboard" ? "active" : ""} onClick={() => setActiveTab("dashboard")}>🏠 Overview</button>
          <button className={activeTab === "analyze" ? "active" : ""} onClick={() => setActiveTab("analyze")}>🧾 Profile Analyzer</button>
          <button className={activeTab === "pathway" ? "active" : ""} onClick={() => setActiveTab("pathway")}>🧭 Career Pathway</button>
          <button className={activeTab === "courses" ? "active" : ""} onClick={() => setActiveTab("courses")}>🎓 Recommended Courses</button>
          <button className={activeTab === "documents" ? "active" : ""} onClick={() => setActiveTab("documents")}>📁 My Documents</button>
        </nav>
        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {activeTab === "dashboard" && (
          <section className="tab-content overview-tab">
            <h1>Welcome, {user ? user.name : "User"}!</h1>

            <div className="card-grid">
              {/* Analyze Resume Card */}
              <div className="card">
                <h3>🧾 Profile Analyzer</h3>
                <p>Submit your resume, transcript, or certificate once. Your analyzed information stays saved in your profile.</p>
                <button type="button" onClick={() => setActiveTab("analyze")}>Open Profile Analyzer</button>
              </div>

              {/* Match Resume Card */}
              <div className="card">
                <h3>💼 Match Resume with Job Description</h3>
                <p className="match-help">Your saved resume will be matched against this job description.</p>
                <label className="file-label" htmlFor="job-description-file">Job description file</label>
                <input
                  id="job-description-file"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  onChange={(e) => setJobDescriptionFile(e.target.files[0])}
                />
                <button type="button" onClick={handleMatch} disabled={matchLoading}>
  {matchLoading ? "Processing files..." : "Match Now"}
</button>

                {matchError && <p className="tool-error">{matchError}</p>}

                {matchResult && (
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      background: "#f9fafb",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      padding: "10px",
                      fontSize: "0.95rem",
                      color: "#111827",
                    }}
                  >
                    {formatMatchResult(matchResult)}
                  </pre>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === "analyze" && (
          <AnalysisToolkit mode="documents" history={analysisHistory} onHistoryChange={setAnalysisHistory} />
        )}

        {activeTab === "pathway" && (
          <AnalysisToolkit mode="pathway" history={analysisHistory} onHistoryChange={setAnalysisHistory} />
        )}

        {activeTab === "courses" && (
          <AnalysisToolkit mode="courses" history={analysisHistory} onHistoryChange={setAnalysisHistory} />
        )}

        {activeTab === "documents" && (
          <div className="tab-content resumes-page">
            <div className="documents-heading">
              <div>
                <p className="eyebrow">Your uploaded information</p>
                <h2>My Documents</h2>
              </div>
              <button type="button" onClick={() => setActiveTab("analyze")}>Add document</button>
            </div>
            <p className="documents-intro">Resume, transcript, certificate, and match analyses are saved here. Deleting a document refreshes your overall profile.</p>

            {overallProfile && (
              <section className="profile-summary">
                <div>
                  <p className="eyebrow">Updated overall profile</p>
                  <h3>{overallProfile.summary_notes || "Your profile is being built from your documents."}</h3>
                </div>
                <div className="profile-tags">
                  {(overallProfile.skills || []).slice(0, 12).map((skill) => <span key={skill}>{skill}</span>)}
                </div>
              </section>
            )}

            {uploadedDocuments.length === 0 && <p className="toolkit-note">No documents have been analyzed yet.</p>}
            <div className="document-list">
              {uploadedDocuments.map((document) => (
                <article className="document-item" key={document.id}>
                  <div className="document-item-heading">
                    <div>
                      <span className="document-kind">{document.kind}</span>
                      <h3>{document.file_name || "Generated profile analysis"}</h3>
                    </div>
                    <button type="button" className="delete-document" onClick={() => deleteDocument(document.id)}>Delete</button>
                  </div>
                  <p className="document-date">Saved {new Date(document.created_at).toLocaleString()}</p>
                  <details>
                    <summary>View analysis</summary>
                    <DocumentAnalysisPreview document={document} />
                  </details>
                </article>
              ))}
            </div>
          </div>
        )}

        {/* Resume History Tab */}
{activeTab === "resumes" && (
  <div className="resumes-page">
    <h2>My Uploaded Resumes</h2>

    {resumes.length === 0 && <p>No resumes analyzed yet.</p>}

    {resumes.map((r) => {
      let parsedFeedback;
      try {
        parsedFeedback = JSON.parse(r.feedback);
      } catch {
        parsedFeedback = { summary: r.feedback };
      }

      return (
        <details key={r.id} className="resume-item">
          <summary>
            <span>Resume #{r.id}</span>
            <span className="score-tag">{r.readiness_score}/100</span>
          </summary>

          <div className="resume-details">
            <p>
              <strong>Date:</strong> {new Date(r.created_at).toLocaleString()}
            </p>

            {/* 🧾 Uploaded Resume Section */}
            {r.resume_text && (
              <div
                className="uploaded-resume"
                style={{
                  marginTop: "12px",
                  padding: "10px",
                  background: "#f3f4f6",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  whiteSpace: "pre-wrap",
                }}
              >
                <strong>📄 Uploaded Resume:</strong>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    background: "none",
                    border: "none",
                    margin: "5px 0 0 0",
                    padding: 0,
                  }}
                >
                  {r.resume_text}
                </pre>
              </div>
            )}

            {/* 💬 Feedback Summary */}
            {parsedFeedback.summary && (
              <p style={{ marginTop: "10px" }}>
                <strong>📝 Summary:</strong> {parsedFeedback.summary}
              </p>
            )}

            {parsedFeedback.strengths && (
              <div className="feedback-section">
                <strong>✅ Strengths:</strong>
                <ul>
                  {parsedFeedback.strengths.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {parsedFeedback.weaknesses && (
              <div className="feedback-section">
                <strong>⚠️ Weaknesses:</strong>
                <ul>
                  {parsedFeedback.weaknesses.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {parsedFeedback.suggestions && (
              <div className="feedback-section">
                <strong>💡 Suggestions:</strong>
                <ul>
                  {parsedFeedback.suggestions.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      );
    })}
  </div>
)}


      </main>
    </div>
  );
}
