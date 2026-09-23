import * as authService from "./auth.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const loginEmployee = asyncHandler(async (req, res) => {
  const result = await authService.loginEmployeeService(req.body);
  res.status(200).json({ success: true, data: result });
});

export const loginAdmin = asyncHandler(async (req, res) => {
  const result = await authService.loginAdminService(req.body);
  res.status(200).json({ success: true, data: result });
});

export const refreshToken = asyncHandler(async (req, res) => {
  const result = await authService.refreshTokenService(req.body.refresh_token);
  res.status(200).json({ success: true, data: result });
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logoutService(req.body.refresh_token);
  res.status(200).json({ success: true, message: "Logged out" });
});

export const getMe = asyncHandler(async (req, res) => {
  // req.user is set by requireAuth middleware ({ id, role })
  res.status(200).json({ success: true, data: req.user });
});