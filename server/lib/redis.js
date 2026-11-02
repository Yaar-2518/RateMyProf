import Redis from "ioredis";

export function createRedis(config, { worker = false } = {}) {
  if (!config.redisUrl) return null;
  const client = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: worker ? null : 1,
    connectTimeout: 5000,
    retryStrategy: (n) => Math.min(n * 500, 10000),
    enableOfflineQueue: worker,
  });
  // Never log a URL, password, payload, or connection error message.
  client.on("error", () => {});
  return client;
}

export function createCache(redis) {
  return {
    async get(key) {
      try { return redis ? JSON.parse(await redis.get(`rmp:cache:${key}`)) : null; }
      catch { return null; }
    },
    async set(key, value, seconds = 300) {
      try { if (redis) await redis.set(`rmp:cache:${key}`, JSON.stringify(value), "EX", seconds); }
      catch { /* Cache failure must not prevent a database-backed read. */ }
    },
  };
}
