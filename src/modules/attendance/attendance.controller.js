import * as attendanceService from "./attendance.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getUserId } from "../../utils/getUserId.js";

export const checkIn = asyncHandler(async (req, res) => {
  const attendance = await attendanceService.checkInService(getUserId(req), req.body);
  res.status(201).json({ success: true, message: "Checked in", data: attendance });
});

export const checkOut = asyncHandler(async (req, res) => {
  const attendance = await attendanceService.checkOutService(getUserId(req), req.body);
  res.status(200).json({ success: true, message: "Checked out", data: attendance });
});

export const getToday = asyncHandler(async (req, res) => {
  const attendance = await attendanceService.getTodayService(getUserId(req));
  res.status(200).json({ success: true, data: attendance });
});

export const getHistory = asyncHandler(async (req, res) => {
  const result = await attendanceService.historyService(getUserId(req), req.query);
  res.status(200).json({ success: true, data: result });
});

export const getMonthlySummary = asyncHandler(async (req, res) => {
  const summary = await attendanceService.monthlySummaryService(getUserId(req), req.query);
  res.status(200).json({ success: true, data: summary });
});

// ---- Admin ----
export const setOverride = asyncHandler(async (req, res) => {
  const override = await attendanceService.setOverrideService(getUserId(req), req.body);
  res.status(201).json({ success: true, message: "Attendance status override set", data: override });
});

export const listOverrides = asyncHandler(async (req, res) => {
  const result = await attendanceService.listOverridesService(req.query);
  res.status(200).json({ success: true, data: result });
});

export const removeOverride = asyncHandler(async (req, res) => {
  await attendanceService.removeOverrideService(req.params.id);
  res.status(200).json({ success: true, message: "Override removed" });
});