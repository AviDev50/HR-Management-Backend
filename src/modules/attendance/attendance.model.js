import pool from "../../config/db.js";

export async function getOfficeSetting() {
  const [rows] = await pool.query(
    `SELECT office_setting_id, office_name, latitude, longitude, allowed_radius,
            max_gps_accuracy, weekly_off, timezone
     FROM office_setting
     WHERE deleted_at IS NULL
     ORDER BY office_setting_id ASC
     LIMIT 1`
  );
  return rows[0] || null;
}

export async function findActiveDeviceByEmployeeId(employeeId) {
  const [rows] = await pool.query(
    `SELECT employee_device_id, device_id FROM employee_device
     WHERE employee_id = ? AND status = 'ACTIVE' AND deleted_at IS NULL
     LIMIT 1`,
    [employeeId]
  );
  return rows[0] || null;
}

export async function findOverrideByEmployeeDate(employeeId, date) {
  const [rows] = await pool.query(
    `SELECT status, reason FROM attendance_status_override
     WHERE employee_id = ? AND attendance_date = ? AND deleted_at IS NULL
     LIMIT 1`,
    [employeeId, date]
  );
  return rows[0] || null;
}

export async function findHolidayByDate(date) {
  const [rows] = await pool.query(
    `SELECT holiday_type, half_day_period FROM holiday
     WHERE holiday_date = ? AND status = 'ACTIVE' AND deleted_at IS NULL
     LIMIT 1`,
    [date]
  );
  return rows[0] || null;
}

export async function findApprovedLeaveByDate(employeeId, date) {
  const [rows] = await pool.query(
    `SELECT leave_duration_type FROM leave_request
     WHERE employee_id = ? AND status = 'APPROVED' AND deleted_at IS NULL
       AND ? BETWEEN start_date AND end_date
     LIMIT 1`,
    [employeeId, date]
  );
  return rows[0] || null;
}

export async function findAttendanceByEmployeeDate(employeeId, date) {
  const [rows] = await pool.query(
    `SELECT * FROM attendance WHERE employee_id = ? AND attendance_date = ? AND deleted_at IS NULL LIMIT 1`,
    [employeeId, date]
  );
  return rows[0] || null;
}

