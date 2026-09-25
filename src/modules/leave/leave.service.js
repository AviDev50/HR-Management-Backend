import * as leaveModel from "./leave.model.js";
import { createError } from "../../utils/createError.js";

function daysBetweenInclusive(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

// ---- leave types ----

export async function listMyLeaveTypesService() {
  return leaveModel.findActiveLeaveTypes();
}

export async function listAllLeaveTypesService() {
  return leaveModel.listAllLeaveTypes();
}

export async function createLeaveTypeService(body) {
  const { name, code, default_annual_days } = body;
  if (!name || !code || default_annual_days == null) {
    throw createError("VALIDATION_ERROR", 422, "name, code and default_annual_days are required.");
  }
  const exists = await leaveModel.findLeaveTypeByCode(code);
  if (exists) {
    throw createError("VALIDATION_ERROR", 409, "A leave type with this code already exists.");
  }
  const id = await leaveModel.createLeaveType({ name, code, default_annual_days });
  return leaveModel.findLeaveTypeById(id);
}

export async function updateLeaveTypeService(id, body) {
  const leaveType = await leaveModel.findLeaveTypeById(id);
  if (!leaveType) throw createError("LEAVE_TYPE_NOT_FOUND", 404, "Leave type not found.");
  const { name, default_annual_days } = body;
  if (!name || default_annual_days == null) {
    throw createError("VALIDATION_ERROR", 422, "name and default_annual_days are required.");
  }
  await leaveModel.updateLeaveType(id, { name, default_annual_days });
  return leaveModel.findLeaveTypeById(id);
}

export async function updateLeaveTypeStatusService(id, status) {
  if (!["ACTIVE", "INACTIVE"].includes(status)) {
    throw createError("VALIDATION_ERROR", 422, "status must be ACTIVE or INACTIVE.");
  }
  const leaveType = await leaveModel.findLeaveTypeById(id);
  if (!leaveType) throw createError("LEAVE_TYPE_NOT_FOUND", 404, "Leave type not found.");
  await leaveModel.updateLeaveTypeStatus(id, status);
  return leaveModel.findLeaveTypeById(id);
}

// ---- balances ----

export async function getMyBalanceService(employeeId, query) {
  const year = parseInt(query.year, 10) || new Date().getFullYear();
  const { rows } = await leaveModel.listBalances({ employeeId, year, limit: 50, offset: 0 });
  return rows;
}

export async function listBalancesService(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;

  const { rows, total } = await leaveModel.listBalances({
    employeeId: query.employee_id || null,
    year: query.year ? parseInt(query.year, 10) : null,
    limit,
    offset,
  });

  return { items: rows, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } };
}

export async function createBalanceService(body) {
  const { employee_id, leave_type_id, year, allocated_days } = body;
  if (!employee_id || !leave_type_id || !year) {
    throw createError("VALIDATION_ERROR", 422, "employee_id, leave_type_id and year are required.");
  }

  const leaveType = await leaveModel.findLeaveTypeById(leave_type_id);
  if (!leaveType) throw createError("LEAVE_TYPE_NOT_FOUND", 404, "Leave type not found.");

  const existing = await leaveModel.findBalance(employee_id, leave_type_id, year);
  if (existing) {
    throw createError("VALIDATION_ERROR", 409, "Balance already allocated for this employee/type/year.");
  }

  // no carry-forward - every year starts fresh at default_annual_days unless overridden
  const finalAllocated = allocated_days != null ? allocated_days : leaveType.default_annual_days;

  const id = await leaveModel.createBalance({
    employee_id,
    leave_type_id,
    year,
    allocated_days: finalAllocated,
  });
  return leaveModel.findBalanceById(id);
}

