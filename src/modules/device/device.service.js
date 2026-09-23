import * as deviceModel from "./device.model.js";
import { createError } from "../../utils/createError.js";

export async function requestDeviceChangeService(employeeId, body) {
  const { device } = body;
  if (!device || !device.device_id || !device.platform) {
    throw createError("VALIDATION_ERROR", 422, "Device details are required.");
  }

  const activeDevice = await deviceModel.findActiveDeviceByEmployeeId(employeeId);
  if (!activeDevice) {
    throw createError(
      "VALIDATION_ERROR",
      422,
      "No active device found for this employee. Log in with this device to register it directly."
    );
  }
  if (activeDevice.device_id === device.device_id) {
    throw createError("VALIDATION_ERROR", 422, "This device is already the active device.");
  }

  const pending = await deviceModel.findPendingRequestByEmployeeId(employeeId);
  if (pending) {
    throw createError("DEVICE_CHANGE_PENDING", 409, "A device change request is already pending approval.");
  }

  const requestId = await deviceModel.createChangeRequest({
    employeeId,
    oldEmployeeDeviceId: activeDevice.employee_device_id,
    newDevice: device,
  });

  return deviceModel.findChangeRequestById(requestId);
}

export async function getDeviceStatusService(employeeId) {
  const activeDevice = await deviceModel.findActiveDeviceByEmployeeId(employeeId);
  const pendingRequest = await deviceModel.findPendingRequestByEmployeeId(employeeId);

  return {
    active_device: activeDevice || null,
    pending_request: pendingRequest || null,
  };
}

export async function listChangeRequestsService(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;

  const { rows, total } = await deviceModel.listChangeRequests({
    limit,
    offset,
    status: query.status || null,
  });

  return {
    items: rows,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
}

export async function listEmployeeDeviceHistoryService(employeeId) {
  return deviceModel.listEmployeeDeviceHistory(employeeId);
}

export async function approveChangeRequestService(requestId, adminId) {
  await deviceModel.approveChangeRequest(requestId, adminId);
  return deviceModel.findChangeRequestById(requestId);
}

export async function rejectChangeRequestService(requestId, adminId, reason) {
  await deviceModel.rejectChangeRequest(requestId, adminId, reason);
  return deviceModel.findChangeRequestById(requestId);
}