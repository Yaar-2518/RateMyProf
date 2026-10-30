import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readConfig, projectRoot } from "../config.js";
import { connectDb } from "../db.js";
import { email, password } from "../lib/validation.js";
import { hashPassword, randomSecret } from "../lib/security.js";

export async function createAdmin(
  db,
  address = process.env.ADMIN_EMAIL || "admin@rate-my-prof.local",
  suppliedPassword = process.env.ADMIN_PASSWORD,
) {
  const normalized = email(address);
  const existing = await db
    .collection("users")
    .findOne({ email: normalized });
  if (existing) {
    if (existing.role !== "admin")
      throw new Error(
        "A student account already uses ADMIN_EMAIL. Choose another admin email; existing students are never silently promoted.",
      );
    console.log("Admin account already exists; password was not changed.");
    return;
  }
  const actualPassword = suppliedPassword || randomSecret();
  password(actualPassword);
  await db.collection("users").insertOne({
    _id: randomUUID(),
    email: normalized,
    password_hash: await hashPassword(actualPassword),
    role: "admin",
    anonymous_seed: randomSecret(),
    session_version: 0,
    created_at: new Date(),
  });
  const directory = path.join(projectRoot, ".local");
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.writeFile(
    path.join(directory, "admin-account.txt"),
    `Local RateMyProf admin account\nEmail: ${normalized}\nPassword: ${actualPassword}\n\nKeep this file private. Do not commit it.\n`,
    { mode: 0o600 },
  );
  console.log(
    "Admin created. Local credentials saved privately in .local/admin-account.txt.",
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let client;
  try {
    const config = readConfig();
    const { client: mongoClient, db } = await connectDb(config);
    client = mongoClient;
    await createAdmin(db);
  } catch (error) {
    console.error("Admin setup failed:", error.code || error.message);
    process.exitCode = 1;
  } finally {
    if (client) await client.close();
  }
}
