import * as deviceService from "./device.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getUserId } from "../../utils/getUserId.js";

// ---- Employee (self) ----
export const requestDeviceChange = asyncHandler(async (req, res) => {
  const request = await deviceService.requestDeviceChangeService(getUserId(req), req.body);
  res.status(201).json({ success: true, message: "Device change request submitted", data: request });
});

export const getDeviceStatus = asyncHandler(async (req, res) => {
  const status = await deviceService.getDeviceStatusService(getUserId(req));
  res.status(200).json({ success: true, data: status });
});

// ---- Admin ----
export const listChangeRequests = asyncHandler(async (req, res) => {
  const result = await deviceService.listChangeRequestsService(req.query);
  res.status(200).json({ success: true, data: result });
});

export const getEmployeeDeviceHistory = asyncHandler(async (req, res) => {
  const history = await deviceService.listEmployeeDeviceHistoryService(req.params.id);
  res.status(200).json({ success: true, data: history });
});

export const approveChangeRequest = asyncHandler(async (req, res) => {
  const request = await deviceService.approveChangeRequestService(req.params.id, getUserId(req));
  res.status(200).json({ success: true, message: "Device change approved", data: request });
});

export const rejectChangeRequest = asyncHandler(async (req, res) => {
  const request = await deviceService.rejectChangeRequestService(
    req.params.id,
    getUserId(req),
    req.body.reason
  );
  res.status(200).json({ success: true, message: "Device change rejected", data: request });
});