import { useState, useEffect } from "react";
import { Link } from "./UI.jsx";
import Icon from "./Icon.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Layout({ route, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  async function signOut() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await logout();
      window.location.hash = "/";
    } catch (error) {
      setLogoutError(error.message);
    } finally {
      setLoggingOut(false);
    }
  }
  useEffect(() => setMenuOpen(false), [route]);
  const nav = [
    ["/", "Home"],
    ["/professors", "Professors"],
    ["/courses", "Courses"],
    ["/compare", "Compare"],
    ["/insights", "Insights"],
    ["/about", "About"],
  ];
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content").focus();
        }}
      >
        Skip to content
      </a>
      <header className="header">
        <div className="nav-container">
          <Link to="/" className="brand">
            <span className="brand-icon">
              <Icon name="cap" size={27} />
            </span>
            RateMyProf<span className="brand-dot">.</span>
          </Link>
          <nav
            aria-label="Main navigation"
            className={menuOpen ? "navigation open" : "navigation"}
          >
            {nav.map(([path, label]) => (
              <Link
                key={path}
                to={path}
                className={
                  (path === "/" ? route === "/" : route.startsWith(path))
                    ? "active"
                    : ""
                }
                aria-current={
                  (path === "/" ? route === "/" : route.startsWith(path))
                    ? "page"
                    : undefined
                }
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="nav-actions">
            {user ? (
              <div className="account-controls">
                <span className="account-email" title={user.email}>
                  {user.role === "admin" ? "Admin" : user.email}
                </span>
                <Link
                  className="my-profile-nav-link"
                  to="/my-profile"
                  title="View your profile and reviews"
                >
                  My Profile
                </Link>
                <Link
                  className="reset-password-nav-link"
                  to={`/forgot-password?email=${encodeURIComponent(user.email)}`}
                  title="Reset or change your account password"
                >
                  Reset password
                </Link>
                <button
                  className="logout-button"
                  disabled={loggingOut}
                  onClick={signOut}
                >
                  {loggingOut ? "…" : "Log out"}
                </button>
              </div>
            ) : (
              <div className="guest-controls">
                <Link className="login-link" to="/login">
                  Log in
                </Link>
                <Link
                  className="reset-password-nav-link"
                  to="/forgot-password"
                  title="Forgot or reset password"
                >
                  Reset password
                </Link>
              </div>
            )}
            <Link className="button primary compact" to="/write-review">
              Write a review <Icon name="edit" size={15} />
            </Link>
            <button
              className="icon-button menu-button"
              aria-label="Toggle navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Icon name={menuOpen ? "close" : "menu"} />
            </button>
          </div>
        </div>
      </header>
      {logoutError && (
        <p className="form-error container" role="alert">
          {logoutError}
        </p>
      )}
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <div className="container footer-content">
          <div className="footer-brand">
            <Link to="/" className="brand">
              <span className="brand-icon">
                <Icon name="cap" size={24} />
              </span>
              RateMyProf<span className="brand-dot">.</span>
            </Link>
            <p className="footer-tagline">
              Student-driven faculty & course perspective platform for National Institute of Technology Warangal.
            </p>
          </div>
          <div className="footer-columns">
            <div className="footer-col">
              <h4>Directory</h4>
              <Link to="/professors">Professors</Link>
              <Link to="/courses">Courses</Link>
              <Link to="/insights">Campus Insights</Link>
              <Link to="/write-review">Submit a Review</Link>
            </div>
            <div className="footer-col">
              <h4>Account</h4>
              {user ? (
                <>
                  <Link to="/my-profile">My Profile</Link>
                  <Link to={`/forgot-password?email=${encodeURIComponent(user.email)}`}>
                    Reset Password
                  </Link>
                  {user.role === "admin" && <Link to="/admin">Admin Panel</Link>}
                </>
              ) : (
                <>
                  <Link to="/login">Log in</Link>
                  <Link to="/register">Create an Account</Link>
                  <Link to="/forgot-password">Reset Password</Link>
                </>
              )}
            </div>
            <div className="footer-col">
              <h4>Community</h4>
              <Link to="/guidelines">Community Guidelines</Link>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/about">About Us</Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="container footer-bottom-inner">
            <span>© {new Date().getFullYear()} RateMyProf NIT Warangal · Anonymous student perspectives.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