export async function findAttendanceById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM attendance WHERE attendance_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function createCheckInRow(data) {
  const [result] = await pool.query(
    `INSERT INTO attendance
       (employee_id, attendance_date, status, expected_login_time, expected_logout_time,
        actual_check_in, late_minutes, check_in_latitude, check_in_longitude, check_in_accuracy,
        device_id, location_type)
     VALUES (?, ?, 'CHECKED_IN', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.employee_id,
      data.attendance_date,
      data.expected_login_time,
      data.expected_logout_time,
      data.actual_check_in,
      data.late_minutes,
      data.latitude,
      data.longitude,
      data.accuracy,
      data.device_id,
      data.location_type,
    ]
  );
  return result.insertId;
}

// used when a NOT_CHECKED_IN row already exists (e.g. pre-created by the
// midnight cron - see spec comment on the attendance table)
export async function updateExistingRowToCheckIn(attendanceId, data) {
  await pool.query(
    `UPDATE attendance
     SET status = 'CHECKED_IN', actual_check_in = ?, late_minutes = ?,
         check_in_latitude = ?, check_in_longitude = ?, check_in_accuracy = ?, device_id = ?,
         location_type = ?
     WHERE attendance_id = ?`,
    [
      data.actual_check_in,
      data.late_minutes,
      data.latitude,
      data.longitude,
      data.accuracy,
      data.device_id,
      data.location_type,
      attendanceId,
    ]
  );
}

export async function updateCheckOut(attendanceId, data) {
  await pool.query(
    `UPDATE attendance
     SET status = 'CHECKED_OUT', actual_check_out = ?, early_checkout_minutes = ?, worked_minutes = ?,
         check_out_latitude = ?, check_out_longitude = ?, check_out_accuracy = ?
     WHERE attendance_id = ?`,
    [
      data.actual_check_out,
      data.early_checkout_minutes,
      data.worked_minutes,
      data.latitude,
      data.longitude,
      data.accuracy,
      attendanceId,
    ]
  );
}

export async function listAttendanceHistory(employeeId, { from, to, limit, offset }) {
  const conditions = ["employee_id = ?", "deleted_at IS NULL"];
  const params = [employeeId];
  if (from) {
    conditions.push("attendance_date >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("attendance_date <= ?");
    params.push(to);
  }
  const where = conditions.join(" AND ");

  const [rows] = await pool.query(
    `SELECT * FROM attendance WHERE ${where} ORDER BY attendance_date DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM attendance WHERE ${where}`, params);
  return { rows, total: countRows[0].total };
}

/**
 * Aggregate counts for the monthly-summary endpoint. NOT_CHECKED_IN rows
 * for dates already in the past are treated as absent (never checked in
 * and the day is over) - computed here via the `todayIST` cutoff rather
 * than stored as ABSENT, since no end-of-day cron flips that status yet.
 * SUM(CASE WHEN status IN ('CHECKED_IN','CHECKED_OUT') THEN 1 ELSE 0 END) AS present_days,
 */
export async function getMonthlyAggregate(employeeId, startDate, endDate, todayIST) {
  const [rows] = await pool.query(
    `SELECT
       SUM(CASE WHEN status IN ('CHECKED_IN','CHECKED_OUT','MISSING_CHECKOUT') THEN 1 ELSE 0 END) AS present_days,
       SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END) AS override_absent_days,
       SUM(CASE WHEN status = 'NOT_CHECKED_IN' AND attendance_date < ? THEN 1 ELSE 0 END) AS missed_days,
       SUM(CASE WHEN status = 'ON_LEAVE' THEN 1 ELSE 0 END) AS full_leave_days,
       SUM(CASE WHEN status = 'HALF_DAY_LEAVE' THEN 1 ELSE 0 END) AS half_leave_days,
       SUM(CASE WHEN status = 'HOLIDAY' THEN 1 ELSE 0 END) AS full_holiday_days,
       SUM(CASE WHEN status = 'HALF_DAY_HOLIDAY' THEN 1 ELSE 0 END) AS half_holiday_days,
       SUM(CASE WHEN late_minutes > 0 THEN 1 ELSE 0 END) AS late_count,
       COALESCE(SUM(late_minutes), 0) AS total_late_minutes,
       SUM(CASE WHEN early_checkout_minutes > 0 THEN 1 ELSE 0 END) AS early_count,
       COALESCE(SUM(early_checkout_minutes), 0) AS total_early_minutes,
       COALESCE(SUM(worked_minutes), 0) AS total_worked_minutes
     FROM attendance
     WHERE employee_id = ? AND attendance_date BETWEEN ? AND ? AND deleted_at IS NULL`,
    [todayIST, employeeId, startDate, endDate]
  );
  return rows[0];
}

// ---- used by the midnight cron (src/cron/attendanceCron.js) ----

export async function listActiveEmployeesForCron() {
  const [rows] = await pool.query(
    `SELECT employee_id, expected_login_time, expected_logout_time
     FROM employee WHERE status = 'ACTIVE' AND deleted_at IS NULL`
  );
  return rows;
}

// pre-creates a row with a given status (NOT_CHECKED_IN, or a blocked
// status like HOLIDAY/ON_LEAVE/ABSENT resolved from resolveNonWorkingReason)
export async function insertPreCreatedRow(data) {
  const [result] = await pool.query(
    `INSERT INTO attendance (employee_id, attendance_date, status, expected_login_time, expected_logout_time)
     VALUES (?, ?, ?, ?, ?)`,
    [data.employee_id, data.attendance_date, data.status, data.expected_login_time, data.expected_logout_time]
  );
  return result.insertId;
}

export async function listCheckedInRowsByDate(date) {
  const [rows] = await pool.query(
    `SELECT * FROM attendance WHERE attendance_date = ? AND status = 'CHECKED_IN' AND deleted_at IS NULL`,
    [date]
  );
  return rows;
}

// export async function autoCheckoutRow(attendanceId, data) {
//   await pool.query(
//     `UPDATE attendance
//      SET status = 'CHECKED_OUT', actual_check_out = ?, early_checkout_minutes = ?, worked_minutes = ?, is_auto_checkout = TRUE
//      WHERE attendance_id = ?`,
//     [data.actual_check_out, data.early_checkout_minutes, data.worked_minutes, attendanceId]
//   );
// }

// ---- attendance_status_override (admin manual exceptions) ----

// replace existing autoCheckoutRow
export async function autoCheckoutRow(attendanceId, data) {
  const [result] = await pool.query(
    `UPDATE attendance
     SET status = 'MISSING_CHECKOUT', actual_check_out = ?, early_checkout_minutes = ?,
         worked_minutes = ?, is_auto_checkout = TRUE
     WHERE attendance_id = ? AND status = 'CHECKED_IN' AND deleted_at IS NULL`,
    [data.actual_check_out, data.early_checkout_minutes, data.worked_minutes, attendanceId]
  );
  return result.affectedRows; // 0 = employee ne beech mein khud checkout kar diya
}

// naya: aaj tak ke saare open CHECKED_IN rows
export async function listOpenCheckedInRows(uptoDate) {
  const [rows] = await pool.query(
    `SELECT attendance_id, DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date,
            expected_logout_time, actual_check_in
     FROM attendance
     WHERE status = 'CHECKED_IN' AND attendance_date <= ? AND deleted_at IS NULL`,
    [uptoDate]
  );
  return rows;
}

// naya: beeti hui dates ke NOT_CHECKED_IN rows -> ABSENT
export async function markAbsentBeforeDate(date) {
  const [result] = await pool.query(
    `UPDATE attendance SET status = 'ABSENT'
     WHERE status = 'NOT_CHECKED_IN' AND attendance_date < ? AND deleted_at IS NULL`,
    [date]
  );
  return result.affectedRows;
}

export async function findOverrideById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM attendance_status_override WHERE attendance_status_override_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function upsertOverride({ employeeId, attendanceDate, status, reason, adminId }) {
  const existing = await findOverrideByEmployeeDate(employeeId, attendanceDate);

  if (existing) {
    await pool.query(
      `UPDATE attendance_status_override
       SET status = ?, reason = ?, set_by_admin_id = ?
       WHERE employee_id = ? AND attendance_date = ? AND deleted_at IS NULL`,
      [status, reason || null, adminId, employeeId, attendanceDate]
    );
    const [rows] = await pool.query(
      `SELECT attendance_status_override_id FROM attendance_status_override
       WHERE employee_id = ? AND attendance_date = ? AND deleted_at IS NULL LIMIT 1`,
      [employeeId, attendanceDate]
    );
    return rows[0].attendance_status_override_id;
  }

  const [result] = await pool.query(
    `INSERT INTO attendance_status_override
       (employee_id, attendance_date, status, reason, set_by_admin_id)
     VALUES (?, ?, ?, ?, ?)`,
    [employeeId, attendanceDate, status, reason || null, adminId]
  );
  return result.insertId;
}

export async function listOverrides({ employeeId, from, to, limit, offset }) {
  const conditions = ["deleted_at IS NULL"];
  const params = [];
  if (employeeId) {
    conditions.push("employee_id = ?");
    params.push(employeeId);
  }
  if (from) {
    conditions.push("attendance_date >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("attendance_date <= ?");
    params.push(to);
  }
  const where = conditions.join(" AND ");

  const [rows] = await pool.query(
    `SELECT * FROM attendance_status_override WHERE ${where} ORDER BY attendance_date DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM attendance_status_override WHERE ${where}`,
    params
  );
  return { rows, total: countRows[0].total };
}

export async function softDeleteOverride(id) {
  await pool.query(
    `UPDATE attendance_status_override SET deleted_at = NOW() WHERE attendance_status_override_id = ? AND deleted_at IS NULL`,
    [id]
  );
}

// ---- monthly summary ----

export async function getMonthlyAttendanceAggregate(employeeId, fromDate, toDate) {
  const [rows] = await pool.query(
    `SELECT
       SUM(CASE WHEN status IN ('CHECKED_IN','CHECKED_OUT') THEN 1 ELSE 0 END) AS present_days,
       SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END) AS absent_days,
       SUM(CASE WHEN late_minutes > 0 THEN 1 ELSE 0 END) AS late_count,
       COALESCE(SUM(late_minutes), 0) AS total_late_minutes,
       SUM(CASE WHEN early_checkout_minutes > 0 THEN 1 ELSE 0 END) AS early_count,
       COALESCE(SUM(early_checkout_minutes), 0) AS total_early_minutes,
       COALESCE(SUM(worked_minutes), 0) AS total_worked_minutes
     FROM attendance
     WHERE employee_id = ? AND attendance_date BETWEEN ? AND ? AND deleted_at IS NULL`,
    [employeeId, fromDate, toDate]
  );
  return rows[0];
}

export async function countFullDayHolidays(fromDate, toDate) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM holiday
     WHERE holiday_type = 'FULL_DAY' AND status = 'ACTIVE' AND deleted_at IS NULL
       AND holiday_date BETWEEN ? AND ?`,
    [fromDate, toDate]
  );
  return rows[0].total;
}

export async function sumApprovedLeaveDays(employeeId, fromDate, toDate) {
  // NOTE: MVP simplification - sums total_days for any APPROVED request that
  // overlaps the month at all. A request spanning across a month boundary
  // is counted in full in each overlapping month (acceptable for MVP; flag
  // if exact per-month split is needed later).
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(total_days), 0) AS total FROM leave_request
     WHERE employee_id = ? AND status = 'APPROVED' AND deleted_at IS NULL
       AND start_date <= ? AND end_date >= ?`,
    [employeeId, toDate, fromDate]
  );
  return rows[0].total;
}

