import test from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { Worker, Queue } from "bullmq";
import { readConfig } from "../config.js";
import { createRedis, createCache } from "../lib/redis.js";
import { createJobs } from "../jobs/queue.js";
import { createProcessor } from "../jobs/process.js";

async function eventually(work) {
  for (let i = 0; i < 100; i++) {
    if (await work()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail("Background task did not reach its expected state.");
}

test("real Redis queue processes durable reviews, retries safely, and caches expiring results", async (t) => {
  const config = readConfig();
  config.redisUrl = process.env.REDIS_TEST_URL || "redis://127.0.0.1:6379";
  config.queueName = `rmp-test-${process.pid}`;
  const client = new MongoClient(process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017", { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(`rmp_queue_test_${process.pid}`);
  const connection = createRedis(config, { worker: true });
  const jobs = createJobs(config);
  const worker = new Worker(config.queueName, createProcessor(db, config, { ai: {
    assess: async () => ({ flags: [], recommendation: "no_policy_concern", explanation: "Constructive feedback." }),
  } }), { connection });
  worker.on("error", () => {});
  const cleanupQueue = new Queue(config.queueName, { connection });
  const cacheConnection = createRedis(config);
  let cacheKey = `queue-test-${process.pid}`;
  t.after(async () => {
    await worker.close();
    await cleanupQueue.obliterate({ force: true });
    await cleanupQueue.close();
    await jobs.close();
    await cacheConnection.del(`rmp:cache:${cacheKey}`);
    cacheConnection.disconnect();
    connection.disconnect();
    await db.dropDatabase(); await client.close();
  });
  await cacheConnection.connect();
  const cache = createCache(cacheConnection);
  await cache.set(cacheKey, { average: 4.5 }, 10);
  assert.deepEqual(await cache.get(cacheKey), { average: 4.5 });
  assert.ok(await cacheConnection.ttl(`rmp:cache:${cacheKey}`) > 0);

  await db.collection("reviews").insertOne({ _id: "fictional", status: "pending", review_text: "Clear lectures and demanding assignments.", screening_state: "queued", screening_revision: 1, screening_due: new Date() });
  assert.equal(await jobs.enqueue("screen", "fictional", 1), true);
  await eventually(async () => (await db.collection("reviews").findOne({ _id: "fictional" })).screening_state === "awaiting_privacy_review");
  await db.collection("reviews").updateOne({ _id: "fictional" }, { $set: { ai_cleared: true, ai_text: "Clear lectures and demanding assignments.", screening_state: "queued", screening_revision: 2, screening_due: new Date() } });
  assert.equal(await jobs.enqueue("screen", "fictional", 2), true);
  await eventually(async () => (await db.collection("reviews").findOne({ _id: "fictional" })).screening_state === "complete");
  assert.equal((await db.collection("reviews").findOne({ _id: "fictional" })).status, "pending");
  // Re-delivering the same job must not call the model a second time.
  await jobs.enqueue("screen", "fictional", 2);
  assert.equal((await db.collection("ai_usage").findOne({})).count, 1);
});
