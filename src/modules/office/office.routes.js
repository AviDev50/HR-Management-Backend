import { Router } from "express";
import * as officeController from "./office.controller.js";
import { requireAuth, requireRole } from "../../middlewares/auth.js";

const router = Router();

router.get("/admin/offices", requireAuth, requireRole("ADMIN"), officeController.listOffices);
router.post("/admin/offices", requireAuth, requireRole("ADMIN"), officeController.createOffice);
router.get("/admin/offices/:id", requireAuth, requireRole("ADMIN"), officeController.getOffice);
router.put("/admin/offices/:id", requireAuth, requireRole("ADMIN"), officeController.updateOffice);
router.delete("/admin/offices/:id", requireAuth, requireRole("ADMIN"), officeController.deleteOffice);

router.get(
  "/admin/employees/:id/office",
  requireAuth,
  requireRole("ADMIN"),
  officeController.getEmployeeOffice
);
router.put(
  "/admin/employees/:id/office",
  requireAuth,
  requireRole("ADMIN"),
  officeController.assignEmployeeOffice
);

export default router;