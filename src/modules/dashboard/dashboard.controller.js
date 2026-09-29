import * as dashboardService from "./dashboard.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const getDashboardSummary = asyncHandler(async (req, res) => {
  const summary = await dashboardService.getDashboardSummaryService();
  res.status(200).json({ success: true, data: summary });
});