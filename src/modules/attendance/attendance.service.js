import * as attendanceModel from "./attendance.model.js";
import * as employeeModel from "../employee/employee.model.js";
import * as officeModel from "../office/office.model.js";
import * as wfhModel from "../wfh/wfh.model.js";
import { createError } from "../../utils/createError.js";
import { haversineDistanceMeters } from "../../utils/geo.js";
import {
  getISTDateString,
  getWeekdayAbbrev,
  getWeekdayAbbrevForDateString,
  istDateTimeToUtcDate,
  parseDbDatetimeUtc,
  diffInMinutes,
} from "../../utils/time.js";

/**
 * Priority order (per attendance_status_override table comment):
 * manual override > weekend > full-day holiday > full-day approved leave > normal.
 * Half-day holiday/leave do NOT block check-in in this MVP - they're informational.
 */
export async function resolveNonWorkingReason(
  employeeId,
  dateStr,
  officeSetting,
) {
  const override = await attendanceModel.findOverrideByEmployeeDate(
    employeeId,
    dateStr,
  );
  if (override) {
    const code =
      override.status === "ON_LEAVE" || override.status === "HALF_DAY_LEAVE"
        ? "ON_APPROVED_LEAVE"
        : override.status === "HOLIDAY" ||
            override.status === "HALF_DAY_HOLIDAY"
          ? "FULL_DAY_HOLIDAY"
          : "ADMIN_OVERRIDE_ABSENT";
    return { blocked: true, code, status: override.status };
  }

  const weekday = getWeekdayAbbrev();
  if (
    officeSetting.weekly_off &&
    officeSetting.weekly_off.split(",").includes(weekday)
  ) {
    return { blocked: true, code: "WEEKEND", status: "WEEKEND" };
  }

  const holiday = await attendanceModel.findHolidayByDate(dateStr);
  if (holiday && holiday.holiday_type === "FULL_DAY") {
    return { blocked: true, code: "FULL_DAY_HOLIDAY", status: "HOLIDAY" };
  }

  const leave = await attendanceModel.findApprovedLeaveByDate(
    employeeId,
    dateStr,
  );
  if (leave && leave.leave_duration_type === "FULL_DAY") {
    return { blocked: true, code: "ON_APPROVED_LEAVE", status: "ON_LEAVE" };
  }

  return { blocked: false };
}

/**
 * Multi-branch: uses this employee's assigned office (employee_office)
 * for geofence validation if one exists, else falls back to the
 * default/first office_setting row (unassigned employees keep working
 * exactly as before this feature existed).
 */
async function resolveGeofenceOffice(employeeId, defaultOfficeSetting) {
  const assigned = await officeModel.getAssignedOfficeSetting(employeeId);
  return assigned || defaultOfficeSetting;
}

const STALE_LOCATION_MS = 5 * 60 * 1000;

const safeNum = (v, max) =>
  Number.isFinite(v) && Math.abs(v) <= max ? v : null;

// DB error se 403 kabhi 500 na ban jaye, isliye log fail hone par sirf console mein likho
async function logSuspiciousAttempt(data) {
  try {
    await attendanceModel.insertSuspiciousAttempt(data);
  } catch (err) {
    console.error("[security] failed to log suspicious attempt:", err);
  }
}

/**
 * Fake GPS checks - check-in aur check-out dono se pehle chalta hai.
 * Block: is_mocked === true, ya is_mocked / location_timestamp missing.
 * Sirf flag + log: purani location, accuracy 0, ek jaisi accuracy baar-baar.
 */
