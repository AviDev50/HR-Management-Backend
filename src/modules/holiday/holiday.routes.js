import { Router } from "express";
import * as holidayController from "./holiday.controller.js";
import { requireAuth, requireRole } from "../../middlewares/auth.js";

const router = Router();

// Employee (self) - read-only
router.get("/holidays", requireAuth, requireRole("EMPLOYEE"), holidayController.listMyHolidays);

// Admin
router.get("/admin/holidays", requireAuth, requireRole("ADMIN"), holidayController.listHolidays);
router.post("/admin/holidays", requireAuth, requireRole("ADMIN"), holidayController.createHoliday);
router.put("/admin/holidays/:id", requireAuth, requireRole("ADMIN"), holidayController.updateHoliday);
router.delete("/admin/holidays/:id", requireAuth, requireRole("ADMIN"), holidayController.deleteHoliday);

export default router;