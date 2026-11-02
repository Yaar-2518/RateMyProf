import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
// Deployment environment wins; .env.local overrides .env for local development.
dotenv.config({ path: [path.join(projectRoot, ".env.local"), path.join(projectRoot, ".env")], quiet: true });

export function readConfig(env = process.env) {
  const production =
    env.APP_ENV === "production" || env.NODE_ENV === "production";
  const secret = (name) => {
    const value = env[name] || "";
    if (value.length < 32 || value.startsWith("replace-"))
      throw new Error(
        `${name} must contain at least 32 random characters. Run npm run setup:local or configure .env.`,
      );
    return value;
  };
  const mailMode = env.MAIL_MODE || "file";
  if (
    !["file", "smtp"].includes(mailMode) ||
    (production && mailMode !== "smtp")
  )
    throw new Error(
      "Use MAIL_MODE=file for development or MAIL_MODE=smtp with SMTP_HOST for production.",
    );
  if (mailMode === "smtp" && !env.SMTP_HOST)
    throw new Error("SMTP_HOST is required for SMTP email delivery.");
  const origin = new URL(env.APP_ORIGIN || "http://localhost:5173").origin;
  if (production && !origin.startsWith("https://"))
    throw new Error("Production APP_ORIGIN must use HTTPS.");
  if (!["disabled", "gemini"].includes(env.AI_PROVIDER || "disabled")) throw new Error("AI_PROVIDER must be gemini or disabled.");
  if (env.AI_PROVIDER === "gemini" && !env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required when AI_PROVIDER=gemini.");
  const domains = (env.STUDENT_EMAIL_DOMAINS || "student.nitw.ac.in")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (
    !domains.length ||
    domains.some((d) => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d))
  )
    throw new Error("Configure valid STUDENT_EMAIL_DOMAINS.");
  return {
    production,
    port: Number(env.PORT || 3000),
    host: env.HOST || (production ? "0.0.0.0" : "127.0.0.1"),
    redisUrl: (() => {
      const value = env.REDIS_URL || "";
      if (value && !/^rediss?:\/\//.test(value)) throw new Error("REDIS_URL must be a Redis TCP/TLS connection URL.");
      if (production && value && !value.startsWith("rediss://")) throw new Error("Production Redis requires a TLS rediss:// URL.");
      return value;
    })(),
    ai: {
      provider: env.AI_PROVIDER || "disabled",
      apiKey: env.GEMINI_API_KEY || "",
      model: env.GEMINI_MODEL || "gemini-3.1-flash-lite",
      timeoutMs: 30000,
      minimumReviews: 5,
      dailyLimit: 50,
    },
    origin,
    domains,
    sessionSecret: secret("SESSION_SECRET"),
    otpSecret: secret("OTP_SECRET"),
    anonymousSecret: secret("ANONYMOUS_SECRET"),
    trustProxy: env.TRUST_PROXY === "true" ? 1 : false,
    mongoUri: (() => {
      const uri = env.MONGODB_URI || "mongodb://127.0.0.1:27017/rate_my_prof";
      if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://"))
        throw new Error("MONGODB_URI must start with mongodb:// or mongodb+srv://");
      return uri;
    })(),
    googleClientId: env.GOOGLE_CLIENT_ID || "",
    mail: {
      mode: mailMode,
      directory: path.join(projectRoot, ".local", "mail"),
      from: env.MAIL_FROM || "RateMyProf <noreply@example.com>",
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 587),
      secure: env.SMTP_SECURE === "true",
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
    },
  };
}
