// src/modules/notification/notification.controller.js
import { asyncHandler } from "../../utils/asyncHandler.js"; // adjust path/export to yours
import { createError } from "../../utils/createError.js";
import * as svc from "./notification.service.js";

// adjust req.user.id / req.user.device_id to your requireAuth payload
export const registerToken = asyncHandler(async (req, res) => {
  const { fcm_token } = req.body;
  if (!fcm_token || typeof fcm_token !== "string") throw createError("VALIDATION_ERROR", 422, "fcm_token is required");
  await svc.registerToken(req.user.id, req.user.device_id, fcm_token);
  res.json({ success: true });
});

export const removeToken = asyncHandler(async (req, res) => {
  await svc.removeToken(req.user.id, req.user.device_id);
  res.json({ success: true });
});

export const list = asyncHandler(async (req, res) => {
  const data = await svc.listMine(req.user.id, req.query.page, req.query.limit);
  res.json({ success: true, data });
});

export const unreadCount = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { unread: await svc.getUnreadCount(req.user.id) } });
});

export const markRead = asyncHandler(async (req, res) => {
  const n = await svc.markRead(req.user.id, Number(req.params.id));
  if (!n) throw createError("NOT_FOUND", 404, "Notification not found or already read");
  res.json({ success: true });
});

export const markAllRead = asyncHandler(async (req, res) => {
  await svc.markAllRead(req.user.id);
  res.json({ success: true });
});