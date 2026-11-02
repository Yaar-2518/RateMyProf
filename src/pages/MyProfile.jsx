import { useState, useEffect } from "react";
import { Link, PageHeading, Stars, Tag, EmptyState } from "../components/UI.jsx";
import Icon from "../components/Icon.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useData } from "../context/DataContext.jsx";

function StatusBadge({ status }) {
  const badgeClass =
    status === "approved"
      ? "tag"
      : status === "rejected"
        ? "tag danger"
        : "tag warm";
  const displayStatus = status ? status.charAt(0).toUpperCase() + status.slice(1) : "Pending";
  return <span className={badgeClass}>{displayStatus}</span>;
}

export default function MyProfile() {
  const { user } = useAuth();
  const { fetchMyReviews } = useData();
  const [myReviews, setMyReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");

  useEffect(() => {
    setLoading(true);
    fetchMyReviews()
      .then((reviews) => {
        setMyReviews(reviews || []);
        setError("");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const counts = {
    all: myReviews.length,
    approved: myReviews.filter((r) => r.status === "approved").length,
    pending: myReviews.filter((r) => r.status === "pending").length,
    rejected: myReviews.filter((r) => r.status === "rejected").length,
  };

  const filtered =
    tab === "all"
      ? myReviews
      : myReviews.filter((r) => r.status === tab);

  if (loading) {
    return (
      <div className="container page">
        <PageHeading title="My Profile" />
        <p className="muted" role="status">Loading your reviews…</p>
      </div>
    );
  }

  return (
    <div className="container page">
      <PageHeading
        eyebrow="YOUR ACCOUNT"
        title="My Profile"
        description="View your account information and the reviews you've shared with the campus community."
      />

      <div className="profile-grid secondary-grid">
        <section className="panel">
          <h3>Account Information</h3>
          <div className="my-profile-details">
            <div className="my-profile-avatar">
              <Icon name="user" size={42} />
            </div>
            <div className="my-profile-info">
              <p><strong>Email:</strong> {user?.email || "—"}</p>
              <p>
                <strong>Role:</strong>{" "}
                <span className="tag">{user?.role === "admin" ? "Administrator" : "Student"}</span>
              </p>
              <p>
                <strong>Privacy:</strong>{" "}
                <span className="muted small">All reviews are published anonymously.</span>
              </p>
            </div>
          </div>
        </section>

        <section className="panel">
          <h3>My Review Overview</h3>
          <div className="admin-stats compact-stats">
            <div className="panel insight-stat small-stat">
              <Icon name="edit" size={20} />
              <strong>{counts.all}</strong>
              <p>Total submitted</p>
            </div>
            <div className="panel insight-stat small-stat">
              <Icon name="check" size={20} />
              <strong>{counts.approved}</strong>
              <p>Approved</p>
            </div>
            <div className="panel insight-stat small-stat">
              <Icon name="clock" size={20} />
              <strong>{counts.pending}</strong>
              <p>Pending</p>
            </div>
            <div className="panel insight-stat small-stat">
              <Icon name="close" size={20} />
              <strong>{counts.rejected}</strong>
              <p>Rejected</p>
            </div>
          </div>
        </section>
      </div>

      <div className="section-heading" style={{ marginTop: "2.5rem" }}>
        <div>
          <h2>My Submitted Reviews</h2>
          <p>Track the moderation status and feedback on your submissions.</p>
        </div>
        <Link className="button primary compact" to="/write-review">
          Write a review <Icon name="edit" size={15} />
        </Link>
      </div>

      <div className="tabs" role="tablist" style={{ marginBottom: "1.5rem" }}>
        {[
          ["all", `All (${counts.all})`],
          ["approved", `Approved (${counts.approved})`],
          ["pending", `Pending (${counts.pending})`],
          ["rejected", `Rejected (${counts.rejected})`],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p className="form-error" role="alert">{error}</p>
      )}

      {!filtered.length ? (
        <EmptyState
          title={
            tab === "all"
              ? "No reviews yet"
              : `No ${tab} reviews`
          }
          description={
            tab === "all"
              ? "You haven't submitted any reviews yet. Pass your experience on to help other students!"
              : `You have no reviews with the status "${tab}".`
          }
        >
          {tab === "all" && (
            <Link className="button primary" to="/write-review">
              Submit your first review <Icon name="arrow" size={16} />
            </Link>
          )}
        </EmptyState>
      ) : (
        <div className="my-reviews-list">
          {filtered.map((review) => {
            const contextBadges = [];
            if (review.grade && review.grade !== "Prefer not to say") contextBadges.push(`Grade: ${review.grade}`);
            if (review.attendance) contextBadges.push(review.attendance);
            if (review.textbook) contextBadges.push(`Textbook: ${review.textbook}`);
            if (review.examDifficulty) contextBadges.push(`Exams: ${review.examDifficulty}`);
            if (review.transparency) contextBadges.push(review.transparency);

            return (
              <article className="review-card my-review-card" key={review.id}>
                <div className="review-top">
                  <div className="review-author">
                    <strong>
                      <Link to={`/professors/${review.professorId}`} className="text-link">
                        {review.professorName}
                      </Link>
                    </strong>
                    <span>
                      {review.courseCode ? `${review.courseCode} · ` : ""}
                      {review.courseName} · {review.semester} ·{" "}
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
                    <StatusBadge status={review.status} />
                  </div>
                </div>

                {contextBadges.length > 0 && (
                  <div className="review-context" style={{ margin: "0.5rem 0" }}>
                    {contextBadges.map((badge) => (
                      <span key={badge} className="context-badge">{badge}</span>
                    ))}
                  </div>
                )}

                <p>
                  {review.text || "Ratings only — no written review text provided."}
                </p>

                {review.tags && review.tags.length > 0 && (
                  <div className="tags">
                    {review.tags.map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
