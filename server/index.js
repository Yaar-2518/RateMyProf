import { readConfig } from "./config.js";
import { connectDb } from "./db.js";
import { createApp } from "./app.js";

let client;
try {
  const config = readConfig();
  const { client: mongoClient, db } = await connectDb(config);
  client = mongoClient;
  // Verify connectivity by checking a known collection.
  await db.command({ ping: 1 });
  const { app, store } = await createApp(db, config);
  const server = app.listen(config.port, "127.0.0.1", () =>
    console.log(
      `RateMyProf API: http://localhost:${config.port} · mail: ${config.mail.mode}`,
    ),
  );
  const cleanup = setInterval(
    () => store.prune().catch(() => console.error("Session cleanup failed.")),
    3600000,
  );
  cleanup.unref();
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      clearInterval(cleanup);
      server.close(async () => {
        await client.close();
        process.exit(0);
      });
    });
} catch (error) {
  console.error("Server could not start:", error.code || error.message);
  console.error(
    "Check .env, start MongoDB, and run npm run db:init. See README.md.",
  );
  if (client) await client.close();
  process.exitCode = 1;
}
