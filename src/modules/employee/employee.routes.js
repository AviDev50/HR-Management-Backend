import { Router } from "express";
import * as employeeController from "./employee.controller.js";
import { requireAuth, requireRole } from "../../middlewares/auth.js";

const router = Router();

// Admin
router.get("/admin/employees", requireAuth, requireRole("ADMIN"), employeeController.listEmployees);
router.post("/admin/employees", requireAuth, requireRole("ADMIN"), employeeController.createEmployee);
router.get("/admin/employees/:id", requireAuth, requireRole("ADMIN"), employeeController.getEmployee);
router.put("/admin/employees/:id", requireAuth, requireRole("ADMIN"), employeeController.updateEmployee);
router.patch(
  "/admin/employees/:id/status",
  requireAuth,
  requireRole("ADMIN"),
  employeeController.updateEmployeeStatus
);

// Employee (self)
router.get("/profile", requireAuth, requireRole("EMPLOYEE"), employeeController.getMyProfile);
router.put("/profile", requireAuth, requireRole("EMPLOYEE"), employeeController.updateMyProfile);

export default router;