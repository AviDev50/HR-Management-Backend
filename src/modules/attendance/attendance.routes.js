import { Router } from "express";
import * as attendanceController from "./attendance.controller.js";
import { requireAuth, requireRole } from "../../middlewares/auth.js";

const router = Router();

router.get("/attendance/today", requireAuth, requireRole("EMPLOYEE"), attendanceController.getToday);
router.post("/attendance/check-in", requireAuth, requireRole("EMPLOYEE"), attendanceController.checkIn);
router.post("/attendance/check-out", requireAuth, requireRole("EMPLOYEE"), attendanceController.checkOut);
router.get("/attendance/history", requireAuth, requireRole("EMPLOYEE"), attendanceController.getHistory);
router.get(
  "/attendance/monthly-summary",
  requireAuth,
  requireRole("EMPLOYEE"),
  attendanceController.getMonthlySummary
);

// Admin - manual status override
router.post(
  "/admin/attendance/overrides",
  requireAuth,
  requireRole("ADMIN"),
  attendanceController.setOverride
);
router.get(
  "/admin/attendance/overrides",
  requireAuth,
  requireRole("ADMIN"),
  attendanceController.listOverrides
);
router.delete(
  "/admin/attendance/overrides/:id",
  requireAuth,
  requireRole("ADMIN"),
  attendanceController.removeOverride
);

export default router;