import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readConfig } from "../config.js";
import { connectDb } from "../db.js";
import { importNitwCatalog } from "./import-nitw.js";

export async function seed(db) {
  const catalog = JSON.parse(
    await fs.readFile(
      new URL("../../shared/nitwCatalog.json", import.meta.url),
      "utf8",
    ),
  );
  await importNitwCatalog(db, catalog, { overwrite: false });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let client;
  try {
    const config = readConfig();
    const { client: mongoClient, db } = await connectDb(config);
    client = mongoClient;
    await seed(db);
    console.log(
      "Official NITW catalog seeded; existing records preserved. No reviews were added.",
    );
  } catch (error) {
    console.error("Seed failed:", error.code || error.message);
    process.exitCode = 1;
  } finally {
    if (client) await client.close();
  }
}
