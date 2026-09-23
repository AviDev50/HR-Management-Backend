import { Router } from "express";
import * as authController from "./auth.controller.js";
import { requireAuth } from "../../middlewares/auth.js";

const router = Router();

router.post("/auth/login", authController.loginEmployee);
router.post("/admin/auth/login", authController.loginAdmin);
router.post("/auth/refresh-token", authController.refreshToken);
router.post("/auth/logout", authController.logout);
router.get("/auth/me", requireAuth, authController.getMe);

export default router;