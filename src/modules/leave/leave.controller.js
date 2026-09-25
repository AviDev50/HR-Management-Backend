import * as leaveService from "./leave.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getUserId } from "../../utils/getUserId.js";

// ---- Employee (self) ----
export const listLeaveTypes = asyncHandler(async (req, res) => {
  const types = await leaveService.listMyLeaveTypesService();
  res.status(200).json({ success: true, data: types });
});

export const getMyBalance = asyncHandler(async (req, res) => {
  const balance = await leaveService.getMyBalanceService(getUserId(req), req.query);
  res.status(200).json({ success: true, data: balance });
});

export const applyLeave = asyncHandler(async (req, res) => {
  const request = await leaveService.applyLeaveService(getUserId(req), req.body);
  res.status(201).json({ success: true, message: "Leave request submitted", data: request });
});

export const getMyLeaveHistory = asyncHandler(async (req, res) => {
  const result = await leaveService.listMyLeaveHistoryService(getUserId(req), req.query);
  res.status(200).json({ success: true, data: result });
});

export const getLeaveRequest = asyncHandler(async (req, res) => {
  const request = await leaveService.getLeaveRequestService(req.params.id, req.user);
  res.status(200).json({ success: true, data: request });
});

export const cancelLeaveRequest = asyncHandler(async (req, res) => {
  const request = await leaveService.cancelLeaveRequestService(req.params.id, getUserId(req));
  res.status(200).json({ success: true, message: "Leave request cancelled", data: request });
});

// ---- Admin ----
export const adminListLeaveTypes = asyncHandler(async (req, res) => {
  const types = await leaveService.listAllLeaveTypesService();
  res.status(200).json({ success: true, data: types });
});

export const createLeaveType = asyncHandler(async (req, res) => {
  const type = await leaveService.createLeaveTypeService(req.body);
  res.status(201).json({ success: true, message: "Leave type created", data: type });
});

export const updateLeaveType = asyncHandler(async (req, res) => {
  const type = await leaveService.updateLeaveTypeService(req.params.id, req.body);
  res.status(200).json({ success: true, message: "Leave type updated", data: type });
});

export const updateLeaveTypeStatus = asyncHandler(async (req, res) => {
  const type = await leaveService.updateLeaveTypeStatusService(req.params.id, req.body.status);
  res.status(200).json({ success: true, message: "Leave type status updated", data: type });
});

export const listBalances = asyncHandler(async (req, res) => {
  const result = await leaveService.listBalancesService(req.query);
  res.status(200).json({ success: true, data: result });
});

export const createBalance = asyncHandler(async (req, res) => {
  const balance = await leaveService.createBalanceService(req.body);
  res.status(201).json({ success: true, message: "Leave balance allocated", data: balance });
});

export const updateBalance = asyncHandler(async (req, res) => {
  const balance = await leaveService.updateBalanceService(req.params.id, req.body);
  res.status(200).json({ success: true, message: "Leave balance updated", data: balance });
});

export const listAllLeaveRequests = asyncHandler(async (req, res) => {
  const result = await leaveService.listAllLeaveRequestsService(req.query);
  res.status(200).json({ success: true, data: result });
});

export const approveLeaveRequest = asyncHandler(async (req, res) => {
  const request = await leaveService.approveLeaveRequestService(req.params.id, getUserId(req));
  res.status(200).json({ success: true, message: "Leave request approved", data: request });
});

export const rejectLeaveRequest = asyncHandler(async (req, res) => {
  const request = await leaveService.rejectLeaveRequestService(
    req.params.id,
    getUserId(req),
    req.body.reason
  );
  res.status(200).json({ success: true, message: "Leave request rejected", data: request });
});