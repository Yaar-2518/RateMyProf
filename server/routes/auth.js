import { Router } from "express";
import { promisify } from "node:util";
import { csrfToken, publicUser, requireAccount } from "../middleware/auth.js";
import { id } from "../lib/validation.js";

export function authRoutes(auth, config) {
  const router = Router();
  router.get("/session", (req, res) =>
    res.json({
      user: publicUser(req.user),
      csrfToken: csrfToken(req),
      studentDomains: config.domains,
      mailMode: config.production ? "smtp" : config.mail.mode,
      googleClientId: config.googleClientId || null,
    }),
  );
  router.post("/register", async (req, res) =>
    res.status(201).json(await auth.register(req.body)),
  );
  router.post("/login", async (req, res) => {
    const user = await auth.login(req.body);
    // Regeneration prevents an anonymous session ID becoming a login session ID.
    await promisify(req.session.regenerate).call(req.session);
    req.session.userId = user.id;
    req.session.version = user.session_version;
    const token = csrfToken(req);
    await promisify(req.session.save).call(req.session);
    res.json({ user: publicUser(user), csrfToken: token });
  });
  router.post("/google", async (req, res) => {
    const user = await auth.googleLogin(req.body.idToken);
    await promisify(req.session.regenerate).call(req.session);
    req.session.userId = user.id;
    req.session.version = user.session_version;
    const token = csrfToken(req);
    await promisify(req.session.save).call(req.session);
    res.json({ user: publicUser(user), csrfToken: token });
  });
  router.post("/logout", async (req, res) => {
    await promisify(req.session.destroy).call(req.session);
    res.clearCookie("rmp.sid", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: config.production,
    });
    res.json({ user: null, message: "Logged out." });
  });
  router.post("/forgot-password", async (req, res) =>
    res.json(await auth.forgotPassword(req.body.email)),
  );
  router.post("/reset-password", async (req, res) => {
    const result = await auth.resetPassword(req.body);
    // Also invalidate this browser's session, not just sessions on other devices.
    await promisify(req.session.destroy).call(req.session);
    res.clearCookie("rmp.sid", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: config.production,
    });
    res.json(result);
  });
  router.post("/send-otp", async (req, res) =>
    res.json(await auth.sendVerificationOtp(req.body.email)),
  );
  router.post("/verify-otp", async (req, res) =>
    res.json(await auth.verifyEmailOtp(req.body.email, req.body.code)),
  );
  router.get("/review-eligibility", requireAccount, async (req, res) => {
    // Validates the identity foundation without exposing its private key.
    await auth.reviewIdentity(
      req.user.id,
      id(req.query.professorId),
      id(req.query.courseId),
    );
    res.json({ eligible: true, reviewSubmissionImplemented: true });
  });
  return router;
}