// ---- suspicious attempts (fake GPS / GPS anomalies) ----

export async function insertSuspiciousAttempt(d) {
  await pool.query(
    `INSERT INTO suspicious_attempt
       (employee_id, action, type, is_blocked, latitude, longitude, accuracy,
        device_id, location_timestamp, attendance_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      d.employee_id, d.action, d.type, d.is_blocked,
      d.latitude, d.longitude, d.accuracy,
      d.device_id, d.location_timestamp, d.attendance_date,
    ]
  );
}

export async function getRecentCheckInAccuracies(employeeId, limit) {
  const [rows] = await pool.query(
    `SELECT check_in_accuracy FROM attendance
     WHERE employee_id = ? AND check_in_accuracy IS NOT NULL AND deleted_at IS NULL
     ORDER BY attendance_date DESC LIMIT ?`,
    [employeeId, limit]
  );
  return rows.map((r) => r.check_in_accuracy);
}

export async function listSuspiciousAttempts({ employeeId, type, from, to, limit, offset }) {
  const conditions = ["sa.deleted_at IS NULL"];
  const params = [];
  if (employeeId) { conditions.push("sa.employee_id = ?"); params.push(employeeId); }
  if (type) { conditions.push("sa.type = ?"); params.push(type); }
  if (from) { conditions.push("sa.attendance_date >= ?"); params.push(from); }
  if (to) { conditions.push("sa.attendance_date <= ?"); params.push(to); }
  const where = conditions.join(" AND ");

  const [rows] = await pool.query(
    `SELECT sa.*, e.employee_code, e.name AS employee_name
     FROM suspicious_attempt sa
     JOIN employee e ON e.employee_id = sa.employee_id
     WHERE ${where}
     ORDER BY sa.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM suspicious_attempt sa WHERE ${where}`,
    params
  );
  return { rows, total: countRows[0].total };
}