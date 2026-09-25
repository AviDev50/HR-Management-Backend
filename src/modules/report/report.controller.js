import * as reportService from "./report.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const getDailyReport = asyncHandler(async (req, res) => {
  const result = await reportService.dailyReportService(req.query);
  res.status(200).json({ success: true, data: result });
});

export const getMonthlyReport = asyncHandler(async (req, res) => {
  const result = await reportService.monthlyReportService(req.query);
  res.status(200).json({ success: true, data: result });
});

export const getLateReport = asyncHandler(async (req, res) => {
  const result = await reportService.lateReportService(req.query);
  res.status(200).json({ success: true, data: result });
});

export const getLeaveReport = asyncHandler(async (req, res) => {
  const result = await reportService.leaveReportService(req.query);
  res.status(200).json({ success: true, data: result });
});

export const exportExcel = asyncHandler(async (req, res) => {
  const { buffer, filename } = await reportService.exportMonthlyExcelService(req.query);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(buffer);
});