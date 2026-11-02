import express from "express";
import { RedisStore } from "rate-limit-redis";
import { createRedis, createCache } from "./lib/redis.js";
import { createJobs } from "./jobs/queue.js";
import { intelligenceRoutes } from "./routes/intelligence.js";
import session from "express-session";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import path from "node:path";
import { projectRoot } from "./config.js";
import { createMailer } from "./lib/mail.js";
import { MongoSessionStore } from "./lib/session-store.js";
import { errorHandler, HttpError } from "./lib/errors.js";
import { loadUser, protectMutations } from "./middleware/auth.js";
import { createAuthService } from "./services/auth.js";
import { authRoutes } from "./routes/auth.js";
import { reviewRoutes } from "./routes/reviews.js";
import { catalogRoutes } from "./routes/catalog.js";

export async function createApp(db, config, options = {}) {
  const app = express(),
    store = new MongoSessionStore(db);
  const redis = options.redis === undefined ? createRedis(config) : options.redis;
  if (redis && redis.status === "wait") await redis.connect().catch(() => {});
  const jobs = options.jobs || createJobs(config);
  const limiterStore = (prefix) => redis && !options.test ? new RedisStore({
    sendCommand: (...args) => redis.call(...args), prefix: `rmp:limit:${prefix}:`,
  }) : undefined;
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:"],
          scriptSrc: ["'self'", "https://accounts.google.com", "https://apis.google.com"],
          frameSrc: ["'self'", "https://accounts.google.com"],
          connectSrc: ["'self'", "https://accounts.google.com"],
        },
      },
    }),
  );
  app.use(
    "/api",
    rateLimit({
      store: limiterStore("api"),
      windowMs: 60000,
      limit: options.test ? 10000 : 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: {
          message: "Too many requests. Please try again shortly.",
          code: "RATE_LIMITED",
        },
      },
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", (req, res, next) => {
    if (
      req.body !== undefined &&
      (req.body === null ||
        typeof req.body !== "object" ||
        Array.isArray(req.body))
    )
      return next(new HttpError(400, "Request body must be a JSON object."));
    req.body ||= {};
    next();
  });
  app.get("/api/health", async (req, res) => {
    await db.command({ ping: 1 });
    res.json({ status: "ok" });
  });
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/api",
    session({
      name: "rmp.sid",
      secret: config.sessionSecret,
      store,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.production,
        maxAge: 86400000,
      },
    }),
  );
  app.use("/api", protectMutations(config), loadUser(db));
  const auth = await createAuthService(
    db,
    config,
    options.sendOtp || createMailer(config),
  );
  app.use("/api/auth", (req, res, next) => {
    if (req.method === "GET") return next();
    return authLimiter(req, res, next);
  });
  const authLimiter = rateLimit({
    store: limiterStore("auth"),
    windowMs: 15 * 60000,
    limit: options.test ? 1000 : 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        message: "Too many authentication attempts. Try again in 15 minutes.",
        code: "RATE_LIMITED",
      },
    },
  });
  app.use("/api/auth", authRoutes(auth, config));
  app.use("/api", catalogRoutes(db));
  app.use("/api", intelligenceRoutes(db, config, jobs, createCache(redis)));
  app.use("/api", reviewRoutes(db, auth, { ...options, jobs, config }));
  app.use("/api", (req, res) =>
    res.status(404).json({
      error: { message: "API endpoint not found.", code: "NOT_FOUND" },
    }),
  );
  if (config.production)
    app.use(express.static(path.join(projectRoot, "dist")));
  app.use(errorHandler);
  return { app, store, close: async () => { await jobs.close?.(); redis?.disconnect(); } };
}
