import { useMemo } from "react";
import { useData } from "../context/DataContext.jsx";
import { Link, PageHeading, Stars } from "../components/UI.jsx";
import Icon from "../components/Icon.jsx";
import { ratingLabels } from "../../shared/reviewOptions.js";

// ── Helpers ──────────────────────────────────────────────────────────────────
function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function StatCard({ icon, value, label }) {
  return (
    <section className="panel insight-stat">
      <Icon name={icon} size={22} />
      <strong>{value}</strong>
      <p>{label}</p>
    </section>
  );
}

function RatingBar({ label, value }) {
  const pct = ((value / 5) * 100).toFixed(1);
  return (
    <div className="rating-bar-row">
      <span className="rating-bar-label">{label}</span>
      <div className="rating-bar-track">
        <div className="rating-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="rating-bar-value">{value.toFixed(2)}</span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Insights() {
  const { professors, courses, reviews, departments } = useData();

  // Overall averages per rating dimension
  const dimensionAverages = useMemo(() => {
    if (!reviews.length) return [];
    return ratingLabels.map((label, i) => ({
      label,
      value: avg(reviews.map((r) => r.ratings[i])),
    }));
  }, [reviews]);

  // Top 5 professors by overall rating (min 1 review)
  const topProfessors = useMemo(
    () =>
      [...professors]
        .filter((p) => p.reviewCount > 0)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 5),
    [professors],
  );

  // Top 5 most-reviewed professors
  const mostReviewed = useMemo(
    () =>
      [...professors]
        .filter((p) => p.reviewCount > 0)
        .sort((a, b) => b.reviewCount - a.reviewCount)
        .slice(0, 5),
    [professors],
  );

  // Reviews per department
  const deptStats = useMemo(() => {
    return departments
      .map((dept) => {
        const deptReviews = reviews.filter((r) => r.department === dept);
        return {
          name: dept,
          count: deptReviews.length,
          rating: deptReviews.length
            ? avg(deptReviews.map((r) => r.rating))
            : 0,
        };
      })
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [departments, reviews]);

  // Review activity by semester
  const semesterActivity = useMemo(() => {
    const map = {};
    reviews.forEach((r) => {
      map[r.semester] = (map[r.semester] || 0) + 1;
    });
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 8);
  }, [reviews]);

  // Most-used tags
  const tagCounts = useMemo(() => {
    const map = {};
    reviews.forEach((r) => r.tags.forEach((t) => (map[t] = (map[t] || 0) + 1)));
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
  }, [reviews]);

  const overallRating =
    reviews.length ? avg(reviews.map((r) => r.rating)) : null;

  if (!reviews.length) {
    return (
      <div className="container page">
        <PageHeading
          eyebrow="CAMPUS INTELLIGENCE"
          title="Campus Insights"
          description="Aggregated, anonymous statistics across the entire review dataset."
        />
        <div className="panel" style={{ textAlign: "center", padding: "3rem" }}>
          <Icon name="chart" size={40} />
          <p className="muted" style={{ marginTop: "1rem" }}>
            No reviews yet. Insights will appear once students start submitting
            reviews.
          </p>
          <Link className="button primary" to="/professors" style={{ marginTop: "1.5rem" }}>
            Browse professors <Icon name="arrow" size={17} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container page">
      <PageHeading
        eyebrow="CAMPUS INTELLIGENCE"
        title="Campus Insights"
        description="Aggregated, anonymous statistics across the entire review dataset."
      />

      {/* ── Summary stats ── */}
      <div className="admin-stats">
        <StatCard icon="users" value={reviews.length} label="Total reviews" />
        <StatCard icon="cap" value={professors.filter((p) => p.reviewCount > 0).length} label="Professors reviewed" />
        <StatCard icon="book" value={courses.filter((c) => c.reviewCount > 0).length} label="Courses reviewed" />
        <StatCard
          icon="star"
          value={overallRating !== null ? overallRating.toFixed(2) + " / 5" : "—"}
          label="Campus avg rating"
        />
      </div>

      {/* ── Rating dimensions ── */}
      {dimensionAverages.length > 0 && (
        <section className="panel" style={{ marginTop: "2rem" }}>
          <h3>Average scores across all reviews</h3>
          <p className="muted small" style={{ marginBottom: "1.25rem" }}>
            Campus-wide averages for each rating category.
          </p>
          <div>
            {dimensionAverages.map(({ label, value }) => (
              <RatingBar key={label} label={label} value={value} />
            ))}
          </div>
        </section>
      )}

      <div className="profile-grid secondary-grid" style={{ marginTop: "2rem" }}>
        {/* ── Top-rated professors ── */}
        {topProfessors.length > 0 && (
          <section className="panel">
            <h3>Top-rated professors</h3>
            <p className="muted small" style={{ marginBottom: "1rem" }}>
              Ranked by overall rating.
            </p>
            <ol className="insights-ranked-list">
              {topProfessors.map((p, i) => (
                <li key={p.id}>
                  <span className="rank-number">{i + 1}</span>
                  <div className="rank-info">
                    <Link to={`/professors/${p.id}`} className="text-link">
                      <strong>{p.name}</strong>
                    </Link>
                    <span className="muted small">{p.department}</span>
                  </div>
                  <div className="rank-rating">
                    <Stars value={p.rating} />
                    <span>{p.rating.toFixed(2)}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ── Most-reviewed professors ── */}
        {mostReviewed.length > 0 && (
          <section className="panel">
            <h3>Most reviewed</h3>
            <p className="muted small" style={{ marginBottom: "1rem" }}>
              Professors with the most student feedback.
            </p>
            <ol className="insights-ranked-list">
              {mostReviewed.map((p, i) => (
                <li key={p.id}>
                  <span className="rank-number">{i + 1}</span>
                  <div className="rank-info">
                    <Link to={`/professors/${p.id}`} className="text-link">
                      <strong>{p.name}</strong>
                    </Link>
                    <span className="muted small">{p.department}</span>
                  </div>
                  <span className="tag">
                    {p.reviewCount} review{p.reviewCount !== 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {/* ── Department breakdown ── */}
      {deptStats.length > 0 && (
        <section className="panel" style={{ marginTop: "2rem" }}>
          <h3>Reviews by department</h3>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Reviews</th>
                  <th>Avg rating</th>
                </tr>
              </thead>
              <tbody>
                {deptStats.map((d) => (
                  <tr key={d.name}>
                    <td>{d.name}</td>
                    <td>{d.count}</td>
                    <td>
                      <Stars value={d.rating} />{" "}
                      <span className="muted small">{d.rating.toFixed(2)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="profile-grid secondary-grid" style={{ marginTop: "2rem" }}>
        {/* ── Semester activity ── */}
        {semesterActivity.length > 0 && (
          <section className="panel">
            <h3>Reviews by semester</h3>
            <p className="muted small" style={{ marginBottom: "1rem" }}>
              Most recent semesters first.
            </p>
            <ol className="insights-ranked-list">
              {semesterActivity.map(([sem, count]) => (
                <li key={sem}>
                  <div className="rank-info">
                    <strong>{sem}</strong>
                  </div>
                  <span className="tag">{count}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ── Top tags ── */}
        {tagCounts.length > 0 && (
          <section className="panel">
            <h3>Most common tags</h3>
            <p className="muted small" style={{ marginBottom: "1rem" }}>
              Tags students used most frequently.
            </p>
            <ol className="insights-ranked-list">
              {tagCounts.map(([tag, count]) => (
                <li key={tag}>
                  <div className="rank-info">
                    <strong>{tag}</strong>
                  </div>
                  <span className="tag">{count}×</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
