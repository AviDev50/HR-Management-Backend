import * as attendanceModel from "./attendance.model.js";
import * as employeeModel from "../employee/employee.model.js";
import { createError } from "../../utils/createError.js";
import { haversineDistanceMeters } from "../../utils/geo.js";
import {
  getISTDateString,
  getWeekdayAbbrev,
  istDateTimeToUtcDate,
  parseDbDatetimeUtc,
  diffInMinutes,
} from "../../utils/time.js";

/**
 * Priority order (per attendance_status_override table comment):
 * manual override > weekend > full-day holiday > full-day approved leave > normal.
 * Half-day holiday/leave do NOT block check-in in this MVP - they're informational.
 */
export async function resolveNonWorkingReason(employeeId, dateStr, officeSetting) {
  const override = await attendanceModel.findOverrideByEmployeeDate(employeeId, dateStr);
  if (override) {
    const code =
      override.status === "ON_LEAVE" || override.status === "HALF_DAY_LEAVE"
        ? "ON_APPROVED_LEAVE"
        : override.status === "HOLIDAY" || override.status === "HALF_DAY_HOLIDAY"
        ? "FULL_DAY_HOLIDAY"
        : "ADMIN_OVERRIDE_ABSENT";
    return { blocked: true, code, status: override.status };
  }

  const weekday = getWeekdayAbbrev();
  if (officeSetting.weekly_off && officeSetting.weekly_off.split(",").includes(weekday)) {
    return { blocked: true, code: "WEEKEND", status: "WEEKEND" };
  }

  const holiday = await attendanceModel.findHolidayByDate(dateStr);
  if (holiday && holiday.holiday_type === "FULL_DAY") {
    return { blocked: true, code: "FULL_DAY_HOLIDAY", status: "HOLIDAY" };
  }

  const leave = await attendanceModel.findApprovedLeaveByDate(employeeId, dateStr);
  if (leave && leave.leave_duration_type === "FULL_DAY") {
    return { blocked: true, code: "ON_APPROVED_LEAVE", status: "ON_LEAVE" };
  }

  return { blocked: false };
}

function validateGps(body, officeSetting) {
  const { latitude, longitude, accuracy } = body;

  if (latitude == null || longitude == null) {
    throw createError("GPS_PERMISSION_REQUIRED", 422, "Location is required.");
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw createError("VALIDATION_ERROR", 422, "Invalid GPS coordinates.");
  }
  if (accuracy != null && accuracy > officeSetting.max_gps_accuracy) {
    throw createError("GPS_ACCURACY_LOW", 422, "GPS accuracy is below the required threshold.");
  }

  const distance = haversineDistanceMeters(
    latitude,
    longitude,
    officeSetting.latitude,
    officeSetting.longitude
  );
  if (distance > officeSetting.allowed_radius) {
    throw createError(
      "OUTSIDE_AUTHORIZED_LOCATION",
      403,
      "You are outside your authorized attendance location."
    );
  }
}

