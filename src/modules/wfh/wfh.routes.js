import { Router } from "express";
import * as wfhController from "./wfh.controller.js";
import { requireAuth, requireRole } from "../../middlewares/auth.js";

const router = Router();

router.get(
  "/admin/employees/:id/wfh-location",
  requireAuth,
  requireRole("ADMIN"),
  wfhController.getWfhLocation
);
router.put(
  "/admin/employees/:id/wfh-location",
  requireAuth,
  requireRole("ADMIN"),
  wfhController.upsertWfhLocation
);
router.patch(
  "/admin/employees/:id/wfh-location/status",
  requireAuth,
  requireRole("ADMIN"),
  wfhController.updateWfhStatus
);

export default router;