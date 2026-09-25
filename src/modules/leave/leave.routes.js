import { Router } from "express";
import * as leaveController from "./leave.controller.js";
import { requireAuth, requireRole } from "../../middlewares/auth.js";

const router = Router();

// Employee (self)
router.get("/leave/types", requireAuth, requireRole("EMPLOYEE"), leaveController.listLeaveTypes);
router.get("/leave/balance", requireAuth, requireRole("EMPLOYEE"), leaveController.getMyBalance);
router.get("/leave/history", requireAuth, requireRole("EMPLOYEE"), leaveController.getMyLeaveHistory);
router.post("/leave/requests", requireAuth, requireRole("EMPLOYEE"), leaveController.applyLeave);
router.get("/leave/requests/:id", requireAuth, requireRole("EMPLOYEE"), leaveController.getLeaveRequest);
router.post(
  "/leave/requests/:id/cancel",
  requireAuth,
  requireRole("EMPLOYEE"),
  leaveController.cancelLeaveRequest
);

// Admin
router.get("/admin/leave/types", requireAuth, requireRole("ADMIN"), leaveController.adminListLeaveTypes);
router.post("/admin/leave/types", requireAuth, requireRole("ADMIN"), leaveController.createLeaveType);
router.put("/admin/leave/types/:id", requireAuth, requireRole("ADMIN"), leaveController.updateLeaveType);
router.patch(
  "/admin/leave/types/:id/status",
  requireAuth,
  requireRole("ADMIN"),
  leaveController.updateLeaveTypeStatus
);
router.get("/admin/leave/balances", requireAuth, requireRole("ADMIN"), leaveController.listBalances);
router.post("/admin/leave/balances", requireAuth, requireRole("ADMIN"), leaveController.createBalance);
router.put("/admin/leave/balances/:id", requireAuth, requireRole("ADMIN"), leaveController.updateBalance);
router.get(
  "/admin/leave/requests",
  requireAuth,
  requireRole("ADMIN"),
  leaveController.listAllLeaveRequests
);
router.get(
  "/admin/leave/requests/:id",
  requireAuth,
  requireRole("ADMIN"),
  leaveController.getLeaveRequest
);
router.post(
  "/admin/leave/requests/:id/approve",
  requireAuth,
  requireRole("ADMIN"),
  leaveController.approveLeaveRequest
);
router.post(
  "/admin/leave/requests/:id/reject",
  requireAuth,
  requireRole("ADMIN"),
  leaveController.rejectLeaveRequest
);

export default router;