export async function checkInService(employeeId, body) {
  const { device_id } = body;
  if (!device_id) {
    throw createError("VALIDATION_ERROR", 422, "device_id is required.");
  }

  const activeDevice = await attendanceModel.findActiveDeviceByEmployeeId(employeeId);
  if (!activeDevice || activeDevice.device_id !== device_id) {
    throw createError("DEVICE_NOT_AUTHORIZED", 403, "Current device is not authorized.");
  }

  const employee = await employeeModel.findEmployeeById(employeeId);
  if (!employee || employee.status !== "ACTIVE") {
    throw createError("EMPLOYEE_INACTIVE", 403, "This employee account is disabled.");
  }

  const officeSetting = await attendanceModel.getOfficeSetting();
  if (!officeSetting) {
    throw createError("VALIDATION_ERROR", 500, "Office location is not configured.");
  }

  const now = new Date();
  const attendanceDate = getISTDateString(now);

  const nonWorking = await resolveNonWorkingReason(employeeId, attendanceDate, officeSetting);
  if (nonWorking.blocked) {
    throw createError(nonWorking.code, 409, `Normal check-in is not applicable (${nonWorking.status}).`);
  }

  const existing = await attendanceModel.findAttendanceByEmployeeDate(employeeId, attendanceDate);
  if (existing && existing.status !== "NOT_CHECKED_IN") {
    throw createError("ALREADY_CHECKED_IN", 409, "Attendance already recorded for today.");
  }

  validateGps(body, officeSetting);

  const expectedLoginUtc = istDateTimeToUtcDate(attendanceDate, employee.expected_login_time);
  const lateMinutes = Math.max(0, diffInMinutes(now, expectedLoginUtc));

  const rowData = {
    employee_id: employeeId,
    attendance_date: attendanceDate,
    expected_login_time: employee.expected_login_time,
    expected_logout_time: employee.expected_logout_time,
    actual_check_in: now,
    late_minutes: lateMinutes,
    latitude: body.latitude,
    longitude: body.longitude,
    accuracy: body.accuracy ?? null,
    device_id,
  };

  let attendanceId;
  if (existing) {
    await attendanceModel.updateExistingRowToCheckIn(existing.attendance_id, rowData);
    attendanceId = existing.attendance_id;
  } else {
    attendanceId = await attendanceModel.createCheckInRow(rowData);
  }

  return attendanceModel.findAttendanceById(attendanceId);
}

export async function checkOutService(employeeId, body) {
  const { device_id } = body;
  if (!device_id) {
    throw createError("VALIDATION_ERROR", 422, "device_id is required.");
  }

  const activeDevice = await attendanceModel.findActiveDeviceByEmployeeId(employeeId);
  if (!activeDevice || activeDevice.device_id !== device_id) {
    throw createError("DEVICE_NOT_AUTHORIZED", 403, "Current device is not authorized.");
  }

  const officeSetting = await attendanceModel.getOfficeSetting();
  const attendanceDate = getISTDateString(new Date());
  const existing = await attendanceModel.findAttendanceByEmployeeDate(employeeId, attendanceDate);

  if (!existing || existing.status !== "CHECKED_IN") {
    throw createError("CHECKIN_REQUIRED", 409, "No open check-in found for today.");
  }

  validateGps(body, officeSetting);

  const now = new Date();
  const expectedLogoutUtc = istDateTimeToUtcDate(attendanceDate, existing.expected_logout_time);
  const earlyMinutes = Math.max(0, diffInMinutes(expectedLogoutUtc, now));
  const checkInUtc = parseDbDatetimeUtc(existing.actual_check_in);
  const workedMinutes = Math.max(0, diffInMinutes(now, checkInUtc));

  await attendanceModel.updateCheckOut(existing.attendance_id, {
    actual_check_out: now,
    early_checkout_minutes: earlyMinutes,
    worked_minutes: workedMinutes,
    latitude: body.latitude,
    longitude: body.longitude,
    accuracy: body.accuracy ?? null,
  });

  return attendanceModel.findAttendanceById(existing.attendance_id);
}

export async function getTodayService(employeeId) {
  const attendanceDate = getISTDateString(new Date());
  const existing = await attendanceModel.findAttendanceByEmployeeDate(employeeId, attendanceDate);
  if (existing) return existing;

  // no row yet (cron hasn't pre-created it / employee hasn't checked in) -
  // compute what today WOULD be without creating a row
  const officeSetting = await attendanceModel.getOfficeSetting();
  const nonWorking = await resolveNonWorkingReason(employeeId, attendanceDate, officeSetting);
  return {
    attendance_date: attendanceDate,
    status: nonWorking.blocked ? nonWorking.status : "NOT_CHECKED_IN",
  };
}

export async function historyService(employeeId, query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 30, 1), 100);
  const offset = (page - 1) * limit;

  const { rows, total } = await attendanceModel.listAttendanceHistory(employeeId, {
    from: query.from || null,
    to: query.to || null,
    limit,
    offset,
  });

  return { items: rows, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } };
}