async function runLocationSecurityChecks(employeeId, action, body, deviceId) {
  const { is_mocked, location_timestamp, latitude, longitude, accuracy } = body;

  const locTs = location_timestamp ? new Date(location_timestamp) : null;
  const base = {
    employee_id: employeeId,
    action,
    latitude: safeNum(latitude, 90),
    longitude: safeNum(longitude, 180),
    accuracy: safeNum(accuracy, 99999),
    device_id: deviceId,
    location_timestamp: locTs && !isNaN(locTs.getTime()) ? locTs : null,
    attendance_date: getISTDateString(new Date()),
  };

  if (typeof is_mocked !== "boolean" || !base.location_timestamp) {
    await logSuspiciousAttempt({
      ...base,
      type: "MISSING_MOCK_FLAG",
      is_blocked: true,
    });
    throw createError(
      "VALIDATION_ERROR",
      422,
      "is_mocked (boolean) and a valid location_timestamp are required.",
    );
  }

  if (is_mocked === true) {
    await logSuspiciousAttempt({
      ...base,
      type: "MOCK_LOCATION",
      is_blocked: true,
    });
    throw createError(
      "MOCK_LOCATION_DETECTED",
      403,
      "Fake location detected. Attendance not marked.",
    );
  }

  const flags = [];
  if (
    Math.abs(Date.now() - base.location_timestamp.getTime()) > STALE_LOCATION_MS
  ) {
    flags.push("STALE_LOCATION");
  }
  if (accuracy === 0) {
    flags.push("ZERO_ACCURACY");
  }
  if (action === "CHECK_IN" && base.accuracy != null) {
    const recent = await attendanceModel.getRecentCheckInAccuracies(
      employeeId,
      5,
    );
    if (
      recent.length === 5 &&
      recent.every((a) => Number(a) === Number(base.accuracy))
    ) {
      flags.push("REPEATED_ACCURACY");
    }
  }
  for (const type of flags) {
    await logSuspiciousAttempt({ ...base, type, is_blocked: false });
  }
}

function validateGpsShape(body, defaultOfficeSetting) {
  const { latitude, longitude, accuracy } = body;

  if (latitude == null || longitude == null) {
    throw createError("GPS_PERMISSION_REQUIRED", 422, "Location is required.");
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw createError("VALIDATION_ERROR", 422, "Invalid GPS coordinates.");
  }
  // accuracy threshold is a device/GPS-quality setting, kept on the
  // default office row regardless of which location (office or WFH) matches
  if (accuracy != null && accuracy > defaultOfficeSetting.max_gps_accuracy) {
    throw createError(
      "GPS_ACCURACY_LOW",
      422,
      "GPS accuracy is below the required threshold.",
    );
  }
}

/**
 * Check-in: tries the office geofence first, then the employee's own
 * WFH geofence (if configured and ACTIVE). Whichever matches becomes
 * this attendance row's location_type - checkout later is locked to it.
 */
async function resolveCheckInLocation(employeeId, body, defaultOfficeSetting) {
  validateGpsShape(body, defaultOfficeSetting);
  const { latitude, longitude } = body;

  const officeSetting = await resolveGeofenceOffice(
    employeeId,
    defaultOfficeSetting,
  );
  const officeDistance = haversineDistanceMeters(
    latitude,
    longitude,
    officeSetting.latitude,
    officeSetting.longitude,
  );
  if (officeDistance <= officeSetting.allowed_radius) {
    return "OFFICE";
  }

  const wfhLocation = await wfhModel.findActiveWfhLocation(employeeId);
  if (wfhLocation) {
    const wfhDistance = haversineDistanceMeters(
      latitude,
      longitude,
      wfhLocation.latitude,
      wfhLocation.longitude,
    );
    if (wfhDistance <= wfhLocation.radius_meters) {
      return "WFH";
    }
  }

  throw createError(
    "OUTSIDE_AUTHORIZED_LOCATION",
    403,
    "You are outside your authorized attendance location.",
  );
}

/**
 * Check-out: validated against the SAME location_type recorded at
 * check-in - not "anywhere authorized". A WFH check-in must check out
 * from the same WFH location; an office check-in must check out from
 * the (assigned) office.
 */
async function validateCheckOutLocation(
  employeeId,
  body,
  locationType,
  defaultOfficeSetting,
) {
  validateGpsShape(body, defaultOfficeSetting);
  const { latitude, longitude } = body;

  if (locationType === "WFH") {
    const wfhLocation = await wfhModel.findActiveWfhLocation(employeeId);
    if (!wfhLocation) {
      throw createError(
        "WFH_NOT_ENABLED",
        403,
        "WFH location is no longer configured.",
      );
    }
    const distance = haversineDistanceMeters(
      latitude,
      longitude,
      wfhLocation.latitude,
      wfhLocation.longitude,
    );
    if (distance > wfhLocation.radius_meters) {
      throw createError(
        "OUTSIDE_AUTHORIZED_LOCATION",
        403,
        "Checkout must be from the same WFH location you checked in from.",
      );
    }
    return;
  }

  const officeSetting = await resolveGeofenceOffice(
    employeeId,
    defaultOfficeSetting,
  );
  const distance = haversineDistanceMeters(
    latitude,
    longitude,
    officeSetting.latitude,
    officeSetting.longitude,
  );
  if (distance > officeSetting.allowed_radius) {
    throw createError(
      "OUTSIDE_AUTHORIZED_LOCATION",
      403,
      "You are outside your authorized attendance location.",
    );
  }
}

