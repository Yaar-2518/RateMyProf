import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  anonymousReviewKey,
  otpHash,
} from "../lib/security.js";
import { studentEmail, password, code } from "../lib/validation.js";
import { readConfig } from "../config.js";

test("password hashing uses unique salts and rejects incorrect passwords", async () => {
  const first = await hashPassword("a long test password"),
    second = await hashPassword("a long test password");
  assert.notEqual(first, second);
  assert.ok(!first.includes("a long test password"));
  assert.equal(await verifyPassword("a long test password", first), true);
  assert.equal(await verifyPassword("a wrong test password", first), false);
  assert.equal(
    await verifyPassword("a long test password", "malformed"),
    false,
  );
});
test("student domains are exact, canonical, and reject plus aliases", () => {
  assert.equal(
    studentEmail("  Student@STUDENT.NITW.AC.IN ", ["student.nitw.ac.in"]),
    "student@student.nitw.ac.in",
  );
  for (const address of [
    "student@gmail.com",
    "student@student.nitw.ac.in.evil.com",
    "student+alias@student.nitw.ac.in",
    "Student <student@student.nitw.ac.in>",
    "student\r\n@student.nitw.ac.in",
  ])
    assert.throws(() => studentEmail(address, ["student.nitw.ac.in"]));
  assert.throws(() => password("short"));
  assert.equal(password("  a long password  "), "  a long password  ");
  assert.equal(code(" cs f305 "), "CS F305");
});
test("anonymous identities and OTP hashes are keyed and context-specific", () => {
  const key = anonymousReviewKey("secret", "seed", "professor", "course");
  assert.equal(
    key,
    anonymousReviewKey("secret", "seed", "professor", "course"),
  );
  for (const args of [
    ["changed", "seed", "professor", "course"],
    ["secret", "different", "professor", "course"],
    ["secret", "seed", "professor", "other-course"],
  ])
    assert.notEqual(key, anonymousReviewKey(...args));
  assert.notEqual(
    otpHash("secret", "user", "123456"),
    otpHash("secret", "other-user", "123456"),
  );
});
test("configuration fails closed for weak secrets and unsafe production delivery", () => {
  const base = {
    SESSION_SECRET: "a".repeat(64),
    OTP_SECRET: "b".repeat(64),
    ANONYMOUS_SECRET: "c".repeat(64),
  };
  assert.throws(() => readConfig({ ...base, SESSION_SECRET: "short" }));
  assert.throws(() =>
    readConfig({
      ...base,
      APP_ENV: "production",
      APP_ORIGIN: "https://example.com",
      MAIL_MODE: "file",
    }),
  );
  assert.throws(() => readConfig({ ...base, MONGODB_URI: "unsafe;name" }));
  assert.equal(
    readConfig({
      ...base,
      APP_ENV: "production",
      APP_ORIGIN: "https://example.com",
      MAIL_MODE: "smtp",
      SMTP_HOST: "smtp.example.com",
    }).production,
    true,
  );
});
