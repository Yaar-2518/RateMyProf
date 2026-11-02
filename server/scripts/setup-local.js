import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { readConfig, projectRoot } from "../config.js";
import { connectDb } from "../db.js";
import { randomSecret } from "../lib/security.js";
import { migrate } from "./migrate.js";
import { seed } from "./seed.js";
import { createAdmin } from "./create-admin.js";

let client;
try {
  const localPath = path.join(projectRoot, ".env.local");
  const envPath = await fs.access(localPath).then(() => localPath, () => path.join(projectRoot, ".env"));
  let envExists = true;
  try {
    await fs.access(envPath);
  } catch {
    envExists = false;
  }

  if (!envExists) {
    const example = await fs.readFile(
      path.join(projectRoot, ".env.example"),
      "utf8",
    );
    const envText = example
      .replace(
        "replace-with-at-least-32-random-characters",
        randomSecret(),
      )
      .replaceAll("replace-with-another-independent-random-secret", () =>
        randomSecret(),
      );
    await fs.writeFile(envPath, envText, { mode: 0o600 });
    console.log(
      "Created private .env with randomly generated development secrets.",
    );
  }

  const parsed = dotenv.parse(await fs.readFile(envPath));
  const environment = { ...parsed, ...process.env };
  const config = readConfig(environment);

  const connection = await connectDb(config);
  client = connection.client;
  const db = connection.db;

  await migrate(db);
  await seed(db);
  await createAdmin(db, environment.ADMIN_EMAIL, environment.ADMIN_PASSWORD);

  console.log(
    "Setup complete. Run npm run dev:server and npm run dev in separate terminals.",
  );
} catch (error) {
  console.error("Local setup failed:", error.code || error.message);
  console.error("Ensure MongoDB is running at your configured MONGODB_URI. See README.md.");
  process.exitCode = 1;
} finally {
  if (client) await client.close();
}
