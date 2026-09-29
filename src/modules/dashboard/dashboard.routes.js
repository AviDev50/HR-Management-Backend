import { Router } from "express";
import * as dashboardController from "./dashboard.controller.js";
import { requireAuth, requireRole } from "../../middlewares/auth.js";

const router = Router();

router.get("/admin/dashboard", requireAuth, requireRole("ADMIN"), dashboardController.getDashboardSummary);

export default router;