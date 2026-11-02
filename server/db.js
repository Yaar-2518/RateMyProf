import { MongoClient } from "mongodb";

export async function connectDb(config) {
  const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db();
  return { client, db };
}

// Run a callback inside a MongoDB transaction. The callback receives the session.
export async function transaction(db, work) {
  const session = db.client.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
