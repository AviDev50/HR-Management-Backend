import { Router } from "express";
import * as reportController from "./report.controller.js";
import { requireAuth, requireRole } from "../../middlewares/auth.js";

const router = Router();

router.get("/admin/reports/daily", requireAuth, requireRole("ADMIN"), reportController.getDailyReport);
router.get("/admin/reports/monthly", requireAuth, requireRole("ADMIN"), reportController.getMonthlyReport);
router.get("/admin/reports/late", requireAuth, requireRole("ADMIN"), reportController.getLateReport);
router.get("/admin/reports/leave", requireAuth, requireRole("ADMIN"), reportController.getLeaveReport);
router.get("/admin/reports/export", requireAuth, requireRole("ADMIN"), reportController.exportExcel);

export default router;