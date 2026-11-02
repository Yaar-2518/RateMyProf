import test from "node:test";
import assert from "node:assert/strict";
import { createGemini } from "../lib/gemini.js";
import { localAssessment, privacyFlags } from "../lib/review-privacy.js";
import { createCache } from "../lib/redis.js";
import { readConfig } from "../config.js";

const config = { ai: { provider: "gemini", apiKey: "test-key-not-real", model: "test-model", timeoutMs: 1000 } };
const good = { flags: [], recommendation: "no_policy_concern", explanation: "Constructive criticism." };
const response = value => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200 });

test("local pre-screen identifies contact details, identifiers and allegations without external calls", () => {
  assert.ok(privacyFlags("Call +91 98765 43210").includes("phone_or_identifier"));
  assert.ok(privacyFlags("Contact name@example.com").includes("email_address"));
  assert.ok(privacyFlags("Student ID: abc123").includes("student_identifier"));
  assert.ok(localAssessment("He accepted a bribe").flags.includes("allegation_needs_human_review"));
  assert.deepEqual(privacyFlags("Difficult exams, clear explanations."), []);
});

test("Gemini client uses an authenticated server request and structured output", async () => {
  let sent;
  const ai = createGemini(config, async (url, options) => { sent = { url, ...options }; return response(good); });
  assert.deepEqual(await ai.assess("Clear explanations, difficult exams."), good);
  assert.ok(!sent.url.includes(config.ai.apiKey));
  assert.equal(sent.headers["x-goog-api-key"], config.ai.apiKey);
  const body = JSON.parse(sent.body);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.ok(body.systemInstruction.parts[0].text.includes("untrusted"));
});

test("Gemini never receives text failing local privacy checks", async () => {
  let called = false;
  const ai = createGemini(config, async () => { called = true; return response(good); });
  await assert.rejects(ai.assess("Email student@example.com"), { code: "PRIVACY_REVIEW_REQUIRED" });
  assert.equal(called, false);
});

test("AI quota failures are retryable, raw provider details are not exposed", async () => {
  const ai = createGemini(config, async () => new Response('{"error":{"message":"private provider diagnostic"}}', { status: 429 }));
  await assert.rejects(ai.assess("Difficult exams."), error => error.code === "AI_HTTP_429" && error.retryable && !error.message.includes("diagnostic"));
});

test("malformed, refused, truncated, and unknown-category AI responses fail validation", async () => {
  for (const value of [{ flags: ["invented"], recommendation: "human_review", explanation: "x" }, { flags: [], recommendation: "publish_immediately", explanation: "x" }, { flags: [], recommendation: "human_review", explanation: "email a@example.com" }]) {
    await assert.rejects(createGemini(config, async () => response(value)).assess("Academic review."), { code: "AI_INVALID_OUTPUT" });
  }
  const truncated = new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS" }] }));
  await assert.rejects(createGemini(config, async () => truncated).assess("Review"), { code: "AI_INVALID_OUTPUT" });
});

test("summaries require valid source references and bounded de-identified text", async () => {
  const rows = [{ id: "review-a", text: "Clear lectures." }];
  assert.equal((await createGemini(config, async () => response({ text: "Students mention clear lectures.", sourceIds: ["review-a"] })).summarize(rows)).text, "Students mention clear lectures.");
  await assert.rejects(createGemini(config, async () => response({ text: "Students mention lectures.", sourceIds: ["invented-review"] })).summarize(rows), { code: "AI_INVALID_OUTPUT" });
});

test("cache outages and corrupt values fall back without leaking errors", async () => {
  const offline = createCache({ get: async () => { throw new Error("secret connection"); }, set: async () => { throw new Error(); } });
  assert.equal(await offline.get("key"), null);
  await offline.set("key", { count: 1 });
  assert.equal(await createCache({ get: async () => "invalid-json" }).get("key"), null);
});

test("AI settings are explicit and Redis URL requires the correct protocol", () => {
  const base = { SESSION_SECRET: "a".repeat(40), OTP_SECRET: "b".repeat(40), ANONYMOUS_SECRET: "c".repeat(40) };
  assert.throws(() => readConfig({ ...base, AI_PROVIDER: "gemini" }));
  assert.throws(() => readConfig({ ...base, REDIS_URL: "https://redis.example" }));
  assert.equal(readConfig({ ...base, AI_PROVIDER: "gemini", GEMINI_API_KEY: "test" }).ai.model, "gemini-3.1-flash-lite");
});
