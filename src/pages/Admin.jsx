import { useState, useEffect } from "react";
import {
  Link,
  PageHeading,
  Avatar,
  SearchInput,
  Modal,
  EmptyState,
} from "../components/UI.jsx";
import Icon from "../components/Icon.jsx";
import ModerationQueue from "../components/ModerationQueue.jsx";
import DepartmentAdmin from "./DepartmentAdmin.jsx";
import { useData } from "../context/DataContext.jsx";

const links = [
  ["/admin", "grid", "Overview"],
  ["/admin/professors", "cap", "Professors"],
  ["/admin/courses", "book", "Courses"],
  ["/admin/departments", "grid", "Departments"],
  ["/admin/moderation", "shield", "Moderation"],
];
export default function Admin({ section = "overview" }) {
  const {
    professors,
    departments,
    saveCatalog,
    deleteCatalog,
    courses,
    reviews,
    reports,
    refreshReports,
    resolveReport,
    deleteReview,
  } = useData();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  // Load reports from the API when the admin opens the moderation section
  useEffect(() => {
    if (section === "moderation") refreshReports();
  }, [section]);
  const isCourse = section === "courses";
  const catalog = isCourse ? courses : professors;
  const filtered = catalog.filter((p) =>
    `${p.name} ${p.department} ${p.code || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  async function save(e) {
    e.preventDefault();
    setFormError("");
    setBusy(true);
    const form = new FormData(e.target);
    const values = Object.fromEntries(form);
    const body = isCourse
      ? {
          name: values.name,
          department: values.department,
          code: values.code,
          credits: values.credits === "" ? null : Number(values.credits),
          semester: values.semester,
          description: values.description,
        }
      : {
          name: values.name,
          department: values.department,
          designation: values.designation,
          office: values.office,
          bio: values.bio,
          courses: form.getAll("courses"),
        };
    try {
      await saveCatalog(isCourse ? "courses" : "professors", editing.id, body);
      setFeedback(
        `${values.name} ${editing.id ? "updated" : "added"} in MongoDB.`,
      );
      setEditing(null);
    } catch (failure) {
      setFormError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setFormError("");
    setBusy(true);
    try {
      await deleteCatalog(isCourse ? "courses" : "professors", deleting.id);
      setFeedback(`${deleting.name} removed from MongoDB.`);
      setDeleting(null);
    } catch (failure) {
      setFormError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function handleResolveReport(report, action) {
    setFeedback("");
    setBusy(true);
    try {
      await resolveReport(report.id, action);
      setFeedback(
        action === "remove"
          ? `Review removed and report closed.`
          : "Report dismissed.",
      );
    } catch (err) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }
  async function handleDeleteReview(reviewId) {
    setFeedback("");
    setBusy(true);
    try {
      await deleteReview(reviewId);
      setFeedback("Review removed from public pages; moderation history retained.");
    } catch (err) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page">
      <PageHeading
        eyebrow="BEHIND A BETTER CAMPUS EXPERIENCE"
        title="Administration"
        description="Manage the catalog, screen incoming reviews, and resolve reports."
      />
      <div className="notice">
        <Icon name="info" size={18} />
        <span>
          Catalog changes are saved in MongoDB. This workspace requires an
          authenticated administrator account. Reviews are saved in MongoDB.
          New reviews require screening and human approval before publication.
        </span>
      </div>
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <span className="eyebrow">WORKSPACE</span>
          {links.map(([to, icon, title]) => (
            <Link
              key={to}
              to={to}
              className={
                section === (to.split("/")[2] || "overview") ? "active" : ""
              }
            >
              <Icon name={icon} size={19} />
              {title}
              {title === "Moderation" && (
                <span className="queue-count">
                  {reports.filter((r) => r.status === "Pending").length}
                </span>
              )}
            </Link>
          ))}
          <div className="admin-sidebar-note">
            <Icon name="shield" size={21} />
            <p>
              A trusted space starts with a thoughtful catalog and fair
              moderation.
            </p>
          </div>
        </aside>
        <div className="admin-content">
          {feedback && (
            <div className="form-message dismissible" role="status">
              {feedback}
              <button
                className="icon-button"
                onClick={() => setFeedback("")}
                aria-label="Dismiss message"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {section === "overview" && (
            <>
              <div className="admin-stats">
                {[
                  ["cap", professors.length, "Professors"],
                  ["book", courses.length, "Courses"],
                  ["users", reviews.length, "Reviews"],
                  [
                    "flag",
                    reports.filter((r) => r.status === "Pending").length,
                    "Pending reports",
                  ],
                ].map(([icon, count, name]) => (
                  <section className="panel insight-stat" key={icon}>
                    <Icon name={icon} size={22} />
                    <strong>{count}</strong>
                    <p>{name}</p>
                  </section>
                ))}
              </div>
              <section className="panel">
                <h3>Your catalog at a glance</h3>
                <div className="department-chart">
                  {departments.map((d) => (
                    <div className="admin-department" key={d}>
                      <span>{d}</span>
                      <span>
                        {professors.filter((p) => p.department === d).length}{" "}
                        professors
                      </span>
                      <span>
                        {courses.filter((c) => c.department === d).length}{" "}
                        courses
                      </span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel admin-get-started">
                <span className="icon-tile">
                  <Icon name="edit" size={24} />
                </span>
                <div>
                  <h3>Start with the foundations.</h3>
                  <p>
                    Add professors, courses, and their relationships. Your
                    catalog changes are saved in MongoDB and survive a browser
                    refresh.
                  </p>
                </div>
                <Link to="/admin/professors" className="button secondary">
                  Manage catalog <Icon name="arrow" size={17} />
                </Link>
              </section>
            </>
          )}
          {(section === "professors" || section === "courses") && (
            <>
              <div className="section-heading">
                <div>
                  <h2>{isCourse ? "Course catalog" : "Professor catalog"}</h2>
                  <p>{catalog.length} records in MongoDB</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    setFormError("");
                    setEditing({});
                  }}
                >
                  <Icon name="plus" size={17} />
                  Add {isCourse ? "course" : "professor"}
                </button>
              </div>
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder={`Search ${section}...`}
              />
              <div className="table-wrapper admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>{isCourse ? "Course" : "Professor"}</th>
                      <th>Department</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <Link
                            to={`/${section}/${item.id}`}
                            className="table-person"
                          >
                            {!isCourse && (
                              <Avatar professor={item} size="small-avatar" />
                            )}
                            <span>
                              {item.name}
                              <small>
                                {isCourse
                                  ? `${item.code} · ${item.credits} credits`
                                  : item.designation}
                              </small>
                            </span>
                          </Link>
                        </td>
                        <td>{item.department}</td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="icon-button"
                              aria-label={`Edit ${item.name}`}
                              onClick={() => {
                                setFormError("");
                                setEditing(item);
                              }}
                            >
                              <Icon name="edit" size={17} />
                            </button>
                            <button
                              className="icon-button danger"
                              aria-label={`Delete ${item.name}`}
                              onClick={() => {
                                setFormError("");
                                setDeleting(item);
                              }}
                            >
                              <Icon name="trash" size={17} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filtered.length && <EmptyState />}
              </div>
            </>
          )}
          {section === "departments" && <DepartmentAdmin />}
          {section === "moderation" && (
            <>
              <ModerationQueue />
              <div className="section-heading">
                <div>
                  <h2>A thoughtful review queue</h2>
                  <p>
                    Reports submitted by students appear here.
                  </p>
                </div>
                <span className="tag">
                  {reports.filter((r) => r.status === "Pending").length} pending
                </span>
              </div>
              {!reports.length ? (
                <div className="panel">
                  <EmptyState
                    title="The queue is all clear."
                    description="To explore this workflow, report a review from any professor profile."
                  >
                    <Link className="button secondary" to="/professors">
                      Browse professors <Icon name="arrow" size={17} />
                    </Link>
                  </EmptyState>
                </div>
              ) : (
                <div className="moderation-list">
                  {reports.map((report) => {
                    const review = reviews.find(
                      (r) => r.id === report.reviewId,
                    );
                    return (
                      <section className="panel" key={report.id}>
                        <div className="section-heading">
                          <h3>{report.reason}</h3>
                          <span
                            className={`tag ${report.status === "Pending" ? "warm" : ""}`}
                          >
                            {report.status}
                          </span>
                        </div>
                        <p className="muted small">
                          {professors.find((p) => p.id === (review?.professorId ?? report.professorId))
                            ?.name || "Removed review"}{" "}
                          · Anonymous student · {report.date}
                        </p>
                        <blockquote>
                          {review?.text || report.reviewText ||
                            "This review has been removed."}
                        </blockquote>
                        {report.details && (
                          <p>
                            <strong>Context: </strong>
                            {report.details}
                          </p>
                        )}
                        {report.status === "Pending" && (
                          <div className="form-actions">
                            <button
                              className="button secondary"
                              disabled={busy}
                              onClick={() => handleResolveReport(report, "dismiss")}
                            >
                              Dismiss report
                            </button>
                            <button
                              className="button danger-button"
                              disabled={busy}
                              onClick={() => handleResolveReport(report, "remove")}
                            >
                              <Icon name="trash" size={16} />
                              Remove review
                            </button>
                          </div>
                        )}
                        {report.status !== "Pending" && review && (
                          <div className="form-actions">
                            <button
                              className="button danger-button"
                              disabled={busy}
                              onClick={() => handleDeleteReview(review.id)}
                            >
                              <Icon name="trash" size={16} />
                              Delete review directly
                            </button>
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {editing && (
        <Modal
          title={`${editing.id ? "Edit" : "Add"} ${isCourse ? "course" : "professor"}`}
          onClose={() => !busy && setEditing(null)}
        >
          <form className="form-stack" onSubmit={save}>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <label>
              {isCourse ? "Course name" : "Full name"}
              <input
                name="name"
                required
                maxLength={100}
                defaultValue={editing.name || ""}
                placeholder={
                  isCourse ? "Database Management Systems" : "Dr. Full Name"
                }
              />
            </label>
            <label>
              Department
              <select
                aria-label="Department"
                name="department"
                defaultValue={editing.department || departments[0]}
              >
                {departments.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            {isCourse ? (
              <>
                <div className="form-grid">
                  <label>
                    Course code
                    <input
                      name="code"
                      required
                      maxLength={20}
                      defaultValue={editing.code || ""}
                      placeholder="CS1206"
                    />
                  </label>
                  <label>
                    Credits
                    <input
                      name="credits"
                      type="number"
                      min={0}
                      step={0.5}
                      max={10}
                      defaultValue={editing.credits ?? ""}
                    />
                  </label>
                </div>
                <label>
                  Semester
                  <select
                    aria-label="Semester"
                    name="semester"
                    defaultValue={editing.semester || "Semester 1"}
                  >
                    {Array.from({ length: 8 }, (_, i) => (
                      <option key={i}>Semester {i + 1}</option>
                    ))}
                    <option>Semester 7 or 8</option>
                    <option>Not specified</option>
                  </select>
                </label>
                <label>
                  Description
                  <textarea
                    rows={3}
                    name="description"
                    maxLength={1000}
                    defaultValue={editing.description || ""}
                  />
                </label>
                <p className="muted small">
                  Assign professors to this course from the professor editor.
                </p>
              </>
            ) : (
              <>
                <label>
                  Designation
                  <select
                    aria-label="Designation"
                    name="designation"
                    defaultValue={editing.designation || "Assistant Professor"}
                  >
                    {editing.designation &&
                      ![
                        "Professor",
                        "Associate Professor",
                        "Assistant Professor",
                      ].includes(editing.designation) && (
                        <option>{editing.designation}</option>
                      )}
                    {[
                      "Professor",
                      "Associate Professor",
                      "Assistant Professor",
                    ].map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Office location
                  <input
                    name="office"
                    maxLength={100}
                    defaultValue={editing.office || ""}
                    placeholder="Block, room number"
                  />
                </label>
                <label>
                  About
                  <textarea
                    rows={2}
                    name="bio"
                    maxLength={1000}
                    defaultValue={editing.bio || ""}
                  />
                </label>
                <fieldset className="course-checkboxes">
                  <legend>Courses taught</legend>
                  {courses.map((c) => (
                    <label key={c.id} className="checkbox-label">
                      <input
                        type="checkbox"
                        name="courses"
                        value={c.id}
                        defaultChecked={editing.courses?.includes(c.id)}
                      />
                      {c.code} · {c.name}
                    </label>
                  ))}
                </fieldset>
              </>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Saving…" : `Save ${isCourse ? "course" : "professor"}`}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Remove from the catalog?"
          onClose={() => !busy && setDeleting(null)}
        >
          <p>
            Remove <strong>{deleting.name}</strong> from MongoDB? Its
            professor–course links will also be removed. This change persists
            after refresh.
          </p>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Keep record
            </button>
            <button
              className="button danger-button"
              disabled={busy}
              onClick={remove}
            >
              {busy ? "Removing…" : "Remove record"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
