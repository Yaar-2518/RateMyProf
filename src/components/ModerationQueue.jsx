import { useEffect, useState } from "react";
import { useData } from "../context/DataContext.jsx";
import { request } from "../services/api.js";
import { EmptyState } from "./UI.jsx";

function Submission({ review, onAction, busy, professors, courses }) {
  const [aiText, setAiText] = useState(review.aiText || review.text);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const waiting = ["queued", "processing"].includes(review.screeningState);
  return <article className="panel moderation-submission">
    <div className="section-heading"><h3>{professors.find(p => p.id === review.professorId)?.name || "Professor"}</h3><span className="tag">{review.status} · {review.screeningState?.replaceAll("_", " ")}</span></div>
    <p className="muted small">{courses.find(c => c.id === review.courseId)?.code} · {review.semester}</p>
    <blockquote>{review.text || "Ratings-only submission"}</blockquote>
    {review.screening && <div className="screening-assessment"><strong>{review.screening.method === "gemini" ? "AI assessment" : "Local pre-screen"}</strong><p>{review.screening.explanation}</p><div className="tags">{[...(review.screening.localFlags || []), ...review.screening.flags].map((f, i) => <span className="tag warm" key={`${f}-${i}`}>{f.replaceAll("_", " ")}</span>)}</div></div>}
    {review.errorCode && <p role="status" className="form-error">Screening unavailable ({review.errorCode}). You can retry or make a manual decision.</p>}
    {review.status === "pending" && <>
      <details><summary>Prepare a privacy-safe copy for Gemini</summary>
        <p className="muted small">Remove all names, student identifiers, contact details, and personal, sensitive, or confidential information. Only this copy is sent to Gemini. The original stays private until you publish it. Do not send raw PII to Gemini's free tier.</p>
        <label>De-identified copy<textarea value={aiText} onChange={e => setAiText(e.target.value)} maxLength={1000} rows={4} /></label>
        <label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I checked that this copy contains no personal, sensitive, or confidential information.</label>
        <button className="button secondary" disabled={busy || waiting || !confirmed || !aiText.trim()} onClick={() => onAction(review.id, { action: "screen", aiText, privacyConfirmed: confirmed })}>Screen with Gemini</button>
      </details>
      <label>Decision note<textarea rows={2} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder="Record the reason for your decision" /></label>
      <p className="muted small">Publishing makes the original review public. Confirm that it follows the guidelines and contains no private information. AI flags are suggestions, not findings of fact.</p>
      <div className="form-actions">
        <button className="button primary" disabled={busy || waiting} onClick={() => onAction(review.id, { action: "approve", reason })}>Approve and publish</button>
        <button className="button danger-button" disabled={busy || waiting} onClick={() => onAction(review.id, { action: "reject", reason })}>Reject</button>
        {review.screeningState === "failed" && <button className="button secondary" disabled={busy} onClick={() => onAction(review.id, { action: "retry" })}>Retry screening</button>}
      </div>
    </>}
    {!!review.audit.length && <details><summary>Decision history ({review.audit.length})</summary><ul>{review.audit.map((event, i) => <li key={i}>{event.action} · {new Date(event.at).toLocaleString()}{event.reason ? ` · ${event.reason}` : ""}</li>)}</ul></details>}
  </article>;
}

export default function ModerationQueue() {
  const { professors, courses, refreshCatalog } = useData();
  const [rows, setRows] = useState([]), [error, setError] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  async function refresh() {
    try { const data = await request("/moderation/reviews"); setRows(data.reviews); setError(""); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { let alive = true; const load = async () => { if (alive) await refresh(); }; load(); const timer = setInterval(load, 10000); return () => { alive = false; clearInterval(timer); }; }, []);
  async function act(id, body) {
    setBusy(true); setError("");
    try { await request(`/moderation/reviews/${id}`, { method: "PATCH", body }); await refresh(); await refreshCatalog(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="submission-queue">
    <div className="section-heading"><div><h2>Submission screening</h2><p className="muted">Pre-screen incoming reviews, then make a human publication decision.</p></div><button className="button secondary" onClick={refresh} disabled={busy}>Refresh</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <p role="status">Loading submissions…</p> : !rows.length ? <EmptyState title="No pending submissions" description="New reviews appear here before publication." /> : rows.map(r => <Submission key={`${r.id}-${r.revision}`} review={r} onAction={act} busy={busy} professors={professors} courses={courses} />)}
  </section>;
}
