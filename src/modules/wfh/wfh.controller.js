import * as wfhService from "./wfh.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const getWfhLocation = asyncHandler(async (req, res) => {
  const location = await wfhService.getWfhLocationService(req.params.id);
  res.status(200).json({ success: true, data: location });
});

export const upsertWfhLocation = asyncHandler(async (req, res) => {
  const location = await wfhService.upsertWfhLocationService(req.params.id, req.body);
  res.status(200).json({ success: true, message: "WFH location saved", data: location });
});

export const updateWfhStatus = asyncHandler(async (req, res) => {
  const location = await wfhService.updateWfhStatusService(req.params.id, req.body.status);
  res.status(200).json({ success: true, message: "WFH status updated", data: location });
});