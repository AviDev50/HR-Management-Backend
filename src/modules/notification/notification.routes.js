// src/modules/notification/notification.routes.js
import { Router } from "express";
import * as c from "./notification.controller.js";
import { requireAuth } from "../../middlewares/auth.js"; // adjust; add your employee-role guard too

const router = Router();

router.post("/notifications/fcm-token", requireAuth, c.registerToken);
router.delete("/notifications/fcm-token", requireAuth, c.removeToken);
router.get("/notifications", requireAuth, c.list);
router.get("/notifications/unread-count", requireAuth, c.unreadCount);
router.patch("/notifications/read-all", requireAuth, c.markAllRead); // must stay before /:id
router.patch("/notifications/:id/read", requireAuth, c.markRead);

export default router;