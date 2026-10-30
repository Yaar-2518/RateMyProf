import { useState } from "react";
import {
  Link,
  Avatar,
  SearchInput,
  DepartmentFilter,
  PageHeading,
  EmptyState,
} from "../components/UI.jsx";
import Icon from "../components/Icon.jsx";
import ProfessorCard from "../components/ProfessorCard.jsx";
import { useData } from "../context/DataContext.jsx";

export default function Directory({ type, params }) {
  const isCourse = type === "courses";
  const { professors, courses, departments } = useData();
  const [query, setQuery] = useState(params.get("q") || "");
  const [department, setDepartment] = useState(
    params.get("department") || "All Departments",
  );
  const [view, setView] = useState("list");
  const [visibleCount, setVisibleCount] = useState(24);
  const results = (isCourse ? courses : professors)
    .filter((item) => {
      const courseNames = !isCourse
        ? courses
            .filter((c) => item.courses.includes(c.id))
            .map((c) => `${c.name} ${c.code}`)
            .join(" ")
        : "";
      return (
        (department === "All Departments" || item.department === department) &&
        `${item.name} ${item.department} ${item.code || ""} ${courseNames}`
          .toLowerCase()
          .includes(query.toLowerCase().trim())
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="container page">
      <PageHeading
        eyebrow="FIND YOUR NEXT GREAT CLASS"
        title={isCourse ? "Explore courses" : "Find your professor"}
        description={
          isCourse
            ? "From the first lecture to the final project. Know what’s ahead."
            : "Honest perspectives to help you make your next academic choice."
        }
      />
      <div className="directory-tools">
        <SearchInput
          value={query}
          onChange={(value) => {
            setQuery(value);
            setVisibleCount(24);
          }}
          placeholder={
            isCourse
              ? "Search by course name, code, or department..."
              : "Search by professor, department, or course..."
          }
        />
        <label className="sort-label">
          Sort by
          <select aria-label="Sort results" value="name">
            <option value="name">Name (A–Z)</option>
          </select>
        </label>
      </div>
      <DepartmentFilter
        departments={
          isCourse
            ? [...new Set(courses.map((course) => course.department))]
            : departments
        }
        value={department}
        onChange={(value) => {
          setDepartment(value);
          setVisibleCount(24);
        }}
      />
      <div className="results-heading">
        <span>
          <strong>{results.length}</strong>{" "}
          {isCourse ? "courses" : "professors"}
          {department !== "All Departments"
            ? ` in ${department}`
            : " in the catalog"}
        </span>
        {!isCourse && (
          <div className="view-toggle">
            <button
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
              aria-label="List view"
              aria-pressed={view === "list"}
            >
              <Icon name="menu" size={18} />
            </button>
            <button
              className={view === "grid" ? "active" : ""}
              onClick={() => setView("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
            >
              <Icon name="grid" size={17} />
            </button>
          </div>
        )}
      </div>
      {!results.length ? (
        <EmptyState
          title={
            !isCourse && !professors.length
              ? "No professors added yet"
              : "No results found"
          }
          description={
            !isCourse && !professors.length
              ? "Professor profiles will appear here once they are added."
              : "Try another search or choose a different department."
          }
        >
          {(isCourse || professors.length > 0) && (
            <button
              className="button secondary"
              onClick={() => {
                setQuery("");
                setDepartment("All Departments");
              }}
            >
              Reset filters
            </button>
          )}
        </EmptyState>
      ) : isCourse ? (
        <div className="course-grid">
          {results.slice(0, visibleCount).map((c) => (
            <article className="course-card panel" key={c.id}>
              <div className="section-heading">
                <span className="course-icon">
                  <Icon name="book" size={23} />
                </span>
              </div>
              <div className="course-code">
                {c.code}{" "}
                <span>
                  ·{" "}
                  {c.credits === null
                    ? "Credits not specified"
                    : `${c.credits} credits`}
                </span>
              </div>
              <h3>
                <Link to={`/courses/${c.id}`}>{c.name}</Link>
              </h3>
              <p>
                {c.department} · {c.semester}
              </p>
              <div className="card-bottom">
                <span>
                  {c.reviewCount
                    ? `${c.reviewCount} review${c.reviewCount === 1 ? "" : "s"}`
                    : "No reviews yet"}
                </span>
                <Link className="text-link" to={`/courses/${c.id}`}>
                  Explore course <Icon name="arrow" size={16} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : view === "grid" ? (
        <div className="professor-grid">
          {results.slice(0, visibleCount).map((p) => (
            <ProfessorCard key={p.id} professor={p} />
          ))}
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="directory-table">
            <thead>
              <tr>
                <th>Professor</th>
                <th>Department</th>
                <th>Overall rating</th>
                <th>Reviews</th>
                <th>
                  <span className="sr-only">Profile</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {results.slice(0, visibleCount).map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link className="table-person" to={`/professors/${p.id}`}>
                      <Avatar professor={p} size="small-avatar" />
                      <span>
                        {p.name}
                        <small>{p.designation}</small>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <span className="department-label">{p.department}</span>
                  </td>
                  <td>
                    <span className="muted">
                      {p.rating === null
                        ? "Not rated"
                        : `${p.rating.toFixed(1)} / 5`}
                    </span>
                  </td>
                  <td className="muted">{p.reviewCount}</td>
                  <td>
                    <Link
                      className="icon-button"
                      to={`/professors/${p.id}`}
                      aria-label={`View ${p.name}`}
                    >
                      <Icon name="arrow" size={18} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visibleCount < results.length && (
        <div className="directory-more">
          <button
            className="button secondary"
            onClick={() => setVisibleCount((count) => count + 24)}
          >
            Show more ({Math.min(visibleCount, results.length)} of{" "}
            {results.length})
          </button>
        </div>
      )}
      <div className="directory-note">
        <Icon name="info" size={17} />
        <span>
          Reviews are individual perspectives. Use them as one part of your
          academic decision.
        </span>
      </div>
    </div>
  );
}
