import SearchSelect from "../components/SearchSelect.jsx";
import { courseOptions, professorOptions } from "../lib/searchOptions.js";
import { useEffect, useState } from "react";
import { useData } from "../context/DataContext.jsx";
import { request } from "../services/api.js";
import { PageHeading, Link, EmptyState } from "../components/UI.jsx";

export default function Compare({ params }) {
  const { courses, professors, reviews } = useData();
  const [courseId, setCourseId] = useState(params.get("course") || "");
  const [selected, setSelected] = useState([]);
  const [semester, setSemester] = useState("");
  const [result, setResult] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { setResult(null); setError(""); }, [courseId, selected, semester]);
  const eligible = professors.filter(p => p.courses.includes(courseId));
  const semesters = [...new Set(reviews.filter(r => r.courseId === courseId).map(r => r.semester))].sort();
  async function compare(e) {
    e.preventDefault(); setBusy(true); setError(""); setResult(null);
    try {
      const query = new URLSearchParams({ course: courseId, professors: selected.join(","), semester });
      setResult(await request(`/compare?${query}`));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <div className="container page">
    <PageHeading eyebrow="SAME COURSE. DIFFERENT PERSPECTIVES." title="Compare professors" description="Compare published student feedback for the same course. Choose two or three professors." />
    <form className="panel form-stack" onSubmit={compare}>
      <SearchSelect label="Course" value={courseId} disabled={busy} required
        options={courseOptions(courses)} placeholder="Type a course name or code…"
        onChange={value => { setCourseId(value); setSelected([]); setSemester(""); }} />
      {courseId && <fieldset className="comparison-choices"><legend>Professors teaching this course ({selected.length}/3)</legend>
        {eligible.length < 2 ? <p className="muted">At least two verified teaching assignments are needed to compare this course.</p> : <>
          <div className="comparison-selected">{selected.map(id => <span className="comparison-person" key={id}>
            {eligible.find(p => p.id === id)?.name}
            <button type="button" className="icon-button" disabled={busy} aria-label={`Remove ${eligible.find(p => p.id === id)?.name}`} onClick={() => setSelected(prev => prev.filter(value => value !== id))}>×</button>
          </span>)}</div>
          <SearchSelect key={courseId} label="Add a professor" clearOnSelect
            options={professorOptions(eligible.filter(p => !selected.includes(p.id)))}
            disabled={busy || selected.length >= 3} placeholder={selected.length >= 3 ? "Three professors selected" : "Type a professor’s name…"}
            onChange={id => { if (id) setSelected(prev => prev.includes(id) || prev.length >= 3 ? prev : [...prev, id]); }} />
        </>}
      </fieldset>}
      <label>Semester<select value={semester} disabled={busy} onChange={e => setSemester(e.target.value)}><option value="">All semesters</option>{semesters.map(s => <option key={s}>{s}</option>)}</select></label>
      <button className="button primary" disabled={busy || selected.length < 2}>{busy ? "Comparing…" : "Compare selected professors"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
    {result && <section className="comparison-results" aria-live="polite">
      <div className="section-heading"><h2>{result.course.code} · {result.course.name}</h2><span className="tag">{result.semester || "All semesters"}</span></div>
      <p className="muted">Scores are calculated from published reviews for this course. Fewer than {result.minimumReviews} reviews is marked as limited data. Higher workload scores are student ratings, not a measured number of hours.</p>
      <div className="table-wrapper"><table className="comparison-table"><thead><tr><th scope="col">Metric</th>{result.professors.map(p => <th scope="col" key={p.id}><Link to={`/professors/${p.id}`}>{p.name}</Link></th>)}</tr></thead>
        <tbody><tr><th scope="row">Published reviews</th>{result.professors.map(p => <td key={p.id}>{p.reviewCount}{!p.sufficientData && <span className="small muted"> · Limited data</span>}</td>)}</tr>
          {result.labels.map((label, i) => <tr key={label}><th scope="row">{label}</th>{result.professors.map(p => <td key={p.id}>{p.averages[i] === null ? "No reviews" : `${p.averages[i].toFixed(2)} / 5`}</td>)}</tr>)}
        </tbody></table></div>
      {result.professors.every(p => !p.reviewCount) && <EmptyState title="No published feedback yet" description="Scores will appear after student reviews are approved." />}
    </section>}
  </div>;
}
