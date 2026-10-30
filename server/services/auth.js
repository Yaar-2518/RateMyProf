import { randomUUID } from "node:crypto";
import { email, studentEmail, password } from "../lib/validation.js";
import {
  hashPassword,
  verifyPassword,
  generateOtp,
  otpHash,
  safeEqual,
  randomSecret,
  anonymousReviewKey,
} from "../lib/security.js";
import { HttpError, requireValue } from "../lib/errors.js";
import { verifyGoogleToken } from "../lib/google-oauth.js";

const INVALID_CODE =
  "This code is invalid, expired, or exhausted. Request a new code.";
export async function createAuthService(db, config, sendOtp) {
  // Unknown users still run a real password comparison, reducing timing leakage.
  const dummyHash = await hashPassword(randomSecret());
  const users = db.collection("users");
  const resets = db.collection("password_resets");
  const emailOtps = db.collection("email_otps");

  async function issue(user) {
    const otp = generateOtp(),
      hash = otpHash(config.otpSecret, user._id || user.id, otp),
      now = Date.now();
    const userId = user._id || user.id;
    // Check resend cooldown.
    const existing = await resets.findOne({ _id: userId });
    if (existing && now - Number(existing.sentAt) < 60000)
      throw new HttpError(
        429,
        "Wait one minute before requesting another code.",
        "RESEND_COOLDOWN",
      );
    await resets.updateOne(
      { _id: userId },
      {
        $set: {
          codeHash: hash,
          expiresAt: now + 600000,
          sentAt: now,
          attempts: 0,
        },
      },
      { upsert: true },
    );
    try {
      await sendOtp({ to: user.email, otp });
    } catch (error) {
      await resets.deleteOne({ _id: userId, codeHash: hash });
      throw error;
    }
  }
  async function register(body) {
    const address = studentEmail(body.email, config.domains);
    requireValue(
      body.agreed === true,
      "Agree to the community guidelines before registering.",
    );
    const hash = await hashPassword(password(body.password));
    const userId = randomUUID();
    try {
      await users.insertOne({
        _id: userId,
        email: address,
        password_hash: hash,
        role: "student",
        anonymous_seed: randomSecret(),
        session_version: 0,
        created_at: new Date(),
      });
    } catch (error) {
      // MongoDB duplicate key error.
      if (error.code === 11000)
        throw new HttpError(
          409,
          "An account with this email already exists. Please sign in.",
          "ACCOUNT_EXISTS",
        );
      throw error;
    }
    return {
      email: address,
      message:
        "Account created. You can now sign in with your email and password.",
    };
  }

  async function consume(value, otp, newPasswordHash) {
    const address = email(value);
    requireValue(
      typeof otp === "string" && /^\d{6}$/.test(otp),
      "Enter the six-digit code.",
    );
    const user = await users.findOne({ email: address });
    if (!user) throw new HttpError(400, INVALID_CODE, "INVALID_CODE");
    const userId = user._id;
    const challenge = await resets.findOne({ _id: userId });
    if (
      !challenge ||
      challenge.attempts >= 5 ||
      Number(challenge.expiresAt) <= Date.now()
    )
      throw new HttpError(400, INVALID_CODE, "INVALID_CODE");
    if (!safeEqual(challenge.codeHash, otpHash(config.otpSecret, userId, otp))) {
      await resets.updateOne(
        { _id: userId },
        { $inc: { attempts: 1 } },
      );
      throw new HttpError(400, INVALID_CODE, "INVALID_CODE");
    }
    await users.updateOne(
      { _id: userId },
      {
        $set: { password_hash: newPasswordHash },
        $inc: { session_version: 1 },
      },
    );
    await resets.deleteOne({ _id: userId });
  }
  async function login(body) {
    const address = email(body.email);
    requireValue(
      typeof body.password === "string" && body.password.length <= 128,
      "Enter your password.",
    );
    const user = await users.findOne({ email: address });
    const valid = await verifyPassword(
      body.password,
      user?.password_hash || dummyHash,
    );
    if (!user || !valid)
      throw new HttpError(
        401,
        "Email or password is incorrect.",
        "INVALID_CREDENTIALS",
      );
    return { id: user._id, email: user.email, role: user.role, session_version: user.session_version };
  }
  async function forgotPassword(value) {
    const address = email(value);
    const user = await users.findOne({ email: address });
    if (user) await issue(user);
    return {
      message: "If this account exists, a password reset code has been sent.",
    };
  }
  async function resetPassword(body) {
    const hash = await hashPassword(password(body.password));
    await consume(body.email, body.code, hash);
    return {
      message:
        "Password changed. Existing login sessions have been invalidated. Please log in again.",
    };
  }
  async function googleLogin(idToken) {
    requireValue(
      typeof idToken === "string" && idToken.length > 0,
      "Google authentication token is required.",
    );
    requireValue(
      config.googleClientId,
      "Google OAuth is not configured on this server.",
    );
    const google = await verifyGoogleToken(idToken, config.googleClientId);
    // Enforce student email domain restriction.
    const domain = google.email.split("@")[1];
    requireValue(
      config.domains.includes(domain),
      `Only emails from ${config.domains.join(", ")} are allowed.`,
    );
    // Find or create the user.
    let user = await users.findOne({ email: google.email });
    if (!user) {
      const userId = randomUUID();
      await users.insertOne({
        _id: userId,
        email: google.email,
        password_hash: await hashPassword(randomSecret()),
        role: "student",
        anonymous_seed: randomSecret(),
        session_version: 0,
        google_id: google.googleId,
        created_at: new Date(),
      });
      user = await users.findOne({ _id: userId });
    } else if (!user.google_id) {
      // Link Google to existing account.
      await users.updateOne(
        { _id: user._id },
        { $set: { google_id: google.googleId } },
      );
    }
    return { id: user._id, email: user.email, role: user.role, session_version: user.session_version };
  }
  async function reviewIdentity(userId, professorId, courseId) {
    const user = await users.findOne({ _id: userId });
    requireValue(user, "Account access required.", 403);
    const link = await db
      .collection("professor_courses")
      .findOne({ professorId, courseId });
    requireValue(link, "This professor does not teach the selected course.");
    return anonymousReviewKey(
      config.anonymousSecret,
      user.anonymous_seed,
      professorId,
      courseId,
    );
  }
  async function sendVerificationOtp(rawEmail) {
    const address = studentEmail(rawEmail, config.domains);
    const otp = generateOtp();
    const hash = otpHash(config.otpSecret, address, otp);
    const now = Date.now();
    const existing = await emailOtps.findOne({ _id: address });
    if (existing && now - Number(existing.sentAt) < 60000) {
      throw new HttpError(
        429,
        "Wait one minute before requesting another code.",
        "RESEND_COOLDOWN",
      );
    }
    await emailOtps.updateOne(
      { _id: address },
      {
        $set: {
          codeHash: hash,
          expiresAt: now + 600000,
          sentAt: now,
          attempts: 0,
        },
      },
      { upsert: true },
    );
    try {
      await sendOtp({ to: address, otp, purpose: "verify" });
    } catch (error) {
      await emailOtps.deleteOne({ _id: address, codeHash: hash });
      throw error;
    }
    return {
      message: `A verification code has been sent to ${address}.`,
    };
  }

  async function verifyEmailOtp(rawEmail, code) {
    const address = studentEmail(rawEmail, config.domains);
    requireValue(
      typeof code === "string" && /^\d{6}$/.test(code),
      "Enter the six-digit code.",
    );
    const challenge = await emailOtps.findOne({ _id: address });
    if (
      !challenge ||
      challenge.attempts >= 5 ||
      Number(challenge.expiresAt) <= Date.now()
    ) {
      throw new HttpError(400, INVALID_CODE, "INVALID_CODE");
    }
    if (!safeEqual(challenge.codeHash, otpHash(config.otpSecret, address, code))) {
      await emailOtps.updateOne(
        { _id: address },
        { $inc: { attempts: 1 } },
      );
      throw new HttpError(400, INVALID_CODE, "INVALID_CODE");
    }
    await emailOtps.deleteOne({ _id: address });
    return { verified: true, email: address, message: "Verification code confirmed." };
  }

  return {
    register,
    login,
    googleLogin,
    forgotPassword,
    resetPassword,
    sendVerificationOtp,
    verifyEmailOtp,
    reviewIdentity,
  };
}
