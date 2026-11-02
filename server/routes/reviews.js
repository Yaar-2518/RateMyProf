import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { requireAccount, requireAdmin } from "../middleware/auth.js";
import { createReviewService } from "../services/reviews.js";
import { HttpError, requireValue } from "../lib/errors.js";
import { id, text } from "../lib/validation.js";

export function reviewRoutes(db, auth, options = {}) {
  const router = Router(),
    reviews = createReviewService(db, auth, options.jobs);
  const reportsCol = db.collection("reports");
  const reviewsCol = db.collection("reviews");

  // ── Reviews ──────────────────────────────────────────────────────────────
  router.get("/reviews", async (req, res) =>
    res.json({ reviews: await reviews.list() }),
  );

  router.post(
    "/reviews",
    requireAccount,
    rateLimit({
      windowMs: 15 * 60000,
      limit: options.test ? 1000 : 20,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: {
          message: "Too many submissions. Try again shortly.",
          code: "RATE_LIMITED",
        },
      },
    }),
    async (req, res) =>
      res.status(201).json(await reviews.submit(req.user, req.body)),
  );

  // ── Reports ───────────────────────────────────────────────────────────────
  // POST /api/reviews/:id/report — any logged-in student can report a review
  router.post("/reviews/:id/report", requireAccount, async (req, res) => {
    const reviewId = id(req.params.id);
    const review = await reviewsCol.findOne({ _id: reviewId, status: "published" });
    requireValue(review, "Review not found.", 404);

    const validReasons = [
      "Personal information",
      "Harassment or hate speech",
      "Spam or unrelated content",
      "Misleading content",
      "Other",
    ];
    const reason = text(req.body.reason ?? "", "Reason", 80);
    requireValue(validReasons.includes(reason), "Choose a valid report reason.");
    const details = text(req.body.details ?? "", "Details", 500, true);

    // One report per user per review
    const existing = await reportsCol.findOne({
      reviewId,
      reportedBy: req.user.id,
    });
    if (existing)
      throw new HttpError(409, "You have already reported this review.", "ALREADY_REPORTED");

    const reportId = randomUUID();
    await reportsCol.insertOne({
      _id: reportId,
      reviewId,
      reportedBy: req.user.id,
      reason,
      details,
      status: "Pending",
      created_at: new Date(),
    });
    res.status(201).json({ id: reportId, message: "Report submitted." });
  });

  // GET /api/reports — admin only; lists all reports with review text
  router.get("/reports", requireAdmin, async (req, res) => {
    const rows = await reportsCol
      .find({})
      .sort({ created_at: -1 })
      .toArray();

    // Enrich with review text
    const reviewIds = [...new Set(rows.map((r) => r.reviewId))];
    const reviewDocs = await reviewsCol
      .find({ _id: { $in: reviewIds } })
      .toArray();
    const reviewMap = Object.fromEntries(reviewDocs.map((r) => [r._id, r]));

    res.json({
      reports: rows.map((r) => {
        const rev = reviewMap[r.reviewId];
        return {
          id: r._id,
          reviewId: r.reviewId,
          reason: r.reason,
          details: r.details,
          status: r.status,
          date: new Date(r.created_at).toISOString().slice(0, 10),
          reviewText: rev?.review_text ?? null,
          professorId: rev?.professor_id ?? null,
        };
      }),
    });
  });

  // PATCH /api/reports/:id — admin only; dismiss or remove
  router.patch("/reports/:id", requireAdmin, async (req, res) => {
    const reportId = id(req.params.id);
    const action = req.body.action;
    requireValue(
      action === "dismiss" || action === "remove",
      'action must be "dismiss" or "remove".',
    );

    const report = await reportsCol.findOne({ _id: reportId });
    requireValue(report, "Report not found.", 404);
    requireValue(report.status === "Pending", "Report is already resolved.", 409);

    const newStatus = action === "remove" ? "Removed" : "Dismissed";
    const resolved = await reportsCol.updateOne(
      { _id: reportId, status: "Pending" },
      { $set: { status: newStatus, resolved_at: new Date() } },
    );

    requireValue(resolved.modifiedCount > 0, "Report is already resolved.", 409);
    if (action === "remove") {
      await reviewsCol.updateOne({ _id: report.reviewId }, { $set: { status: "removed", ai_cleared: false }, $push: { audit: { action: "remove", moderatorId: req.user.id, at: new Date() } } });
      // Mark all reports for that review as Removed
      await reportsCol.updateMany(
        { reviewId: report.reviewId, status: "Pending" },
        { $set: { status: "Removed", resolved_at: new Date() } },
      );
    }

    res.json({ message: `Report ${newStatus.toLowerCase()}.` });
  });

  // DELETE /api/reviews/:id — admin only; direct removal without a report
  router.delete("/reviews/:id", requireAdmin, async (req, res) => {
    const reviewId = id(req.params.id);
    const result = await reviewsCol.updateOne({ _id: reviewId, status: { $ne: "removed" } }, { $set: { status: "removed", ai_cleared: false }, $push: { audit: { action: "remove", moderatorId: req.user.id, at: new Date() } } });
    requireValue(result.modifiedCount > 0, "Review not found.", 404);
    // Clean up associated reports
    await reportsCol.updateMany(
      { reviewId, status: "Pending" },
      { $set: { status: "Removed", resolved_at: new Date() } },
    );
    res.json({ message: "Review removed." });
  });

  return router;
}
