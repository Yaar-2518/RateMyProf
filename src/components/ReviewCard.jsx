import { useState } from "react";
import { Stars, Tag, Modal } from "./UI.jsx";
import Icon from "./Icon.jsx";
import { useData } from "../context/DataContext.jsx";

const REPORT_REASONS = [
  "Personal information",
  "Harassment or hate speech",
  "Spam or unrelated content",
  "Misleading content",
  "Other",
];

export default function ReviewCard({ review }) {
  const { courses, reports, reportReview } = useData();
  const [helpful, setHelpful] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [reportError, setReportError] = useState("");

  const reported = reports.some((r) => r.reviewId === review.id);
  const course = courses.find((c) => c.id === review.courseId);

  async function submitReport(e) {
    e.preventDefault();
    setBusy(true);
    setReportError("");
    try {
      await reportReview(review.id, reason, details);
      setReporting(false);
      setDetails("");
    } catch (err) {
      setReportError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="review-card">
      <div className="review-top">
        <span className="anonymous-avatar">
          <Icon name="users" size={20} />
        </span>
        <div className="review-author">
          <strong>Anonymous student</strong>
          <span>
            {review.department} · {review.semester} ·{" "}
            {new Date(`${review.date}T12:00:00`).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
        <div className="review-score">
          <Stars value={review.rating} />
          <strong>{review.rating.toFixed(1)}</strong>
        </div>
      </div>
      {course && (
        <div className="review-course">
          {course.code} · {course.name}
        </div>
      )}
      <p>
        {review.text || "This student shared ratings without a written review."}
      </p>
      <div className="tags">
        {review.tags.map((t) => (
          <Tag key={t}>{t}</Tag>
        ))}
      </div>
      <div className="review-bottom">
        <button
          className={`helpful-button ${helpful ? "active" : ""}`}
          onClick={() => setHelpful(!helpful)}
          aria-pressed={helpful}
        >
          <Icon name="thumb" size={15} /> Helpful{" "}
          <span>{helpful ? 1 : 0}</span>
        </button>
        <button
          className="report-button"
          disabled={reported}
          onClick={() => {
            setReportError("");
            setReporting(true);
          }}
        >
          <Icon name="flag" size={14} />
          {reported ? "Reported" : "Report"}
        </button>
      </div>
      {reporting && (
        <Modal title="Report this review" onClose={() => !busy && setReporting(false)}>
          <p className="muted">
            Help keep this space thoughtful and respectful. Your report goes
            to the admin moderation queue.
          </p>
          <form onSubmit={submitReport} className="form-stack">
            <label>
              Reason
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {REPORT_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              Additional context <span className="muted">(optional)</span>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Tell us what concerns you..."
              />
            </label>
            {reportError && (
              <p className="form-error" role="alert">
                {reportError}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setReporting(false)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </article>
  );
}
