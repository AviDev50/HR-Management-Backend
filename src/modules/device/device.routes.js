import { Router } from "express";
import * as deviceController from "./device.controller.js";
import { requireAuth, requireRole } from "../../middlewares/auth.js";

const router = Router();

// Employee (self)
router.post(
  "/devices/change-request",
  requireAuth,
  requireRole("EMPLOYEE"),
  deviceController.requestDeviceChange
);

router.get("/devices/status", requireAuth, requireRole("EMPLOYEE"), deviceController.getDeviceStatus);

// Admin
router.get(
  "/admin/device-change-requests",
  requireAuth,
  requireRole("ADMIN"),
  deviceController.listChangeRequests
);
router.post(
  "/admin/device-change-requests/:id/approve",
  requireAuth,
  requireRole("ADMIN"),
  deviceController.approveChangeRequest
);
router.post(
  "/admin/device-change-requests/:id/reject",
  requireAuth,
  requireRole("ADMIN"),
  deviceController.rejectChangeRequest
);
router.get(
  "/admin/employees/:id/devices",
  requireAuth,
  requireRole("ADMIN"),
  deviceController.getEmployeeDeviceHistory
);

export default router;