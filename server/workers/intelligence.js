import { Worker } from "bullmq";
import { readConfig } from "../config.js";
import { connectDb } from "../db.js";
import { createRedis } from "../lib/redis.js";
import { createJobs } from "../jobs/queue.js";
import { createProcessor, recoverWork } from "../jobs/process.js";

const config = readConfig();
if (!config.redisUrl) throw new Error("Set REDIS_URL before starting the worker.");
const { client, db } = await connectDb(config);
const connection = createRedis(config, { worker: true });
const jobs = createJobs(config);
const worker = new Worker("rmp-intelligence", createProcessor(db, config), { connection, concurrency: 1 });
worker.on("error", () => console.error("Worker connection unavailable; waiting to reconnect."));
worker.on("failed", () => console.error("Background task failed; inspect the admin queue."));
let recovering = false;
async function recover() {
  if (recovering) return;
  recovering = true;
  try { await recoverWork(db, jobs); }
  catch { console.error("Recovery deferred; database or queue unavailable."); }
  finally { recovering = false; }
}
await recover();
const timer = setInterval(recover, 30000);
console.log("Review intelligence worker ready.");
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => {
  clearInterval(timer);
  await worker.close();
  await jobs.close();
  connection.disconnect();
  await client.close();
});
