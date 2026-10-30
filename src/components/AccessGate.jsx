import { Link, EmptyState } from "./UI.jsx";
import Icon from "./Icon.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useData } from "../context/DataContext.jsx";
export function CatalogGate({ children }) {
  const { loading, error, refreshCatalog } = useData();
  if (loading)
    return (
      <div className="container page">
        <h1>Loading the campus catalog…</h1>
        <p className="muted" role="status">
          Getting professors, courses, and departments from MongoDB.
        </p>
      </div>
    );
  if (error)
    return (
      <div className="container page narrow">
        <h1>The catalog couldn’t load.</h1>
        <p className="form-error" role="alert">
          {error}
        </p>
        <button
          className="button primary"
          onClick={() => refreshCatalog({ showLoading: true }).catch(() => {})}
        >
          Try again
        </button>
      </div>
    );
  return children;
}
export function AccessGate({
  admin = false,
  returnTo = "/write-review",
  children,
}) {
  const { user, loading, error, refreshSession } = useAuth();
  if (loading)
    return (
      <div className="container page">
        <h1>Checking your session…</h1>
        <p className="muted" role="status">
          One moment.
        </p>
      </div>
    );
  if (error)
    return (
      <div className="container page narrow">
        <h1>Unable to check your session.</h1>
        <p className="form-error" role="alert">
          {error}
        </p>
        <button className="button primary" onClick={refreshSession}>
          Try again
        </button>
      </div>
    );
  if (!user)
    return (
      <div className="container page narrow">
        <h1>
          {admin
            ? "Administrator login required."
            : "Your campus perspective belongs here."}
        </h1>
        <EmptyState
          title={
            admin
              ? "Sign in to manage the catalog"
              : "Log in before sharing your perspective"
          }
          description="Use your account to continue."
        >
          <Link
            className="button primary"
            to={`/login?next=${encodeURIComponent(returnTo)}`}
          >
            Log in <Icon name="arrow" size={17} />
          </Link>
          {!admin && (
            <Link className="button secondary" to="/register">
              Create student account
            </Link>
          )}
        </EmptyState>
      </div>
    );
  if (admin && user.role !== "admin")
    return (
      <div className="container page narrow">
        <h1>Administrator access required.</h1>
        <p>Your student account can browse the catalog but cannot edit it.</p>
        <Link className="button secondary" to="/professors">
          Browse professors
        </Link>
      </div>
    );
  return children;
}
