import { useState } from "react";
import { useData } from "../context/DataContext.jsx";
import { Modal } from "../components/UI.jsx";
import Icon from "../components/Icon.jsx";

export default function DepartmentAdmin() {
  const { departmentRecords, professors, courses, saveCatalog, deleteCatalog } =
    useData();
  const [editing, setEditing] = useState(null),
    [deleting, setDeleting] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(e.target));
    try {
      await saveCatalog("departments", editing.id, body);
      setEditing(null);
      setMessage("Department saved in MongoDB.");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await deleteCatalog("departments", deleting.id);
      setDeleting(null);
      setMessage("Department removed from MongoDB.");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Departments</h2>
          <p>Keep the catalog organized by academic department.</p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setError("");
            setEditing({});
          }}
        >
          <Icon name="plus" size={17} />
          Add department
        </button>
      </div>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      <div className="table-wrapper admin-table">
        <table>
          <thead>
            <tr>
              <th>Department</th>
              <th>Code</th>
              <th>Catalog records</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {departmentRecords.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>{d.code}</td>
                <td>
                  {professors.filter((p) => p.departmentId === d.id).length}{" "}
                  professors ·{" "}
                  {courses.filter((c) => c.departmentId === d.id).length}{" "}
                  courses
                </td>
                <td>
                  <div className="table-actions">
                    <button
                      className="icon-button"
                      aria-label={`Edit ${d.name}`}
                      onClick={() => {
                        setError("");
                        setEditing(d);
                      }}
                    >
                      <Icon name="edit" size={17} />
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={`Delete ${d.name}`}
                      onClick={() => {
                        setError("");
                        setDeleting(d);
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
      </div>
      {editing && (
        <Modal
          title={`${editing.id ? "Edit" : "Add"} department`}
          onClose={() => !busy && setEditing(null)}
        >
          <form className="form-stack" onSubmit={save}>
            <label>
              Department name
              <input
                name="name"
                required
                maxLength={100}
                defaultValue={editing.name || ""}
              />
            </label>
            <label>
              Department code
              <input
                name="code"
                required
                maxLength={20}
                defaultValue={editing.code || ""}
                placeholder="CSE"
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                disabled={busy}
                className="button secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button disabled={busy} className="button primary">
                {busy ? "Saving…" : "Save department"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Remove department?"
          onClose={() => !busy && setDeleting(null)}
        >
          <p>
            Remove {deleting.name}? The database will reject this deletion if
            professors or courses still belong to it.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              disabled={busy}
              className="button secondary"
              onClick={() => setDeleting(null)}
            >
              Cancel
            </button>
            <button
              disabled={busy}
              className="button danger-button"
              onClick={remove}
            >
              {busy ? "Removing…" : "Remove department"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