export async function checkInService(employeeId, body) {
  const { device_id } = body;
  if (!device_id) {
    throw createError("VALIDATION_ERROR", 422, "device_id is required.");
  }

  const activeDevice =
    await attendanceModel.findActiveDeviceByEmployeeId(employeeId);
  if (!activeDevice || activeDevice.device_id !== device_id) {
    throw createError(
      "DEVICE_NOT_AUTHORIZED",
      403,
      "Current device is not authorized.",
    );
  }

  await runLocationSecurityChecks(employeeId, "CHECK_IN", body, device_id);

  const employee = await employeeModel.findEmployeeById(employeeId);
  if (!employee || employee.status !== "ACTIVE") {
    throw createError(
      "EMPLOYEE_INACTIVE",
      403,
      "This employee account is disabled.",
    );
  }

  const officeSetting = await attendanceModel.getOfficeSetting();
  if (!officeSetting) {
    throw createError(
      "VALIDATION_ERROR",
      500,
      "Office location is not configured.",
    );
  }

  const now = new Date();
  const attendanceDate = getISTDateString(now);

  const nonWorking = await resolveNonWorkingReason(
    employeeId,
    attendanceDate,
    officeSetting,
  );
  if (nonWorking.blocked) {
    throw createError(
      nonWorking.code,
      409,
      `Normal check-in is not applicable (${nonWorking.status}).`,
    );
  }

  const existing = await attendanceModel.findAttendanceByEmployeeDate(
    employeeId,
    attendanceDate,
  );
  if (existing && existing.status !== "NOT_CHECKED_IN") {
    throw createError(
      "ALREADY_CHECKED_IN",
      409,
      "Attendance already recorded for today.",
    );
  }

  const locationType = await resolveCheckInLocation(
    employeeId,
    body,
    officeSetting,
  );

  const expectedLoginUtc = istDateTimeToUtcDate(
    attendanceDate,
    employee.expected_login_time,
  );
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
    location_type: locationType,
  };

  let attendanceId;
  if (existing) {
    await attendanceModel.updateExistingRowToCheckIn(
      existing.attendance_id,
      rowData,
    );
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

  const activeDevice =
    await attendanceModel.findActiveDeviceByEmployeeId(employeeId);
  if (!activeDevice || activeDevice.device_id !== device_id) {
    throw createError(
      "DEVICE_NOT_AUTHORIZED",
      403,
      "Current device is not authorized.",
    );
  }

  await runLocationSecurityChecks(employeeId, "CHECK_OUT", body, device_id);

  const officeSetting = await attendanceModel.getOfficeSetting();
  const attendanceDate = getISTDateString(new Date());
  const existing = await attendanceModel.findAttendanceByEmployeeDate(
    employeeId,
    attendanceDate,
  );

  if (!existing || existing.status !== "CHECKED_IN") {
    throw createError(
      "CHECKIN_REQUIRED",
      409,
      "No open check-in found for today.",
    );
  }

  await validateCheckOutLocation(
    employeeId,
    body,
    existing.location_type,
    officeSetting,
  );

  const now = new Date();
  const expectedLogoutUtc = istDateTimeToUtcDate(
    attendanceDate,
    existing.expected_logout_time,
  );
  const earlyMinutes = Math.max(0, diffInMinutes(expectedLogoutUtc, now));
  const checkInUtc = parseDbDatetimeUtc(existing.actual_check_in);
  // worked time expected logout par cap hoga, chahe employee baad mein checkout kare
  const workEndUtc = now < expectedLogoutUtc ? now : expectedLogoutUtc;
  const workedMinutes = Math.max(0, diffInMinutes(workEndUtc, checkInUtc));

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
  const existing = await attendanceModel.findAttendanceByEmployeeDate(
    employeeId,
    attendanceDate,
  );
  if (existing) return existing;

  // no row yet (cron hasn't pre-created it / employee hasn't checked in) -
  // compute what today WOULD be without creating a row
  const officeSetting = await attendanceModel.getOfficeSetting();
  const nonWorking = await resolveNonWorkingReason(
    employeeId,
    attendanceDate,
    officeSetting,
  );
  return {
    attendance_date: attendanceDate,
    status: nonWorking.blocked ? nonWorking.status : "NOT_CHECKED_IN",
  };
}

