import { fileURLToPath } from "node:url";
import { readConfig } from "../config.js";
import { connectDb } from "../db.js";

export async function migrate(db) {
  // Create collections if they don't exist.
  const collections = await db.listCollections().toArray();
  const existing = new Set(collections.map((c) => c.name));
  for (const name of [
    "departments",
    "professors",
    "courses",
    "professor_courses",
    "users",
    "password_resets",
    "email_otps",
    "sessions",
    "reviews",
    "reports",
  ]) {
    if (!existing.has(name)) await db.createCollection(name);
  }

  // Create indexes that mirror the old MySQL schema constraints.
  await db.collection("departments").createIndex({ name: 1 }, { unique: true });
  await db.collection("departments").createIndex({ code: 1 }, { unique: true });
  await db
    .collection("professors")
    .createIndex({ department_id: 1 });
  await db.collection("professors").createIndex({ name: 1 });
  await db.collection("courses").createIndex({ code: 1 }, { unique: true });
  await db.collection("courses").createIndex({ department_id: 1 });
  await db
    .collection("professor_courses")
    .createIndex({ professorId: 1, courseId: 1 }, { unique: true });
  await db
    .collection("professor_courses")
    .createIndex({ courseId: 1 });
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("sessions").createIndex({ expiresAt: 1 });
  await db.collection("email_otps").createIndex({ expiresAt: 1 });
  await db.collection("reviews").createIndex({ professor_id: 1 });
  await db.collection("reviews").createIndex({ course_id: 1 });
  await db
    .collection("reviews")
    .createIndex({ context_key: 1 }, { unique: true });
  await db.collection("reports").createIndex({ reviewId: 1 });
  await db.collection("reports").createIndex({ status: 1 });
  await db.collection("reports").createIndex({ created_at: -1 });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let client;
  try {
    const config = readConfig();
    const { client: mongoClient, db } = await connectDb(config);
    client = mongoClient;
    await migrate(db);
    console.log("MongoDB collections and indexes are ready.");
  } catch (error) {
    console.error("Database setup failed:", error.code || error.message);
    process.exitCode = 1;
  } finally {
    if (client) await client.close();
  }
}
