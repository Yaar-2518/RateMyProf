import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { readConfig, projectRoot } from "../config.js";
import { migrate } from "../scripts/migrate.js";
import { importNitwCatalog } from "../scripts/import-nitw.js";
import { seed } from "../scripts/seed.js";
import { createApp } from "../app.js";
import { hashPassword, randomSecret } from "../lib/security.js";
import { createProcessor, recoverWork } from "../jobs/process.js";
import { createIntelligenceService } from "../services/intelligence.js";
import { createCache } from "../lib/redis.js";
import { createAuthService } from "../services/auth.js";

test("Modules 1–3 against real MongoDB in an isolated test database", async (t) => {
  const dbName = `rmp_test_${process.pid}`;
  const mongoUri = process.env.MONGODB_TEST_URI || `mongodb://127.0.0.1:27017/${dbName}`;
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(dbName);

  let server, closeApp;
  t.after(async () => {
    if (closeApp) await closeApp();
    if (server) await new Promise((resolve) => server.close(resolve));
    await db.dropDatabase();
    await client.close();
  });

  const config = readConfig({
    ...process.env,
    APP_ENV: "development",
    NODE_ENV: "test",
    MONGODB_URI: mongoUri,
    MAIL_MODE: "file",
    STUDENT_EMAIL_DOMAINS: "student.nitw.ac.in",
    REDIS_URL: "",
    AI_PROVIDER: "disabled",
  });

  await migrate(db);
  await seed(db);

  const officialCatalog = JSON.parse(
    await fs.readFile(
      path.join(projectRoot, "shared/nitwCatalog.json"),
      "utf8",
    ),
  );
  assert.equal(
    await db.collection("professors").countDocuments(),
    officialCatalog.professors.length,
  );

  // Additional test-only fixtures; official faculty are seeded from the snapshot.
  await db.collection("professors").insertMany([
    {
      _id: "test-teacher-one",
      name: "Test Teacher One",
      department_id: "cse",
      designation: "Professor",
      office: "",
      bio: "Test only",
      source_url: "",
      created_at: new Date(),
    },
    {
      _id: "test-teacher-two",
      name: "Test Teacher Two",
      department_id: "cse",
      designation: "Professor",
      office: "",
      bio: "Test only",
      source_url: "",
      created_at: new Date(),
    },
  ]);
  await db.collection("professor_courses").insertMany([
    { professorId: "test-teacher-one", courseId: "cs1206" },
    { professorId: "test-teacher-two", courseId: "cs1206" },
  ]);

  const delivered = [];
  const sendOtp = async (message) => delivered.push(message);
  const queued = [];
  const jobs = { enqueue: async (...args) => { queued.push(args); return false; }, close: async () => {} };
  const { app, close } = await createApp(db, config, { test: true, sendOtp, jobs, redis: null });
  closeApp = close;
  const aiConfig = { ...config, ai: { ...config.ai, provider: "gemini" } };
  const fakeAI = {
    assess: async () => ({ flags: [], recommendation: "no_policy_concern", explanation: "Constructive academic feedback." }),
    summarize: async rows => ({ text: "Students praise clear lectures. Some describe demanding assignments.", sourceIds: rows.map(r => r.id) }),
  };
  const processJob = createProcessor(db, aiConfig, { ai: fakeAI });
  server = await new Promise((resolve) => {
    const result = app.listen(0, "127.0.0.1", () => resolve(result));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  class Client {
    constructor(apiBase = base) {
      this.base = apiBase;
    }
    cookie = "";
    csrf = "";
    async call(method, route, body, expected = 200, extras = {}) {
      const response = await fetch(`${this.base}${route}`, {
        method,
        headers: {
          Cookie: this.cookie,
          Origin: config.origin,
          "Content-Type": "application/json",
          ...(method !== "GET" ? { "X-CSRF-Token": this.csrf } : {}),
          ...extras,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      for (const value of response.headers.getSetCookie()) {
        if (value.startsWith("rmp.sid=")) {
          const cookieVal = value.split(";")[0];
          if (cookieVal === "rmp.sid=") {
            this.cookie = "";
            this.csrf = "";
          } else {
            this.cookie = cookieVal;
          }
        }
      }
      const data = await response.json();
      if (expected !== null) {
        assert.equal(
          response.status,
          expected,
          `${method} ${route}: ${JSON.stringify(data)}`,
        );
      }
      if (data?.csrfToken) this.csrf = data.csrfToken;
      return { status: response.status, data, headers: response.headers };
    }
  }

  const guest = new Client(),
    student = new Client(),
    admin = new Client();
  await guest.call("GET", "/auth/session");
  await student.call("GET", "/auth/session");
  await admin.call("GET", "/auth/session");

  const address = "test.student@student.nitw.ac.in",
    originalPassword = "original-test-password",
    newPassword = "replacement-test-password";
  const adminId = randomUUID();

  await db.collection("users").insertOne({
    _id: adminId,
    email: "admin@rmp-test.local",
    password_hash: await hashPassword("integration-admin-password"),
    role: "admin",
    anonymous_seed: randomSecret(),
    session_version: 0,
    created_at: new Date(),
  });

  const adminLogin = await admin.call("POST", "/auth/login", {
    email: "admin@rmp-test.local",
    password: "integration-admin-password",
  });
  assert.match(adminLogin.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(adminLogin.headers.get("set-cookie"), /SameSite=Lax/i);

  let departmentId, courseId, professorId;

  await t.test("health endpoint reports ok", async () => {
    const res = await guest.call("GET", "/health");
    assert.equal(res.data.status, "ok");
  });

  await t.test(
    "guest can read public catalog but cannot submit reviews or modify catalog",
    async () => {
      const departments = (await guest.call("GET", "/departments")).data.departments;
      assert.ok(departments.length >= 10);
      assert.ok(departments.every((d) => d.id && d.name && d.code));
      const catalog = (await guest.call("GET", "/catalog")).data;
      assert.ok(catalog.professors.length >= 100);
      assert.ok(catalog.courses.length >= 100);
      const filtered = (
        await guest.call("GET", "/professors?department=Computer%20Science%20and%20Engineering")
      ).data.professors;
      assert.ok(filtered.length > 0);
      await guest.call(
        "POST",
        "/departments",
        { name: "Unauthenticated Dept", code: "UNAUTH" },
        401,
      );
    },
  );

  await t.test(
    "admin can create departments, courses, and professors",
    async () => {
      const deptRes = await admin.call("POST", "/departments", {
        name: "Department of Integration Testing",
        code: "DIT",
      }, 201);
      departmentId = deptRes.data.department.id;
      assert.ok(departmentId);

      const courseRes = await admin.call("POST", "/courses", {
        code: "IT9999",
        name: "Advanced Software Engineering",
        department: "Department of Integration Testing",
        credits: 4,
        semester: "Semester 7",
        description: "Capstone integration course.",
      }, 201);
      courseId = courseRes.data.item.id;
      assert.ok(courseId);

      const profRes = await admin.call("POST", "/professors", {
        name: "Dr. Integration Test",
        department: "Department of Integration Testing",
        designation: "Associate Professor",
        office: "Room 101",
        bio: "Expert in software architecture.",
        courses: [courseId],
      }, 201);
      professorId = profRes.data.item.id;
      assert.ok(professorId);

      // Verify the professor can be found with course linked
      const prof = (await guest.call("GET", `/professors/${professorId}`)).data.professor;
      assert.equal(prof.name, "Dr. Integration Test");
      assert.deepEqual(prof.courses, [courseId]);
    },
  );

  await t.test(
    "student registration enforces student domain, hashes passwords, and allows login",
    async () => {
      // Reject non-student domain
      await student.call(
        "POST",
        "/auth/register",
        { email: "hacker@gmail.com", password: originalPassword, agreed: true },
        400,
      );

      // Reject without agreement
      await student.call(
        "POST",
        "/auth/register",
        { email: address, password: originalPassword, agreed: false },
        400,
      );

      // Successful registration
      const reg = await student.call("POST", "/auth/register", {
        email: address,
        password: originalPassword,
        agreed: true,
      }, 201);
      assert.equal(reg.data.email, address);

      // Duplicate registration rejected
      await student.call(
        "POST",
        "/auth/register",
        { email: address, password: originalPassword, agreed: true },
        409,
      );

      const userDoc = await db.collection("users").findOne({ email: address });
      assert.equal(userDoc.role, "student");
      assert.notEqual(userDoc.password_hash, originalPassword);

      // Login
      const login = await student.call("POST", "/auth/login", {
        email: address,
        password: originalPassword,
      });
      assert.equal(login.data.user.email, address);
      assert.equal(login.data.user.role, "student");
    },
  );

  await t.test(
    "Password reset attempt count persists, expiry is enforced, and a consumed code cannot be reused",
    async () => {
      await student.call("POST", "/auth/forgot-password", { email: address });
      const message = delivered.find((m) => m.to === address);
      assert.ok(message);
      const wrong = message.otp === "000000" ? "000001" : "000000";
      await student.call(
        "POST",
        "/auth/reset-password",
        { email: address, code: wrong, password: originalPassword },
        400,
      );
      const studentUser = await db.collection("users").findOne({ email: address });
      const resetDoc = await db.collection("password_resets").findOne({ _id: studentUser._id });
      assert.equal(resetDoc.attempts, 1);

      // Cooldown enforced
      await student.call("POST", "/auth/forgot-password", { email: address }, 429);

      // Simulate expiry
      await db.collection("password_resets").updateOne(
        { _id: studentUser._id },
        { $set: { expiresAt: Date.now() - 1000 } },
      );
      await student.call(
        "POST",
        "/auth/reset-password",
        { email: address, code: message.otp, password: originalPassword },
        400,
      );

      // Extend expiry and succeed
      await db.collection("password_resets").updateOne(
        { _id: studentUser._id },
        { $set: { expiresAt: Date.now() + 600000 } },
      );
      await student.call("POST", "/auth/reset-password", {
        email: address,
        code: message.otp,
        password: newPassword,
      });

      // Refresh session after password reset destroyed old session
      await student.call("GET", "/auth/session");

      // Login with new password
      await student.call("POST", "/auth/login", {
        email: address,
        password: newPassword,
      });
    },
  );

  await t.test(
    "direct OTP verification endpoint sends and confirms OTPs",
    async () => {
      const student2Email = "verification.test@student.nitw.ac.in";
      const sendRes = await guest.call("POST", "/auth/send-otp", { email: student2Email });
      assert.ok(sendRes.data.message);

      const msg = delivered.findLast((m) => m.to === student2Email);
      assert.ok(msg);
      assert.match(msg.otp, /^\d{6}$/);

      // Wrong code
      await guest.call("POST", "/auth/verify-otp", { email: student2Email, code: "999999" }, 400);

      // Correct code
      const verifyRes = await guest.call("POST", "/auth/verify-otp", { email: student2Email, code: msg.otp });
      assert.equal(verifyRes.data.verified, true);
    },
  );

  await t.test(
    "private review keys are stable per context and never returned to the client",
    async () => {
      const userDoc = await db.collection("users").findOne({ email: address });
      const service = await createAuthService(db, config, sendOtp);
      const key = await service.reviewIdentity(
        userDoc._id,
        professorId,
        courseId,
      );
      assert.equal(
        key,
        await service.reviewIdentity(userDoc._id, professorId, courseId),
      );
      const result = await student.call(
        "GET",
        `/auth/review-eligibility?professorId=${professorId}&courseId=${courseId}`,
      );
      assert.equal(result.data.eligible, true);
      assert.equal(JSON.stringify(result.data).includes(key), false);
    },
  );

  await t.test(
    "reviews validate on the server, persist anonymously, and reject duplicate submissions",
    async () => {
      const reviewBody = {
        professorId,
        courseId,
        semester: "Spring 2025",
        ratings: [5, 5, 5, 5, 5, 5],
        tags: ["Interesting Lectures", "Fair Grading"],
        text: "Exceptional course and brilliant teaching style.",
        confirmed: true,
      };

      const res = await student.call("POST", "/reviews", reviewBody, 201);
      assert.ok(res.data.id);

      // Second review by same student for same prof+course is rejected (409)
      await student.call("POST", "/reviews", reviewBody, 409);

      // Pending reviews are not public, including when a caller supplies a filter.
      assert.equal((await guest.call("GET", "/reviews")).data.reviews.length, 0);
      await admin.call("PATCH", `/reviews/${res.data.id}/status`, { status: "approved" }, 409);
      await student.call("PATCH", `/reviews/${res.data.id}/status`, { status: "approved" }, 403);
      await guest.call("GET", "/moderation/reviews", undefined, 401);
      await student.call("GET", "/moderation/reviews", undefined, 403);
      await processJob({ name: "screen", data: { id: res.data.id, revision: 1 } });
      const local = await db.collection("reviews").findOne({ _id: res.data.id });
      assert.equal(local.screening_state, "awaiting_privacy_review");
      await admin.call("PATCH", `/moderation/reviews/${res.data.id}`, { action: "screen", aiText: "Clear lectures and fair grading.", privacyConfirmed: false }, 400);
      await admin.call("PATCH", `/moderation/reviews/${res.data.id}`, { action: "screen", aiText: "Email student@example.com", privacyConfirmed: true }, 400);
      await admin.call("PATCH", `/moderation/reviews/${res.data.id}`, { action: "screen", aiText: "Clear lectures and fair grading.", privacyConfirmed: true });
      await processJob({ name: "screen", data: { id: res.data.id, revision: 2 } });
      const assessed = await db.collection("reviews").findOne({ _id: res.data.id });
      assert.equal(assessed.screening_state, "complete");
      assert.equal(assessed.status, "pending"); // AI never publishes.
      await admin.call("PATCH", `/moderation/reviews/${res.data.id}`, { action: "approve", reason: "Constructive review, no private information." });
      await admin.call("PATCH", `/moderation/reviews/${res.data.id}`, { action: "reject" }, 409);
      // Verify public review listing
      const pubReviews = (await guest.call("GET", `/reviews?professorId=${professorId}`)).data.reviews;
      assert.equal(pubReviews.length, 1);
      assert.equal(pubReviews[0].text, reviewBody.text);
      assert.equal(pubReviews[0].rating, 5);

      // Ensure no private user data leaked in reviews
      const serialized = JSON.stringify(pubReviews);
      assert.equal(serialized.includes(address), false);
      assert.equal(serialized.includes("password_hash"), false);
      assert.equal(serialized.includes("anonymous_seed"), false);
      assert.equal(serialized.includes("ai_text"), false);
      assert.equal(serialized.includes("moderatorId"), false);
    },
  );

  await t.test(
    "official catalog import is repeatable and idempotent in MongoDB",
    async () => {
      const catalog = JSON.parse(
        await fs.readFile(
          path.join(projectRoot, "shared/nitwCatalog.json"),
          "utf8",
        ),
      );
      const accountsBefore = await db.collection("users").find({}).toArray();
      const reviewsBefore = await db.collection("reviews").find({}).toArray();

      await importNitwCatalog(db, catalog);

      const accountsAfter = await db.collection("users").find({}).toArray();
      const reviewsAfter = await db.collection("reviews").find({}).toArray();

      assert.equal(accountsAfter.length, accountsBefore.length);
      assert.equal(reviewsAfter.length, reviewsBefore.length);
    },
  );
  await t.test("recovery finds work even when initial Redis enqueue failed", async () => {
    await db.collection("reviews").insertOne({ _id: "recover-review", status: "pending", professor_id: professorId, course_id: courseId, context_key: "recover-key", screening_state: "queued", screening_revision: 1, screening_due: new Date(0), review_text: "Clear lectures", ratings: [4,4,4,4,4,4], tags: [], created_at: new Date() });
    const calls = [];
    await recoverWork(db, { enqueue: async (...args) => calls.push(args) });
    assert.ok(calls.some(call => call[0] === "screen" && call[1] === "recover-review"));
    await processJob({ name: "screen", data: { id: "recover-review", revision: 1 } });
    await processJob({ name: "screen", data: { id: "recover-review", revision: 1 } });
    assert.equal((await db.collection("reviews").findOne({ _id: "recover-review" })).screening_state, "awaiting_privacy_review");
  });

  await t.test("comparisons isolate the selected course, semester and published status", async () => {
    await db.collection("reviews").insertMany([
      { _id: "compare-a", professor_id: "test-teacher-one", course_id: "cs1206", context_key: "compare-a", status: "published", semester: "Spring 2025", ratings: [2,3,4,5,1,4], tags: [], review_text: "", created_at: new Date() },
      { _id: "compare-b", professor_id: "test-teacher-one", course_id: "cs1206", context_key: "compare-b", status: "pending", semester: "Spring 2025", ratings: [1,1,1,1,1,1], tags: [], review_text: "", created_at: new Date() },
    ]);
    const result = await guest.call("GET", "/compare?course=cs1206&professors=test-teacher-one,test-teacher-two&semester=Spring%202025");
    assert.equal(result.data.professors[0].reviewCount, 1);
    assert.equal(result.data.professors[0].averages[5], 4);
    assert.equal(result.data.professors[1].averages[0], null);
    await guest.call("GET", `/compare?course=cs1206&professors=${professorId},test-teacher-two`, undefined, 400);
    assert.equal((await guest.call("GET", "/compare?course=cs1206&professors=test-teacher-one,test-teacher-two&semester=Autumn%202025")).data.professors[0].reviewCount, 0);
  });

  await t.test("summary generation waits for privacy-cleared published evidence and removal invalidates cache", async () => {
    const service = createIntelligenceService(db, aiConfig, jobs, createCache(null));
    assert.equal((await service.summary("test-teacher-two")).state, "insufficient_data");
    const docs = Array.from({ length: 5 }, (_, i) => ({ _id: `summary-${i}`, professor_id: "test-teacher-two", course_id: "cs1206", context_key: `summary-key-${i}`, status: "published", semester: "Spring 2025", ratings: [4,4,4,4,4,4], tags: [], review_text: "Clear lectures.", ai_text: "Clear lectures and demanding assignments.", ai_cleared: true, screening: { flags: [], recommendation: "no_policy_concern" }, created_at: new Date() }));
    await db.collection("reviews").insertMany(docs);
    assert.equal((await service.summary("test-teacher-two")).state, "processing");
    const source = await service.summarySource("test-teacher-two");
    await processJob({ name: "summary", data: { id: "test-teacher-two", revision: source.revision } });
    assert.equal((await service.summary("test-teacher-two")).state, "ready");
    await admin.call("DELETE", "/reviews/summary-0");
    const after = await service.summary("test-teacher-two");
    assert.equal(after.state, "insufficient_data");
    assert.equal(after.text, undefined);
    assert.equal((await db.collection("reviews").findOne({ _id: "summary-0" })).status, "removed");
  });

  await t.test("persistent reports are admin-only and concurrent duplicates are prevented", async () => {
    const publicReview = await db.collection("reviews").findOne({ status: "published" });
    const responses = await Promise.all([
      student.call("POST", `/reviews/${publicReview._id}/report`, { reason: "Other", details: "Please inspect." }, null),
      student.call("POST", `/reviews/${publicReview._id}/report`, { reason: "Other", details: "Please inspect." }, null),
    ]);
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
    const first = responses.find(r => r.status === 201);
    await guest.call("GET", "/reports", undefined, 401);
    await student.call("GET", "/reports", undefined, 403);
    await admin.call("PATCH", `/reports/${first.data.id}`, { action: "remove" });
    assert.equal((await db.collection("reviews").findOne({ _id: publicReview._id })).status, "removed");
    assert.ok((await guest.call("GET", "/reviews")).data.reviews.every(r => r.id !== publicReview._id));
  });

  await t.test("screening retries are bounded, stale revisions are ignored, and PII cannot be published", async () => {
    const row = { _id: "retry-review", status: "pending", professor_id: professorId, course_id: courseId, context_key: "retry-key", screening_state: "queued", screening_revision: 1, screening_due: new Date(0), ai_cleared: true, ai_text: "Clear lectures.", review_text: "Email someone@example.com", ratings: [4,4,4,4,4,4], tags: [], created_at: new Date() };
    await db.collection("reviews").insertOne(row);
    let calls = 0;
    const failed = createProcessor(db, aiConfig, { ai: { assess: async () => { calls++; const error = new Error("temporary"); error.retryable = true; throw error; } } });
    await failed({ name: "screen", data: { id: row._id, revision: 99 } });
    assert.equal(calls, 0);
    for (let i = 0; i < 3; i++) {
      await db.collection("reviews").updateOne({ _id: row._id }, { $set: { screening_due: new Date(0) } });
      await failed({ name: "screen", data: { id: row._id, revision: 1 } });
    }
    const saved = await db.collection("reviews").findOne({ _id: row._id });
    assert.equal(saved.screening_state, "failed");
    assert.equal(saved.status, "pending");
    assert.equal(calls, 3);
    await admin.call("PATCH", `/moderation/reviews/${row._id}`, { action: "approve" }, 400);
    await admin.call("PATCH", `/moderation/reviews/${row._id}`, { action: "reject", reason: "Private contact information." });
  });

  await t.test("merged approval API, private profile, and voting respect publication boundaries", async () => {
    const owner = await db.collection("users").findOne({ email: address });
    await db.collection("reviews").insertOne({ _id: "merged-review", context_key: "merged-review-key", user_id: owner._id, professor_id: professorId, course_id: courseId, status: "pending", screening_state: "awaiting_privacy_review", screening_revision: 1, audit: [], semester: "Spring 2025", ratings: [4,4,4,4,4,4], review_text: "Clear explanations.", tags: [], created_at: new Date(), grade: "A", attendance: "Mandatory" });
    await guest.call("GET", "/my-reviews", undefined, 401);
    const mine = (await student.call("GET", "/my-reviews")).data.reviews;
    assert.ok(mine.some(r => r.id === "merged-review" && r.status === "pending" && r.grade === "A"));
    assert.equal((await admin.call("GET", "/my-reviews")).data.reviews.length, 0);
    await student.call("POST", "/reviews/merged-review/vote", { value: 1 }, 404);
    await admin.call("PATCH", "/reviews/merged-review/status", { status: "approved" });
    assert.equal((await db.collection("reviews").findOne({ _id: "merged-review" })).status, "published");
    assert.equal((await student.call("GET", "/my-reviews")).data.reviews.find(r => r.id === "merged-review").status, "approved");
    await guest.call("POST", "/reviews/merged-review/vote", { value: 1 }, 401);
    await student.call("POST", "/reviews/merged-review/vote", { value: 1 });
    let publicReview = (await guest.call("GET", "/reviews")).data.reviews.find(r => r.id === "merged-review");
    assert.equal(publicReview.upvotes, 1);
    assert.equal(publicReview.user_id, undefined);
    await student.call("POST", "/reviews/merged-review/vote", { value: -1 });
    publicReview = (await guest.call("GET", "/reviews")).data.reviews.find(r => r.id === "merged-review");
    assert.equal(publicReview.upvotes, 0);
    assert.equal(publicReview.downvotes, 1);
    await student.call("POST", "/reviews/merged-review/vote", { value: -1 });
    assert.equal(Object.keys((await student.call("GET", "/votes")).data.votes).length, 0);
  });

  await t.test("migration normalizes earlier approved reviews and recovers pending submissions", async () => {
    await db.collection("reviews").insertMany([
      { _id: "legacy-approved", context_key: "legacy-approved-key", status: "approved" },
      { _id: "legacy-pending", context_key: "legacy-pending-key", status: "pending" },
    ]);
    await migrate(db);
    assert.equal((await db.collection("reviews").findOne({ _id: "legacy-approved" })).status, "published");
    assert.equal((await db.collection("reviews").findOne({ _id: "legacy-pending" })).screening_state, "queued");
    await db.collection("reviews").deleteMany({ _id: { $in: ["legacy-approved", "legacy-pending"] } });
  });

});
