import { createContext, useContext, useEffect, useState } from "react";
import { request, loadSession, clearSecurityToken } from "../services/api.js";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [studentDomains, setStudentDomains] = useState(["student.nitw.ac.in"]),
    [mailMode, setMailMode] = useState(""),
    [googleClientId, setGoogleClientId] = useState("");
  async function refreshSession() {
    setLoading(true);
    setError("");
    try {
      const result = await loadSession();
      setUser(result.user);
      setStudentDomains(result.studentDomains);
      setMailMode(result.mailMode);
      setGoogleClientId(result.googleClientId || "");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refreshSession();
  }, []);
  useEffect(() => {
    const onFocus = () =>
      loadSession()
        .then((result) => setUser(result.user))
        .catch(() => {});
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  async function login(email, password) {
    const result = await request("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setUser(result.user);
    return result.user;
  }
  async function googleLogin(idToken) {
    const result = await request("/auth/google", {
      method: "POST",
      body: { idToken },
    });
    setUser(result.user);
    return result.user;
  }
  async function logout() {
    await request("/auth/logout", { method: "POST" });
    clearSecurityToken();
    setUser(null);
  }
  async function resetPassword(body) {
    const result = await request("/auth/reset-password", {
      method: "POST",
      body,
    });
    clearSecurityToken();
    setUser(null);
    return result;
  }
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        studentDomains,
        mailMode,
        googleClientId,
        refreshSession,
        login,
        googleLogin,
        logout,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  return useContext(AuthContext);
}
