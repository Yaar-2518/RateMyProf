import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import { createIntelligenceService } from "../services/intelligence.js";

export function intelligenceRoutes(db, config, jobs, cache) {
  const router = Router();
  const service = createIntelligenceService(db, config, jobs, cache);
  router.get("/professors/:id/summary", async (req, res) => res.json(await service.summary(req.params.id)));
  router.post("/professors/:id/summary/retry", requireAdmin, async (req, res) => res.json(await service.retrySummary(req.params.id)));
  router.get("/compare", async (req, res) => res.json(await service.comparison({
    courseId: req.query.course, professorIds: typeof req.query.professors === "string" ? req.query.professors.split(",") : [],
    semester: req.query.semester || "",
  })));
  router.get("/moderation/reviews", requireAdmin, async (req, res) => res.json({ reviews: await service.moderationList() }));
  router.patch("/moderation/reviews/:id", requireAdmin, async (req, res) => res.json(await service.moderate(req.params.id, req.user, req.body)));
  return router;
}
