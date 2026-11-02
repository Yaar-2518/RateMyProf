import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { request } from "../services/api.js";

export default function ProfessorSummary({ professorId, reviewCount }) {
  const { user } = useAuth();
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true, timer;
    async function load() {
      try {
        const data = await request(`/professors/${encodeURIComponent(professorId)}/summary`);
        if (!alive) return;
        setResult(data); setError("");
        if (data.state === "processing") timer = setTimeout(load, 15000);
      } catch { if (alive) setError("The feedback summary is temporarily unavailable."); }
    }
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [professorId, reviewCount, retry]);
  async function retrySummary() {
    try { await request(`/professors/${encodeURIComponent(professorId)}/summary/retry`, { method: "POST" }); setRetry(n => n + 1); }
    catch { setError("Could not retry the summary. Check the worker and AI configuration."); }
  }
  return <section className="panel ai-summary" aria-label="AI summary of student feedback">
    <div className="section-heading"><h3>Student feedback, at a glance</h3><span className="tag">AI summary</span></div>
    {error ? <p role="status">{error}</p> : !result ? <p role="status">Loading summary…</p> : result.state === "ready" ? <>
      <p className="body-copy">{result.text}</p>
      <p className="muted small">Based on {result.sampleCount} privacy-cleared published reviews · Updated {new Date(result.updatedAt).toLocaleDateString()}. AI summaries may miss nuance; read the individual reviews too.</p>
    </> : <p className="muted" role="status">{result.state === "insufficient_data" ? `A summary appears after at least ${result.minimumReviews} written reviews have been published and cleared for AI use.` : result.state === "processing" ? "A summary is being prepared from published feedback." : "The AI summary is currently unavailable. You can still read the reviews below."}</p>}
    {user?.role === "admin" && result?.state === "unavailable" && <button className="button secondary" onClick={retrySummary}>Retry summary</button>}
  </section>;
}
