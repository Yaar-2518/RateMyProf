import { useState, useEffect } from "react";
import { Link } from "../components/UI.jsx";
import Icon from "../components/Icon.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { request } from "../services/api.js";
function safeDestination(value) {
  return value?.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("://")
    ? value
    : "/professors";
}
export default function Auth({ mode, params }) {
  const register = mode === "register",
    forgot = mode === "forgot-password",
    reset = mode === "reset-password";
  const {
    login,
    googleLogin,
    resetPassword,
    loading,
    error: connectionError,
    refreshSession,
    studentDomains,
    mailMode,
    googleClientId,
  } = useAuth();
  const [email, setEmail] = useState(params.get("email") || ""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState("");
  const [agreed, setAgreed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [errorCode, setErrorCode] = useState(""),
    [complete, setComplete] = useState(false),
    [gsiRendered, setGsiRendered] = useState(false),
    [regStep, setRegStep] = useState("form"), // "form" | "otp"
    [cooldown, setCooldown] = useState(0);

  // Reset registration step if mode or email param changes
  useEffect(() => {
    setRegStep("form");
    setError("");
    setMessage("");
    setCode("");
  }, [mode]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (forgot || reset || (register && regStep === "otp")) return;
    if (!googleClientId || !window.google?.accounts?.id) return;
    try {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          if (!response?.credential) return;
          setError("");
          setBusy(true);
          try {
            const user = await googleLogin(response.credential);
            window.location.hash = safeDestination(
              params.get("next") ||
                (user.role === "admin" ? "/admin" : "/professors"),
            );
          } catch (failure) {
            setError(failure.message);
            setErrorCode(failure.code);
          } finally {
            setBusy(false);
          }
        },
      });
      const el = document.getElementById("google-signin-btn");
      if (el) {
        window.google.accounts.id.renderButton(el, {
          theme: "outline",
          size: "large",
          width: 320,
          text: register ? "signup_with" : "signin_with",
          shape: "rectangular",
        });
        setGsiRendered(true);
      }
    } catch (e) {
      console.warn("Google Sign-In initialization failed:", e);
    }
  }, [googleClientId, register, forgot, reset, regStep]);

  async function handleGoogleClick() {
    if (!googleClientId) {
      setError(
        "Google OAuth is not configured on this server. Add GOOGLE_CLIENT_ID to your .env file to enable Google Sign-In.",
      );
      return;
    }
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      setError("Google Sign-In is still loading or blocked by your browser.");
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setErrorCode("");
    setMessage("");
    setBusy(true);

    try {
      if (register) {
        const cleanEmail = email.trim().toLowerCase();
        if (regStep === "form") {
          // Validate student email domain
          const domain = cleanEmail.split("@")[1];
          if (!studentDomains.includes(domain)) {
            setError(
              `Registration is restricted to student emails (${studentDomains.join(", ")}).`,
            );
            setBusy(false);
            return;
          }
          if (password.length < 12) {
            setError("Password must contain at least 12 characters.");
            setBusy(false);
            return;
          }
          if (!agreed) {
            setError("Please agree to the community guidelines before registering.");
            setBusy(false);
            return;
          }

          // Step 1: Send OTP to verify student email
          const otpRes = await request("/auth/send-otp", {
            method: "POST",
            body: { email: cleanEmail },
          });
          setMessage(otpRes.message || `A verification code was sent to ${cleanEmail}.`);
          setRegStep("otp");
          setCooldown(60);
        } else {
          // Step 2: Verify OTP and create account
          if (!/^\d{6}$/.test(code.trim())) {
            setError("Please enter the complete 6-digit verification code.");
            setBusy(false);
            return;
          }

          // 1. Verify OTP
          await request("/auth/verify-otp", {
            method: "POST",
            body: { email: cleanEmail, code: code.trim() },
          });

          // 2. Register Account
          const result = await request("/auth/register", {
            method: "POST",
            body: { email: cleanEmail, password, agreed: true },
          });

          // 3. Auto-login immediately
          try {
            const user = await login(cleanEmail, password);
            window.location.hash = safeDestination(
              params.get("next") ||
                (user.role === "admin" ? "/admin" : "/professors"),
            );
          } catch {
            setMessage(result.message);
            setComplete(true);
          }
        }
      } else if (forgot) {
        await request("/auth/forgot-password", {
          method: "POST",
          body: { email },
        });
        window.location.hash = `/reset-password?email=${encodeURIComponent(email)}`;
      } else if (reset) {
        const result = await resetPassword({ email, code: code.trim(), password });
        setMessage(result.message);
        setComplete(true);
      } else {
        const user = await login(email, password);
        window.location.hash = safeDestination(
          params.get("next") ||
            (user.role === "admin" ? "/admin" : "/professors"),
        );
      }
    } catch (failure) {
      setError(failure.message);
      setErrorCode(failure.code);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (register) {
        const cleanEmail = email.trim().toLowerCase();
        const result = await request("/auth/send-otp", {
          method: "POST",
          body: { email: cleanEmail },
        });
        setMessage(result.message || "A new verification code has been sent.");
        setCooldown(60);
      } else {
        const result = await request("/auth/forgot-password", {
          method: "POST",
          body: { email },
        });
        setMessage(result.message);
        setCooldown(60);
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const title =
    reset
      ? "Reset your password"
      : forgot
        ? "Recover your account"
        : register
          ? regStep === "otp"
            ? "Verify your student email"
            : "Join the NITW community"
          : "Good to see you again.";

  return (
    <div className="container auth-page">
      <section className="auth-story">
        <div className="eyebrow">FOR THE PEOPLE BEHIND THE PERSPECTIVES</div>
        <h1>
          Your voice matters.
          <br />
          <span className="serif">Your name stays yours.</span>
        </h1>
        <p>
          Create an account with your official student email. Keep your
          personal information completely separate from your anonymous reviews.
        </p>
        <div className="auth-benefits">
          {[
            [
              "cap",
              "A campus community",
              "Registration requires verified @student.nitw.ac.in emails.",
            ],
            [
              "shield",
              "Private account information",
              "Your identity is never linked to or displayed on public reviews.",
            ],
            [
              "book",
              "Better choices, together",
              "Explore professors, courses, and genuine feedback each semester.",
            ],
          ].map(([icon, name, text]) => (
            <div key={icon}>
              <span className="icon-tile">
                <Icon name={icon} size={22} />
              </span>
              <div>
                <strong>{name}</strong>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="auth-illustration" aria-hidden="true">
          <span>✳</span>
          <span>
            Learning is better
            <br />
            <i>when we share.</i>
          </span>
        </div>
      </section>
      <section className="panel auth-card">
        <div className="eyebrow">
          {reset || forgot
            ? "PASSWORD RECOVERY"
            : register
              ? regStep === "otp"
                ? "EMAIL VERIFICATION"
                : "JOIN THE COMMUNITY"
              : "WELCOME BACK"}
        </div>
        <h2>{title}</h2>
        <p className="muted">
          {reset
            ? "Enter the 6-digit code sent to your email along with your new password."
            : forgot
              ? "Enter your account email to receive a 6-digit password reset code."
              : register
                ? regStep === "otp"
                  ? `We sent a 6-digit code to ${email}. Enter it below to complete registration.`
                  : `Sign up with an official student email from ${studentDomains.join(", ")}.`
                : "Log in with your student or administrator credentials."}
        </p>

        {mailMode === "file" && (forgot || reset || (register && regStep === "otp")) && (
          <div className="auth-preview">
            <Icon name="info" size={16} />
            <span>
              Local development mode: OTP codes are saved under{" "}
              <code>.local/mail/</code>. Open the latest JSON file to read your code.
            </span>
          </div>
        )}

        {connectionError && (
          <>
            <p className="form-error" role="alert">
              {connectionError}
            </p>
            <button
              type="button"
              className="button secondary"
              onClick={refreshSession}
            >
              Reconnect
            </button>
          </>
        )}

        {complete ? (
          <div className="auth-complete">
            <span className="success-icon">
              <Icon name="check" size={30} />
            </span>
            <h3>
              {register
                ? "Your account is ready."
                : "Your password has been changed."}
            </h3>
            <p>{message || "Operation completed successfully. Log in to continue."}</p>
            <Link
              to={`/login?email=${encodeURIComponent(email)}`}
              className="button primary"
            >
              Continue to login <Icon name="arrow" size={17} />
            </Link>
          </div>
        ) : (
          <>
            {!forgot && !reset && regStep === "form" && (
              <>
                <div className="google-button-wrapper">
                  <div id="google-signin-btn" />
                  {!gsiRendered && (
                    <button
                      type="button"
                      className="button-google"
                      disabled={busy || loading || Boolean(connectionError)}
                      onClick={handleGoogleClick}
                    >
                      <Icon name="google" size={18} />
                      {register
                        ? "Sign up with Google (@student.nitw.ac.in)"
                        : "Sign in with Google"}
                    </button>
                  )}
                </div>
                <div className="auth-divider">
                  <span>or with email & password</span>
                </div>
              </>
            )}

            <form className="form-stack" onSubmit={submit}>
              {/* Registration OTP Step */}
              {register && regStep === "otp" ? (
                <>
                  <label>
                    Six-digit verification code
                    <input
                      aria-label="Verification code"
                      className="otp-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      autoFocus
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                    />
                  </label>
                  <div className="otp-meta-note">
                    Code sent to <strong>{email}</strong>
                  </div>
                </>
              ) : (
                <>
                  {/* Standard Email input */}
                  <label>
                    {register ? "Student email" : "Email"}
                    <div className="input-with-icon">
                      <Icon name="mail" size={18} />
                      <input
                        aria-label={register ? "Student email" : "Email"}
                        type="email"
                        required
                        maxLength={254}
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={`you@${studentDomains[0]}`}
                      />
                    </div>
                  </label>

                  {/* Reset Password 6-digit code input */}
                  {reset && (
                    <label>
                      Six-digit reset code
                      <input
                        aria-label="Reset code"
                        className="otp-input"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                        placeholder="000000"
                      />
                    </label>
                  )}

                  {/* Password input */}
                  {!forgot && (
                    <label>
                      {reset ? "New password" : "Password"}
                      <div className="input-with-icon">
                        <Icon name="lock" size={18} />
                        <input
                          aria-label={reset ? "New password" : "Password"}
                          type="password"
                          minLength={register || reset ? 12 : 1}
                          maxLength={128}
                          required
                          autoComplete={
                            register || reset ? "new-password" : "current-password"
                          }
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={
                            register || reset
                              ? "At least 12 characters"
                              : "Your account password"
                          }
                        />
                      </div>
                    </label>
                  )}

                  {/* Registration community guidelines */}
                  {register && (
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        required
                        checked={agreed}
                        onChange={(e) => setAgreed(e.target.checked)}
                      />
                      <span>
                        I agree to the{" "}
                        <Link to="/guidelines">community guidelines</Link> and{" "}
                        <Link to="/privacy">privacy policy</Link>.
                      </span>
                    </label>
                  )}
                </>
              )}

              {/* Prominent Reset Password Link on Login Form */}
              {!register && !forgot && !reset && (
                <div className="forgot-password-box">
                  <span>Forgot your password?</span>
                  <Link to="/forgot-password" className="reset-password-action-link">
                    Reset password →
                  </Link>
                </div>
              )}

              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              {errorCode === "ACCOUNT_EXISTS" && (
                <Link
                  className="text-link"
                  to={`/login?email=${encodeURIComponent(email)}`}
                >
                  Sign in to your existing account
                </Link>
              )}
              {message && (
                <p className="form-message" role="status">
                  {message}
                </p>
              )}

              {/* Primary Action Button */}
              <button
                className="button primary full-width"
                disabled={busy || loading || Boolean(connectionError)}
                type="submit"
              >
                {busy
                  ? "Please wait…"
                  : reset
                    ? "Set new password"
                    : forgot
                      ? "Send reset code"
                      : register
                        ? regStep === "otp"
                          ? "Verify & Create account"
                          : "Send verification code"
                        : "Log in"}
                <Icon name="arrow" size={18} />
              </button>

              {/* Secondary action: Resend / Back for OTP */}
              {((register && regStep === "otp") || reset) && (
                <div className="otp-actions-row">
                  <button
                    type="button"
                    disabled={busy || loading || Boolean(connectionError) || cooldown > 0}
                    className="text-link"
                    onClick={resend}
                  >
                    {cooldown > 0 ? `Resend code (${cooldown}s)` : "Resend code"}
                  </button>
                  {register && regStep === "otp" && (
                    <button
                      type="button"
                      className="text-link text-muted"
                      onClick={() => {
                        setRegStep("form");
                        setError("");
                        setMessage("");
                      }}
                    >
                      ← Change email
                    </button>
                  )}
                </div>
              )}
            </form>
          </>
        )}

        {/* Bottom Switch Links */}
        <div className="auth-switch">
          {forgot || reset ? (
            <Link to="/login">← Back to login</Link>
          ) : register ? (
            <>
              Already have an account? <Link to="/login">Log in</Link>
              <span className="auth-switch-dot">·</span>
              <Link to="/forgot-password">Reset password</Link>
            </>
          ) : (
            <>
              New here? <Link to="/register">Create an account</Link>
              <span className="auth-switch-dot">·</span>
              <Link to="/forgot-password">Reset password</Link>
            </>
          )}
        </div>
        <div className="auth-lock">
          <Icon name="lock" size={14} />
          Secure session using private HttpOnly cookies & CSRF tokens.
        </div>
      </section>
    </div>
  );
}
