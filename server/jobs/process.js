import { createGemini, AIError } from "../lib/gemini.js";
import { localAssessment } from "../lib/review-privacy.js";
import { createIntelligenceService } from "../services/intelligence.js";

export function createProcessor(db, config, { ai = createGemini(config) } = {}) {
  const reviews = db.collection("reviews"), summaries = db.collection("ai_summaries");
  const intelligence = createIntelligenceService(db, config, {}, {});
  async function budget() {
    const key = `gemini-${new Date().toISOString().slice(0, 10)}`;
    try { await db.collection("ai_usage").updateOne({ _id: key }, { $setOnInsert: { count: 0 } }, { upsert: true }); }
    catch (error) { if (error.code !== 11000) throw error; }
    const result = await db.collection("ai_usage").updateOne({ _id: key, count: { $lt: config.ai.dailyLimit } }, { $inc: { count: 1 } });
    if (!result.modifiedCount) throw new AIError("DAILY_AI_LIMIT", true);
  }

  async function screen({ id, revision }) {
    const now = new Date();
    const row = await reviews.findOneAndUpdate({
      _id: id, status: "pending", screening_revision: revision,
      $or: [{ screening_state: "queued", screening_due: { $lte: now } }, { screening_state: "processing", screening_lease: { $lte: now } }],
    }, { $set: { screening_state: "processing", screening_lease: new Date(Date.now() + 120000) } }, { returnDocument: "after" });
    if (!row) return;
    const filter = { _id: id, status: "pending", screening_revision: revision, screening_state: "processing", screening_lease: row.screening_lease };
    try {
      const local = localAssessment(row.review_text);
      if (!row.ai_cleared) {
        await reviews.updateOne(filter, { $set: { screening_state: "awaiting_privacy_review", screening: { ...local, method: "local", checkedAt: new Date() } }, $unset: { screening_lease: "" } });
        return;
      }
      await budget();
      const result = await ai.assess(row.ai_text);
      await reviews.updateOne(filter, { $set: { screening_state: "complete", screening: { ...result, localFlags: local.flags, method: "gemini", model: config.ai.model, checkedAt: new Date() } }, $unset: { screening_lease: "", screening_error: "" } });
    } catch (error) {
      const attempts = (row.screening_attempts || 0) + 1;
      const retry = error.retryable && attempts < 3;
      await reviews.updateOne(filter, { $set: { screening_state: retry ? "queued" : "failed", screening_attempts: attempts,
        screening_due: new Date(Date.now() + (error.code === "DAILY_AI_LIMIT" ? 86400000 : 30000 * 2 ** attempts)),
        screening_error: error instanceof AIError ? error.code : "SCREENING_FAILED" }, $unset: { screening_lease: "" } });
      // Mongo due markers are authoritative; recovery schedules a fresh attempt.
    }
  }

  async function summarize({ id, revision }) {
    const now = new Date();
    const job = await summaries.findOneAndUpdate({ _id: id, revision,
      $or: [{ state: "queued", due: { $lte: now } }, { state: "processing", lease_until: { $lte: now } }],
    }, { $set: { state: "processing", lease_until: new Date(Date.now() + 120000) } }, { returnDocument: "after" });
    if (!job) return;
    const filter = { _id: id, revision, state: "processing", lease_until: job.lease_until };
    try {
      const source = await intelligence.summarySource(id);
      if (source.revision !== revision || source.eligibleCount < config.ai.minimumReviews) {
        await summaries.deleteOne(filter);
        return;
      }
      await budget();
      const result = await ai.summarize(source.sample.map(r => ({ id: r._id, text: r.ai_text })));
      const current = await intelligence.summarySource(id);
      if (current.revision !== revision) { await summaries.deleteOne(filter); return; }
      await summaries.updateOne(filter, { $set: { state: "ready", text: result.text, source_ids: result.sourceIds,
        sample_count: source.sample.length, updated_at: new Date(), model: config.ai.model }, $unset: { lease_until: "", error_code: "" } });
    } catch (error) {
      const attempts = (job.attempts || 0) + 1;
      await summaries.updateOne(filter, { $set: { state: error.retryable && attempts < 3 ? "queued" : "failed", attempts,
        due: new Date(Date.now() + (error.code === "DAILY_AI_LIMIT" ? 86400000 : 30000 * 2 ** attempts)),
        error_code: error instanceof AIError ? error.code : "SUMMARY_FAILED" }, $unset: { lease_until: "" } });
    }
  }

  return async (job) => {
    if (job.name === "screen") return screen(job.data);
    if (job.name === "summary") return summarize(job.data);
    throw new Error("Unknown job type");
  };
}

export async function recoverWork(db, jobs) {
  const now = new Date();
  const rows = await db.collection("reviews").find({ status: "pending", $or: [
    { screening_state: "queued", screening_due: { $lte: now } },
    { screening_state: "processing", screening_lease: { $lte: now } },
  ] }).limit(20).toArray();
  for (const row of rows) await jobs.enqueue("screen", row._id, row.screening_revision);
  const summaries = await db.collection("ai_summaries").find({ $or: [
    { state: "queued", due: { $lte: now } }, { state: "processing", lease_until: { $lte: now } },
  ] }).limit(10).toArray();
  for (const row of summaries) await jobs.enqueue("summary", row._id, row.revision);
}
