import { Queue } from "bullmq";
import { createRedis } from "../lib/redis.js";

export function createJobs(config) {
  const connection = createRedis(config);
  const queue = connection ? new Queue(config.queueName || "rmp-intelligence", {
    connection, defaultJobOptions: {
      attempts: 3, backoff: { type: "exponential", delay: 30000 },
      removeOnComplete: { age: 3600, count: 200 }, removeOnFail: { age: 86400, count: 200 },
    },
  }) : null;
  queue?.on("error", () => {});
  return {
    async enqueue(kind, id, revision) {
      if (!queue) return false;
      let timer;
      try {
        const task = async () => {
        const jobId = `${kind}-${id}-${revision}`;
        const existing = await queue.getJob(jobId);
        if (existing && ["completed", "failed"].includes(await existing.getState())) await existing.remove();
        await queue.add(kind, { id, revision }, { jobId });
        return true;
        };
        return await Promise.race([task(), new Promise(resolve => { timer = setTimeout(() => resolve(false), 3000); })]);
      } catch { return false; }
      finally { clearTimeout(timer); } // Durable Mongo work markers allow later recovery.
    },
    async close() { await queue?.close(); connection?.disconnect(); },
  };
}
