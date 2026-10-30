// All browser requests go through this file. The browser sends an HttpOnly
// session cookie automatically; no password or login token goes in localStorage.
let csrf = null;
let sessionRequest = null;
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function clearSecurityToken() {
  csrf = null;
}
export function loadSession() {
  if (!sessionRequest)
    sessionRequest = request("/auth/session").finally(() => {
      sessionRequest = null;
    });
  return sessionRequest;
}
export async function request(
  path,
  { method = "GET", body } = {},
  retried = false,
) {
  if (method !== "GET" && !csrf) await loadSession();
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(
      "Cannot reach the backend. Ensure MongoDB is running and run npm run dev:server.",
      0,
      "NETWORK_ERROR",
    );
  }
  const data = await response.json().catch(() => null);
  if (!data)
    throw new ApiError(
      "The API is unavailable. Check that the backend is running on port 3000.",
      response.status,
      "INVALID_RESPONSE",
    );
  if (!response.ok) {
    if (data.error?.code === "INVALID_CSRF" && !retried) {
      clearSecurityToken();
      await loadSession();
      return request(path, { method, body }, true);
    }
    throw new ApiError(
      data.error?.message || "Request failed.",
      response.status,
      data.error?.code,
    );
  }
  if (data.csrfToken) csrf = data.csrfToken;
  return data;
}
