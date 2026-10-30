import { HttpError } from "../lib/errors.js";
import { safeEqual, randomSecret } from "../lib/security.js";
export function csrfToken(req) {
  req.session.csrfToken ||= randomSecret();
  return req.session.csrfToken;
}
export function protectMutations(config) {
  return (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (req.headers.origin && req.headers.origin !== config.origin)
      return next(
        new HttpError(403, "Request origin is not allowed.", "INVALID_ORIGIN"),
      );
    if (!safeEqual(req.session.csrfToken, req.headers["x-csrf-token"]))
      return next(
        new HttpError(
          403,
          "Your security token expired. Refresh the page and try again.",
          "INVALID_CSRF",
        ),
      );
    next();
  };
}
export function loadUser(db) {
  return async (req, res, next) => {
    req.user = null;
    if (req.session.userId) {
      const user = await db
        .collection("users")
        .findOne(
          { _id: req.session.userId },
          { projection: { _id: 1, email: 1, role: 1, session_version: 1 } },
        );
      if (user && user.session_version === req.session.version) {
        // Map _id to id for consistency with existing API responses.
        req.user = {
          id: user._id,
          email: user.email,
          role: user.role,
          session_version: user.session_version,
        };
      } else {
        delete req.session.userId;
        delete req.session.version;
      }
    }
    next();
  };
}
export function publicUser(user) {
  return user
    ? {
        id: user.id,
        email: user.email,
        role: user.role,
      }
    : null;
}
export function requireAccount(req, res, next) {
  if (!req.user)
    return next(
      new HttpError(401, "Please log in to continue.", "LOGIN_REQUIRED"),
    );
  next();
}
export function requireAdmin(req, res, next) {
  requireAccount(req, res, (error) => {
    if (error) return next(error);
    if (req.user.role !== "admin")
      return next(
        new HttpError(
          403,
          "Administrator access is required.",
          "ADMIN_REQUIRED",
        ),
      );
    next();
  });
}
