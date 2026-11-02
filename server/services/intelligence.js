import { createHash } from "node:crypto";
import { HttpError, requireValue } from "../lib/errors.js";
import { id, text } from "../lib/validation.js";
import { privacyFlags } from "../lib/review-privacy.js";
import { ratingLabels } from "../../shared/reviewOptions.js";

export const fingerprint = (rows) => createHash("sha256").update(JSON.stringify(rows)).digest("hex");

export function createIntelligenceService(db, config, jobs, cache) {
  const reviews = db.collection("reviews");
  const summaries = db.collection("ai_summaries");

  async function summarySource(professorId) {
    const rows = await reviews.find({ professor_id: professorId, status: "published" }, {
      projection: { _id: 1, ai_text: 1, ai_cleared: 1, screening: 1 },
    }).sort({ _id: 1 }).toArray();
    // The fingerprint includes all published IDs. Removal invalidates even when
    // text was not eligible for AI. No private text is included in cache keys.
    const revision = fingerprint(rows.map(r => [r._id, r.ai_text || "", !!r.ai_cleared, r.screening?.flags || []]));
    const eligible = rows.filter(r => r.ai_cleared && r.ai_text?.trim() && !privacyFlags(r.ai_text).length && r.screening?.recommendation === "no_policy_concern" && !r.screening.flags.length);
    // Balanced deterministic bounded sample, not an ever-growing model input.
    const sample = eligible.length <= 50 ? eligible : Array.from({ length: 50 }, (_, i) => eligible[Math.floor(i * eligible.length / 50)]);
    return { revision, total: rows.length, eligibleCount: eligible.length, sample };
  }

  async function summary(professorId) {
    id(professorId);
    requireValue(await db.collection("professors").findOne({ _id: professorId }), "Professor not found.", 404);
    const source = await summarySource(professorId);
    const base = { reviewCount: source.total, eligibleCount: source.eligibleCount, minimumReviews: config.ai.minimumReviews };
    if (source.eligibleCount < config.ai.minimumReviews) return { ...base, state: "insufficient_data" };
    if (config.ai.provider !== "gemini") return { ...base, state: "unavailable" };
    const key = `summary-${professorId}-${source.revision}`;
    const saved = await summaries.findOne({ _id: professorId, revision: source.revision });
    // Read current Mongo state first, so moderation never serves an old cached summary.
    if (saved?.state === "ready") {
      const result = await cache.get(key) || { ...base, state: "ready", text: saved.text, updatedAt: saved.updated_at, sampleCount: saved.sample_count };
      await cache.set(key, result);
      return result;
    }
    if (!saved) {
      try {
        await summaries.updateOne({ _id: professorId }, { $set: { revision: source.revision, state: "queued", due: new Date(), attempts: 0 }, $unset: { text: "", error_code: "", lease_until: "" } }, { upsert: true });
      } catch (error) { if (error.code !== 11000) throw error; }
    }
    if (!saved || saved.state === "queued") await jobs.enqueue("summary", professorId, source.revision);
    return { ...base, state: saved?.state === "failed" ? "unavailable" : "processing" };
  }

  async function comparison({ courseId, professorIds, semester = "" }) {
    id(courseId);
    requireValue(Array.isArray(professorIds) && professorIds.length >= 2 && professorIds.length <= 3, "Select two or three professors.");
    const selected = [...new Set(professorIds.map(id))].sort();
    requireValue(selected.length === professorIds.length, "Select different professors.");
    if (semester) requireValue(/^(Spring|Autumn) 20\d{2}$/.test(semester), "Invalid semester.");
    const course = await db.collection("courses").findOne({ _id: courseId });
    requireValue(course, "Course not found.", 404);
    const links = await db.collection("professor_courses").find({ courseId, professorId: { $in: selected } }).toArray();
    requireValue(selected.every(p => links.some(l => l.professorId === p)), "Every selected professor must teach this course.");
    const professors = await db.collection("professors").find({ _id: { $in: selected } }).toArray();
    requireValue(professors.length === selected.length, "Professor not found.", 404);
    const rows = await reviews.find({ status: "published", course_id: courseId, professor_id: { $in: selected }, ...(semester ? { semester } : {}) }, { projection: { _id: 1, professor_id: 1, ratings: 1 } }).sort({ _id: 1 }).toArray();
    const key = `compare-${fingerprint([courseId, selected, semester, rows, professors.map(p => p.name), course.name])}`;
    const hit = await cache.get(key);
    if (hit) return hit;
    const result = {
      course: { id: course._id, name: course.name, code: course.code }, semester,
      labels: ratingLabels, minimumReviews: 3,
      professors: selected.map(professorId => {
        const matches = rows.filter(r => r.professor_id === professorId);
        const count = matches.length;
        return { id: professorId, name: professors.find(p => p._id === professorId).name, reviewCount: count, sufficientData: count >= 3,
          averages: ratingLabels.map((_, i) => count ? matches.reduce((sum, r) => sum + r.ratings[i], 0) / count : null) };
      }),
    };
    await cache.set(key, result);
    return result;
  }

  async function moderationList() {
    const rows = await reviews.find({ status: { $in: ["pending", "rejected"] } }).sort({ created_at: -1 }).limit(100).toArray();
    return rows.map(r => ({ id: r._id, professorId: r.professor_id, courseId: r.course_id, text: r.review_text,
      ratings: r.ratings, semester: r.semester, status: r.status, screeningState: r.screening_state,
      screening: r.screening || null, aiText: r.ai_text || "", aiCleared: !!r.ai_cleared,
      errorCode: r.screening_error || null, date: r.created_at, revision: r.screening_revision,
      audit: r.audit || [] }));
  }

  async function moderate(reviewId, actor, body) {
    id(reviewId);
    requireValue(["screen", "approve", "reject", "retry"].includes(body.action), "Choose a moderation action.");
    const row = await reviews.findOne({ _id: reviewId });
    requireValue(row, "Review not found.", 404);
    requireValue(row.status === "pending", "This review has already been resolved.", 409);
    const now = new Date();
    const update = { $push: { audit: { action: body.action, moderatorId: actor.id, at: now, reason: text(body.reason || "", "Reason", 500, true) } } };
    if (body.action === "approve" || body.action === "reject") {
      requireValue(["complete", "awaiting_privacy_review", "failed"].includes(row.screening_state), "Wait for local screening to finish before deciding.", 409);
      if (body.action === "approve") requireValue(!privacyFlags(row.review_text).length, "This original review contains possible private information. Reject it instead of publishing.");
      update.$set = { status: body.action === "approve" ? "published" : "rejected", moderated_at: now };
    } else {
      requireValue(row.screening_state !== "processing", "Screening is in progress.", 409);
      const revision = row.screening_revision + 1;
      if (body.action === "screen") {
        requireValue(body.privacyConfirmed === true, "Confirm that the AI copy contains no personal, sensitive, or confidential information.");
        const aiText = text(body.aiText, "De-identified review", 1000);
        requireValue(!privacyFlags(aiText).length, "Remove contact details, student identifiers, and sensitive information from the AI copy.");
        update.$set = { ai_text: aiText, ai_cleared: true };
      }
      update.$set = { ...update.$set, screening_state: "queued", screening_revision: revision, screening_due: now, screening_attempts: 0 };
      update.$unset = { screening_error: "", screening_lease: "" };
    }
    const changed = await reviews.updateOne({ _id: reviewId, status: "pending", screening_revision: row.screening_revision, screening_state: row.screening_state }, update);
    if (!changed.modifiedCount) throw new HttpError(409, "Review changed. Refresh the queue.");
    if (body.action === "screen" || body.action === "retry") await jobs.enqueue("screen", reviewId, update.$set.screening_revision);
    if (body.action === "approve") await summary(row.professor_id).catch(() => {});
    return { message: body.action === "approve" ? "Review published." : body.action === "reject" ? "Review rejected." : "Screening queued." };
  }

  async function retrySummary(professorId) {
    id(professorId);
    await summaries.deleteOne({ _id: professorId, state: "failed" });
    return summary(professorId);
  }
  return { summary, summarySource, comparison, moderationList, moderate, retrySummary };
}
