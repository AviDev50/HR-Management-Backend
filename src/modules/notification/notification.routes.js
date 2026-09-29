// src/modules/notification/notification.routes.js
import { Router } from "express";
import * as c from "./notification.controller.js";
import { requireAuth,requireRole } from "../../middlewares/auth.js"; // adjust; add your employee-role guard too

const router = Router();

router.post("/notifications/fcm-token", requireAuth,requireRole("EMPLOYEE"), c.registerToken);
router.delete("/notifications/fcm-token", requireAuth,requireRole("EMPLOYEE"), c.removeToken);
router.get("/notifications", requireAuth,requireRole("EMPLOYEE"), c.list);
router.get("/notifications/unread-count", requireAuth,requireRole("EMPLOYEE"), c.unreadCount);
router.patch("/notifications/read-all", requireAuth,requireRole("EMPLOYEE"), c.markAllRead); // must stay before /:id
router.patch("/notifications/:id/read", requireAuth,requireRole("EMPLOYEE"), c.markRead);

export default router;