function weekdayAbbrevForDateString(dateStr) {
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return days[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
}

/**
 * Aggregated from attendance rows already stored by the midnight cron
 * (present/absent/leave/holiday are all row statuses, not recomputed).
 * Weekend days are computed from the calendar since weekend rows are
 * never stored (derived-only, same as everywhere else in this app).
 */
export async function monthlySummaryService(employeeId, query) {
  const now = new Date();
  const year = parseInt(query.year, 10) || now.getFullYear();
  const month = parseInt(query.month, 10) || now.getMonth() + 1; // 1-12

  if (month < 1 || month > 12) {
    throw createError("VALIDATION_ERROR", 422, "month must be between 1 and 12.");
  }

  const mm = String(month).padStart(2, "0");
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDate = `${year}-${mm}-01`;
  const endDate = `${year}-${mm}-${String(daysInMonth).padStart(2, "0")}`;

  const officeSetting = await attendanceModel.getOfficeSetting();
  const weeklyOffDays = officeSetting?.weekly_off ? officeSetting.weekly_off.split(",") : ["SUN"];

  let weekendDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${mm}-${String(d).padStart(2, "0")}`;
    if (weeklyOffDays.includes(weekdayAbbrevForDateString(dateStr))) weekendDays++;
  }

  const agg = await attendanceModel.getMonthlyAggregate(employeeId, startDate, endDate);

  const fullHolidayDays = Number(agg.full_holiday_days) || 0;
  const halfHolidayDays = Number(agg.half_holiday_days) || 0;
  const leaveDays = (Number(agg.full_leave_days) || 0) + (Number(agg.half_leave_days) || 0) * 0.5;
  const totalWorkedMinutes = Number(agg.total_worked_minutes) || 0;

  return {
    year,
    month,
    working_days: daysInMonth - weekendDays - fullHolidayDays,
    present_days: Number(agg.present_days) || 0,
    absent_days: Number(agg.absent_days) || 0,
    leave_days: leaveDays,
    weekend_days: weekendDays,
    holiday_days: fullHolidayDays,
    half_day_holiday_days: halfHolidayDays,
    late_count: Number(agg.late_count) || 0,
    total_late_minutes: Number(agg.total_late_minutes) || 0,
    early_count: Number(agg.early_count) || 0,
    total_early_minutes: Number(agg.total_early_minutes) || 0,
    worked_hours: Math.floor(totalWorkedMinutes / 60),
    worked_minutes_remainder: totalWorkedMinutes % 60,
  };
}

// ---- admin: attendance_status_override ----

const OVERRIDE_STATUSES = ["ABSENT", "ON_LEAVE", "HALF_DAY_LEAVE", "HOLIDAY", "HALF_DAY_HOLIDAY"];

export async function setOverrideService(adminId, body) {
  const { employee_id, attendance_date, status, reason } = body;

  if (!employee_id || !attendance_date || !status) {
    throw createError("VALIDATION_ERROR", 422, "employee_id, attendance_date and status are required.");
  }
  if (!OVERRIDE_STATUSES.includes(status)) {
    throw createError("VALIDATION_ERROR", 422, `status must be one of: ${OVERRIDE_STATUSES.join(", ")}.`);
  }

  const employee = await employeeModel.findEmployeeById(employee_id);
  if (!employee) {
    throw createError("VALIDATION_ERROR", 404, "Employee not found.");
  }

  const id = await attendanceModel.upsertOverride({
    employeeId: employee_id,
    attendanceDate: attendance_date,
    status,
    reason,
    adminId,
  });

  return attendanceModel.findOverrideById(id);
}

export async function listOverridesService(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 30, 1), 100);
  const offset = (page - 1) * limit;

  const { rows, total } = await attendanceModel.listOverrides({
    employeeId: query.employee_id || null,
    from: query.from || null,
    to: query.to || null,
    limit,
    offset,
  });

  return { items: rows, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } };
}

export async function removeOverrideService(id) {
  const override = await attendanceModel.findOverrideById(id);
  if (!override) {
    throw createError("VALIDATION_ERROR", 404, "Override not found.");
  }
  await attendanceModel.softDeleteOverride(id);
}