export async function historyService(employeeId, query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 30, 1), 100);
  const offset = (page - 1) * limit;

  const { rows, total } = await attendanceModel.listAttendanceHistory(
    employeeId,
    {
      from: query.from || null,
      to: query.to || null,
      limit,
      offset,
    },
  );

  return {
    items: rows,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
}

/**
 * Metrics per spec section 52. Weekend/working days are computed by
 * walking the calendar (weekend rows are never stored - see
 * resolveNonWorkingReason), everything else comes from stored attendance
 * rows for the month.
 */
export async function monthlySummaryService(employeeId, query) {
  const now = new Date();
  const todayIST = getISTDateString(now);
  const [todayYear, todayMonth] = todayIST.split("-").map(Number);

  const year = parseInt(query.year, 10) || todayYear;
  const month = parseInt(query.month, 10) || todayMonth;
  if (month < 1 || month > 12) {
    throw createError(
      "VALIDATION_ERROR",
      422,
      "month must be between 1 and 12.",
    );
  }

  const pad = (n) => String(n).padStart(2, "0");
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDate = `${year}-${pad(month)}-01`;
  const endDate = `${year}-${pad(month)}-${pad(daysInMonth)}`;

  const officeSetting = await attendanceModel.getOfficeSetting();
  const weeklyOff = officeSetting?.weekly_off
    ? officeSetting.weekly_off.split(",")
    : [];

  let weekendDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad(month)}-${pad(d)}`;
    if (weeklyOff.includes(getWeekdayAbbrevForDateString(dateStr)))
      weekendDays++;
  }

  const agg = await attendanceModel.getMonthlyAggregate(
    employeeId,
    startDate,
    endDate,
    todayIST,
  );

  const leaveDays =
    Number(agg.full_leave_days) + Number(agg.half_leave_days) * 0.5;
  const holidayDays =
    Number(agg.full_holiday_days) + Number(agg.half_holiday_days) * 0.5;
  const absentDays = Number(agg.missed_days) + Number(agg.override_absent_days);
  const workingDays = daysInMonth - weekendDays - Number(agg.full_holiday_days);
  const totalWorkedMinutes = Number(agg.total_worked_minutes);

  return {
    year,
    month,
    working_days: workingDays,
    present_days: Number(agg.present_days),
    absent_days: absentDays,
    leave_days: leaveDays,
    weekend_days: weekendDays,
    holiday_days: holidayDays,
    late_count: Number(agg.late_count),
    total_late_minutes: Number(agg.total_late_minutes),
    early_count: Number(agg.early_count),
    total_early_minutes: Number(agg.total_early_minutes),
    worked_hours: `${Math.floor(totalWorkedMinutes / 60)}h ${totalWorkedMinutes % 60}m`,
    total_worked_minutes: totalWorkedMinutes,
  };
}

// ---- admin: attendance_status_override ----

const OVERRIDE_STATUSES = [
  "ABSENT",
  "ON_LEAVE",
  "HALF_DAY_LEAVE",
  "HOLIDAY",
  "HALF_DAY_HOLIDAY",
];

export async function setOverrideService(adminId, body) {
  const { employee_id, attendance_date, status, reason } = body;

  if (!employee_id || !attendance_date || !status) {
    throw createError(
      "VALIDATION_ERROR",
      422,
      "employee_id, attendance_date and status are required.",
    );
  }
  if (!OVERRIDE_STATUSES.includes(status)) {
    throw createError(
      "VALIDATION_ERROR",
      422,
      `status must be one of: ${OVERRIDE_STATUSES.join(", ")}.`,
    );
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

  return {
    items: rows,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
}

export async function removeOverrideService(id) {
  const override = await attendanceModel.findOverrideById(id);
  if (!override) {
    throw createError("VALIDATION_ERROR", 404, "Override not found.");
  }
  await attendanceModel.softDeleteOverride(id);
}

export async function listSuspiciousAttemptsService(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 30, 1), 100);
  const offset = (page - 1) * limit;

  const { rows, total } = await attendanceModel.listSuspiciousAttempts({
    employeeId: query.employee_id || null,
    type: query.type || null,
    from: query.from || null,
    to: query.to || null,
    limit,
    offset,
  });

  return {
    items: rows,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
}
