import * as holidayService from "./holiday.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

// ---- Employee (self) ----
export const listMyHolidays = asyncHandler(async (req, res) => {
  const holidays = await holidayService.listMyHolidaysService(req.query);
  res.status(200).json({ success: true, data: holidays });
});

// ---- Admin ----
export const listHolidays = asyncHandler(async (req, res) => {
  const result = await holidayService.listHolidaysService(req.query);
  res.status(200).json({ success: true, data: result });
});

export const createHoliday = asyncHandler(async (req, res) => {
  const holiday = await holidayService.createHolidayService(req.body);
  res.status(201).json({ success: true, message: "Holiday created", data: holiday });
});

export const updateHoliday = asyncHandler(async (req, res) => {
  const holiday = await holidayService.updateHolidayService(req.params.id, req.body);
  res.status(200).json({ success: true, message: "Holiday updated", data: holiday });
});

export const deleteHoliday = asyncHandler(async (req, res) => {
  await holidayService.deleteHolidayService(req.params.id);
  res.status(200).json({ success: true, message: "Holiday deleted" });
});