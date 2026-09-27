import React, { useEffect, useState } from "react";
import api from "../services/api.js";

function Result({ value }) {
  if (!value) return null;
  return <pre className="tool-result">{JSON.stringify(value, null, 2)}</pre>;
}

function LockedMessage() {
  return (
    <div className="toolkit-lock">
      <span className="lock-icon">!</span>
      <div>
        <h3>Complete your profile first</h3>
        <p>Analyze at least one resume, transcript, or certificate to unlock this tool.</p>
      </div>
    </div>
  );
}

function PathwayHistory({ items }) {
  return (
    <div className="pathway-history">
      <div className="history-heading">
        <h3>Saved pathway searches</h3>
        <span>{items.length} {items.length === 1 ? "search" : "searches"}</span>
      </div>
      {items.slice(0, 6).map((item) => {
        const pathway = item.result_data || {};
        return (
          <article className="pathway-result" key={item.id}>
            <div className="pathway-result-heading">
              <h3>{pathway.target_career || item.input_data || "Career pathway"}</h3>
              <time>{new Date(item.created_at).toLocaleDateString()}</time>
            </div>
            <p>{pathway.final_explanation}</p>
            <div className="pathway-stages">
              {(pathway.technical_pathway || []).map((stage) => (
                <div className="pathway-stage" key={`${item.id}-${stage.stage}`}>
                  <span>{stage.stage}</span>
                  <strong>Technical focus</strong>
                  <p>{(stage.skills || []).join(" · ")}</p>
                </div>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function CourseRecommendations({ data }) {
  const recommendations = data?.recommendations || [];
  if (!recommendations.length) return <p className="toolkit-note">No course recommendations returned yet.</p>;
  return (
    <div className="course-list">
      {recommendations.map((course, index) => (
        <article className="course-card" key={`${course.url}-${index}`}>
          <div className="course-card-heading">
            <div>
              <span>{course.provider || "Recommended course"}</span>
              <h3>{course.title}</h3>
            </div>
            <a href={course.url} target="_blank" rel="noreferrer">Open course</a>
          </div>
          <p>{course.reason || course.course_summary}</p>
          {course.skills_covered?.length > 0 && <small>{course.skills_covered.join(" · ")}</small>}
          {course.prerequisites?.todo?.length > 0 && <small className="course-todo">Build next: {course.prerequisites.todo.join(" · ")}</small>}
        </article>
      ))}
    </div>
  );
}

export default function AnalysisToolkit({ mode = "documents", history = [], onHistoryChange }) {
  const [files, setFiles] = useState({ resume: null, transcript: null, certificate: null });
  const [career, setCareer] = useState("");
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [overallProfile, setOverallProfile] = useState(null);
  const [editing, setEditing] = useState({});
  const hasDocuments = history.some((item) => ["resume", "transcript", "certificate"].includes(item.kind));
  const analyzedKinds = new Set(history.map((item) => item.kind));

  useEffect(() => {
    const latest = {};
    history.forEach((item) => {
      if (!latest[item.kind]) latest[item.kind] = item.result_data;
    });
    setResults(latest);
  }, [history]);

  useEffect(() => {
    if (mode !== "documents") return;
    api.get("/analysis/profile")
      .then((response) => setOverallProfile(response.data.profile))
      .catch(() => setOverallProfile(null));
  }, [history.length, mode]);

  const refreshHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await api.get("/analysis/history");
      onHistoryChange(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to load your saved analyses.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const analyzeFile = async (kind, endpoint) => {
    if (!files[kind]) {
      setError(`Choose a ${kind} PDF or image first.`);
      return;
    }

    setLoading(kind);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", files[kind]);
      const response = await api.post(`/analysis/${endpoint}`, formData);
      setResults((current) => ({ ...current, [kind]: response.data.data }));
      setEditing((current) => ({ ...current, [kind]: false }));
      await refreshHistory();
    } catch (requestError) {
      setError(requestError.response?.data?.error || `Unable to analyze the ${kind}.`);
    } finally {
      setLoading("");
    }
  };

  const generateTextResult = async (kind, endpoint) => {
    if (!hasDocuments) {
      setError("Analyze a resume, transcript, or certificate before using this tool.");
      return;
    }
    if (kind === "pathway" && !career.trim()) {
      setError("Enter a target career first.");
      return;
    }

    setLoading(kind);
    setError("");
    try {
      const response = await api.post(`/analysis/${endpoint}`, { targetCareer: career });
      setResults((current) => ({ ...current, [kind]: response.data.data }));
      await refreshHistory();
    } catch (requestError) {
      setError(requestError.response?.data?.error || `Unable to generate ${kind}.`);
    } finally {
      setLoading("");
    }
  };

  const fileCard = (kind, title, endpoint) => {
    const saved = analyzedKinds.has(kind);
    const savedDocument = history.find((item) => item.kind === kind);
    return (
      <div className={`tool-card ${saved ? "tool-card-saved" : ""}`} key={kind}>
        <div className="tool-card-title">
          <h3>{title}</h3>
          {saved && <span className="saved-badge">Saved</span>}
        </div>
        {saved && !editing[kind] ? (
          <>
            <p className="saved-copy"><strong>{savedDocument?.file_name || "Uploaded document"}</strong><br />Stored in your profile.</p>
            <button type="button" onClick={() => setEditing((current) => ({ ...current, [kind]: true }))}>Edit document</button>
          </>
        ) : (
          <>
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(event) => setFiles((current) => ({ ...current, [kind]: event.target.files[0] }))}
            />
            <button type="button" onClick={() => analyzeFile(kind, endpoint)} disabled={loading === kind}>
              {loading === kind ? "Analyzing..." : saved ? "Save changes" : "Analyze document"}
            </button>
            {saved && <button type="button" className="secondary-tool-button" onClick={() => setEditing((current) => ({ ...current, [kind]: false }))}>Cancel</button>}
          </>
        )}
      </div>
    );
  };

  const profileSection = (title, values, className = "") => (
    <div className={`profile-section ${className}`}>
      <h3>{title}</h3>
      {values?.length ? (
        <div className="profile-chip-list">
          {values.map((value) => <span key={value}>{value}</span>)}
        </div>
      ) : <p className="profile-empty">No information found yet.</p>}
    </div>
  );

  const renderDocuments = () => (
    <>
      <div className="toolkit-heading">
        <div>
          <h2>Analyze your documents</h2>
        </div>
        <p>More information gives your career recommendations better context.</p>
      </div>
      <p className="toolkit-intro">Submit any PDF or image to unlock Career Pathway and Recommended Courses. Add the others later for a richer profile.</p>
      <div className="tool-grid">
        {fileCard("resume", "Resume document", "resume-image")}
        {fileCard("transcript", "Transcript document", "transcript")}
        {fileCard("certificate", "Certificate document", "certificate")}
      </div>
      {!hasDocuments && <p className="toolkit-note">Nothing has been analyzed yet. Choose one document above to get started.</p>}
      {hasDocuments && <p className="toolkit-success">Profile started. Career Pathway and Recommended Courses are now unlocked.</p>}
      {hasDocuments && overallProfile && (
        <section className="comprehensive-profile">
          <div className="profile-hero">
            <div>
              <h2>Comprehensive Profile</h2>
              <p>{overallProfile.summary_notes || "Your uploaded documents have been combined into one profile."}</p>
            </div>
            <span className="profile-status">Profile updated</span>
          </div>
          <div className="profile-section-grid">
            {profileSection("Skills", overallProfile.skills)}
            {profileSection("Subjects & domains", overallProfile.subjects)}
            {profileSection("Interests", overallProfile.interests)}
            {profileSection("Recommended growth", overallProfile.skill_gaps, "profile-section-gaps")}
          </div>
        </section>
      )}
    </>
  );

  const renderCareerTool = (kind, endpoint, title, description) => (
    <>
      <div className="toolkit-heading">
        <div>
          <h2>{title}</h2>
        </div>
        <p>{description}</p>
      </div>
      {!hasDocuments ? <LockedMessage /> : (
        <div className="tool-card career-card">
          <label htmlFor={`${kind}-career`}>Target career</label>
          <input
            id={`${kind}-career`}
            type="text"
            placeholder="e.g. Data Analyst"
            value={career}
            onChange={(event) => setCareer(event.target.value)}
          />
          <button type="button" onClick={() => generateTextResult(kind, endpoint)} disabled={loading === kind}>
            {loading === kind ? "Working..." : kind === "pathway" ? "Build my pathway" : "Find recommended courses"}
          </button>
          {kind === "pathway" ? (
            <PathwayHistory items={history.filter((item) => item.kind === "pathway")} />
          ) : (
            <CourseRecommendations data={results[kind]} />
          )}
        </div>
      )}
    </>
  );

  return (
    <section className="toolkit">
      {error && <p className="tool-error">{error}</p>}
      {historyLoading && <p className="toolkit-note">Loading your saved profile...</p>}
      {mode === "documents" && renderDocuments()}
      {mode === "pathway" && renderCareerTool("pathway", "pathway", "Career Pathway", "A staged plan based on your saved documents.")}
      {mode === "courses" && renderCareerTool("courses", "courses", "Recommended Courses", "Practical next steps based on your profile and target career.")}
    </section>
  );
}
