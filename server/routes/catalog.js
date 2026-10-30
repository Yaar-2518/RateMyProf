import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import { createCatalogService } from "../services/catalog.js";

export function catalogRoutes(db) {
  const router = Router(),
    catalog = createCatalogService(db);
  router.get("/catalog", async (req, res) =>
    res.json(await catalog.snapshot()),
  );
  router.get("/departments", async (req, res) =>
    res.json({ departments: await catalog.departments() }),
  );
  router.post("/departments", requireAdmin, async (req, res) =>
    res
      .status(201)
      .json({ department: await catalog.saveDepartment(null, req.body) }),
  );
  router.put("/departments/:id", requireAdmin, async (req, res) =>
    res.json({
      department: await catalog.saveDepartment(req.params.id, req.body),
    }),
  );
  router.delete("/departments/:id", requireAdmin, async (req, res) => {
    await catalog.removeDepartment(req.params.id);
    res.json({ message: "Department removed." });
  });
  for (const kind of ["professors", "courses"]) {
    router.get(`/${kind}`, async (req, res) =>
      res.json({ [kind]: await catalog.list(kind, req.query) }),
    );
    router.get(`/${kind}/:id`, async (req, res) =>
      res.json({
        [kind === "professors" ? "professor" : "course"]: await catalog.find(
          kind,
          req.params.id,
        ),
      }),
    );
    router.post(`/${kind}`, requireAdmin, async (req, res) =>
      res.status(201).json({ item: await catalog.save(kind, null, req.body) }),
    );
    router.put(`/${kind}/:id`, requireAdmin, async (req, res) =>
      res.json({ item: await catalog.save(kind, req.params.id, req.body) }),
    );
    router.delete(`/${kind}/:id`, requireAdmin, async (req, res) => {
      await catalog.remove(kind, req.params.id);
      res.json({ message: "Catalog record removed." });
    });
  }
  return router;
}