export async function updateBalanceService(id, body) {
  const balance = await leaveModel.findBalanceById(id);
  if (!balance) throw createError("LEAVE_TYPE_NOT_FOUND", 404, "Leave balance not found.");

  const { allocated_days } = body;
  if (allocated_days == null || allocated_days < 0) {
    throw createError("VALIDATION_ERROR", 422, "allocated_days is required and must be >= 0.");
  }
  if (allocated_days < balance.used_days) {
    throw createError(
      "VALIDATION_ERROR",
      422,
      "allocated_days cannot be less than days already used."
    );
  }

  await leaveModel.updateBalanceAllocation(id, allocated_days);
  return leaveModel.findBalanceById(id);
}

// ---- leave requests ----

export async function applyLeaveService(employeeId, body) {
  const { leave_type_id, start_date, end_date, leave_duration_type, reason } = body;

  if (!leave_type_id || !start_date || !end_date || !leave_duration_type) {
    throw createError("VALIDATION_ERROR", 422, "leave_type_id, start_date, end_date and leave_duration_type are required.");
  }
  if (start_date > end_date) {
    throw createError("INVALID_LEAVE_DATES", 422, "start_date cannot be after end_date.");
  }
  if (leave_duration_type !== "FULL_DAY" && start_date !== end_date) {
    throw createError("INVALID_LEAVE_DATES", 422, "Half-day leave must have the same start_date and end_date.");
  }

  const leaveType = await leaveModel.findLeaveTypeById(leave_type_id);
  if (!leaveType || leaveType.status !== "ACTIVE") {
    throw createError("LEAVE_TYPE_NOT_FOUND", 404, "Leave type not found.");
  }

  const overlap = await leaveModel.findOverlappingRequest(employeeId, start_date, end_date);
  if (overlap) {
    throw createError("LEAVE_OVERLAP", 409, "An overlapping leave request already exists.");
  }

  const total_days =
    leave_duration_type === "FULL_DAY" ? daysBetweenInclusive(start_date, end_date) : 0.5;

  const year = new Date(`${start_date}T00:00:00Z`).getFullYear();
  const balance = await leaveModel.findBalance(employeeId, leave_type_id, year);
  if (!balance || Number(balance.remaining_days) < total_days) {
    throw createError("INSUFFICIENT_LEAVE_BALANCE", 409, "Insufficient leave balance.");
  }

  const id = await leaveModel.createLeaveRequest({
    employee_id: employeeId,
    leave_type_id,
    start_date,
    end_date,
    leave_duration_type,
    total_days,
    reason,
  });

  return leaveModel.findLeaveRequestById(id);
}

export async function getLeaveRequestService(id, requester) {
  const request = await leaveModel.findLeaveRequestById(id);
  if (!request) throw createError("LEAVE_TYPE_NOT_FOUND", 404, "Leave request not found.");
  if (requester.role === "EMPLOYEE" && request.employee_id !== requester.id) {
    throw createError("FORBIDDEN", 403, "You cannot view another employee's leave request.");
  }
  return request;
}

export async function listMyLeaveHistoryService(employeeId, query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;

  const { rows, total } = await leaveModel.listLeaveRequests({
    employeeId,
    status: query.status || null,
    limit,
    offset,
  });
  return { items: rows, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } };
}

export async function listAllLeaveRequestsService(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;

  const { rows, total } = await leaveModel.listLeaveRequests({
    employeeId: query.employee_id || null,
    status: query.status || null,
    limit,
    offset,
  });
  return { items: rows, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } };
}

export async function cancelLeaveRequestService(id, employeeId) {
  await leaveModel.cancelLeaveRequest(id, employeeId);
  return leaveModel.findLeaveRequestById(id);
}

export async function approveLeaveRequestService(id, adminId) {
  await leaveModel.approveLeaveRequest(id, adminId);
  return leaveModel.findLeaveRequestById(id);
}

export async function rejectLeaveRequestService(id, adminId, reason) {
  await leaveModel.rejectLeaveRequest(id, adminId, reason);
  return leaveModel.findLeaveRequestById(id);
}