import { readConfig } from "../config.js";
import { connectDb } from "../db.js";
import { createRedis } from "../lib/redis.js";
import { createGemini } from "../lib/gemini.js";

const config = readConfig();
let failed = false;
async function check(name, work) {
  try { await work(); console.log(`${name}: OK`); }
  catch { failed = true; console.log(`${name}: unavailable; check configuration/service. Credentials are never printed.`); }
}
await check("MongoDB", async () => { const { client, db } = await connectDb(config); try { await db.command({ ping: 1 }); } finally { await client.close(); } });
await check("Redis", async () => {
  const redis = createRedis(config);
  if (!redis) throw new Error();
  try { await redis.connect(); if (await redis.ping() !== "PONG") throw new Error(); }
  finally { redis.disconnect(); }
});
console.log(`Email: ${config.mail.mode === "file" ? "local files under .local/mail" : "SMTP configured (delivery not tested)"}`);
if (process.argv.includes("--ai")) await check("Gemini (fictional text)", () => createGemini(config).assess("The lectures explain concepts clearly, but the assignments require considerable preparation."));
else console.log("Gemini: live call skipped; add --ai to test with fictional text.");
process.exitCode = failed ? 1 : 0;
