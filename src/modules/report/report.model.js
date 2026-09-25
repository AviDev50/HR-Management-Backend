import pool from "../../config/db.js";

// ---- Daily report ----

export async function getDailyReport(date, { limit, offset }) {
  const [rows] = await pool.query(
    `SELECT a.attendance_id, a.employee_id, e.employee_code, e.name AS employee_name,
            a.attendance_date, a.status, a.expected_login_time, a.expected_logout_time,
            a.actual_check_in, a.actual_check_out, a.late_minutes, a.early_checkout_minutes,
            a.worked_minutes, a.is_auto_checkout
     FROM attendance a
     JOIN employee e ON e.employee_id = a.employee_id AND e.deleted_at IS NULL
     WHERE a.attendance_date = ? AND a.deleted_at IS NULL
     ORDER BY e.name ASC
     LIMIT ? OFFSET ?`,
    [date, limit, offset]
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM attendance WHERE attendance_date = ? AND deleted_at IS NULL`,
    [date]
  );
  return { rows, total: countRows[0].total };
}

// ---- Monthly report (all employees, or one employee) ----

export async function getMonthlyReport({ employeeId, startDate, endDate }) {
  const conditions = ["a.attendance_date BETWEEN ? AND ?", "a.deleted_at IS NULL", "e.deleted_at IS NULL"];
  const params = [startDate, endDate];
  if (employeeId) {
    conditions.push("a.employee_id = ?");
    params.push(employeeId);
  }
  const where = conditions.join(" AND ");

  const [rows] = await pool.query(
    `SELECT
       a.employee_id, e.employee_code, e.name AS employee_name,
       SUM(CASE WHEN a.status IN ('CHECKED_IN','CHECKED_OUT') THEN 1 ELSE 0 END) AS present_days,
       SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) AS override_absent_days,
       SUM(CASE WHEN a.status = 'NOT_CHECKED_IN' AND a.attendance_date < CURDATE() THEN 1 ELSE 0 END) AS missed_days,
       SUM(CASE WHEN a.status = 'ON_LEAVE' THEN 1 ELSE 0 END) AS full_leave_days,
       SUM(CASE WHEN a.status = 'HALF_DAY_LEAVE' THEN 1 ELSE 0 END) AS half_leave_days,
       SUM(CASE WHEN a.status = 'HOLIDAY' THEN 1 ELSE 0 END) AS full_holiday_days,
       SUM(CASE WHEN a.status = 'HALF_DAY_HOLIDAY' THEN 1 ELSE 0 END) AS half_holiday_days,
       SUM(CASE WHEN a.late_minutes > 0 THEN 1 ELSE 0 END) AS late_count,
       COALESCE(SUM(a.late_minutes), 0) AS total_late_minutes,
       SUM(CASE WHEN a.early_checkout_minutes > 0 THEN 1 ELSE 0 END) AS early_count,
       COALESCE(SUM(a.early_checkout_minutes), 0) AS total_early_minutes,
       COALESCE(SUM(a.worked_minutes), 0) AS total_worked_minutes
     FROM attendance a
     JOIN employee e ON e.employee_id = a.employee_id
     WHERE ${where}
     GROUP BY a.employee_id, e.employee_code, e.name
     ORDER BY e.name ASC`,
    params
  );
  return rows;
}

// ---- Late report (every late occurrence, per spec section 53) ----

export async function getLateReport({ employeeId, from, to, limit, offset }) {
  const conditions = ["a.late_minutes > 0", "a.deleted_at IS NULL", "e.deleted_at IS NULL"];
  const params = [];
  if (employeeId) {
    conditions.push("a.employee_id = ?");
    params.push(employeeId);
  }
  if (from) {
    conditions.push("a.attendance_date >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("a.attendance_date <= ?");
    params.push(to);
  }
  const where = conditions.join(" AND ");

  const [rows] = await pool.query(
    `SELECT a.attendance_date, e.employee_code, e.name AS employee_name,
            a.expected_login_time, a.actual_check_in, a.late_minutes
     FROM attendance a
     JOIN employee e ON e.employee_id = a.employee_id
     WHERE ${where}
     ORDER BY a.attendance_date DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM attendance a JOIN employee e ON e.employee_id = a.employee_id WHERE ${where}`,
    params
  );
  return { rows, total: countRows[0].total };
}

// ---- Leave report ----

export async function getLeaveReport({ employeeId, status, from, to, limit, offset }) {
  const conditions = ["lr.deleted_at IS NULL", "e.deleted_at IS NULL"];
  const params = [];
  if (employeeId) {
    conditions.push("lr.employee_id = ?");
    params.push(employeeId);
  }
  if (status) {
    conditions.push("lr.status = ?");
    params.push(status);
  }
  if (from) {
    conditions.push("lr.start_date >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("lr.end_date <= ?");
    params.push(to);
  }
  const where = conditions.join(" AND ");

  const [rows] = await pool.query(
    `SELECT e.employee_code, e.name AS employee_name, lt.name AS leave_type_name,
            lr.start_date, lr.end_date, lr.leave_duration_type, lr.total_days,
            lr.status, lr.reason, lr.rejection_reason,
            adm.name AS reviewed_by_name, lr.reviewed_at
     FROM leave_request lr
     JOIN employee e ON e.employee_id = lr.employee_id
     JOIN leave_type lt ON lt.leave_type_id = lr.leave_type_id
     LEFT JOIN admin adm ON adm.admin_id = lr.reviewed_by_admin_id
     WHERE ${where}
     ORDER BY lr.start_date DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM leave_request lr JOIN employee e ON e.employee_id = lr.employee_id WHERE ${where}`,
    params
  );
  return { rows, total: countRows[0].total };
}

// ---- unpaginated variants, used only by the Excel export ----

export async function getDailyReportAll(date) {
  const [rows] = await pool.query(
    `SELECT e.employee_code, e.name AS employee_name, a.attendance_date, a.status,
            a.expected_login_time, a.expected_logout_time, a.actual_check_in, a.actual_check_out,
            a.late_minutes, a.early_checkout_minutes, a.worked_minutes, a.is_auto_checkout
     FROM attendance a
     JOIN employee e ON e.employee_id = a.employee_id AND e.deleted_at IS NULL
     WHERE a.attendance_date = ? AND a.deleted_at IS NULL
     ORDER BY e.name ASC`,
    [date]
  );
  return rows;
}

export async function getLateReportAll(startDate, endDate) {
  const [rows] = await pool.query(
    `SELECT a.attendance_date, e.employee_code, e.name AS employee_name,
            a.expected_login_time, a.actual_check_in, a.late_minutes
     FROM attendance a
     JOIN employee e ON e.employee_id = a.employee_id AND e.deleted_at IS NULL
     WHERE a.late_minutes > 0 AND a.attendance_date BETWEEN ? AND ? AND a.deleted_at IS NULL
     ORDER BY a.attendance_date ASC`,
    [startDate, endDate]
  );
  return rows;
}

export async function getLeaveReportAll(startDate, endDate) {
  const [rows] = await pool.query(
    `SELECT e.employee_code, e.name AS employee_name, lt.name AS leave_type_name,
            lr.start_date, lr.end_date, lr.leave_duration_type, lr.total_days, lr.status
     FROM leave_request lr
     JOIN employee e ON e.employee_id = lr.employee_id AND e.deleted_at IS NULL
     JOIN leave_type lt ON lt.leave_type_id = lr.leave_type_id
     WHERE lr.start_date <= ? AND lr.end_date >= ? AND lr.deleted_at IS NULL
     ORDER BY lr.start_date ASC`,
    [endDate, startDate]
  );
  return rows;
}

// ---- shared helpers (weekend/holiday day counts for monthly report) ----

export async function getOfficeSetting() {
  const [rows] = await pool.query(
    `SELECT weekly_off FROM office_setting WHERE deleted_at IS NULL ORDER BY office_setting_id ASC LIMIT 1`
  );
  return rows[0] || null;
}

export async function countFullDayHolidays(startDate, endDate) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM holiday
     WHERE holiday_date BETWEEN ? AND ? AND holiday_type = 'FULL_DAY' AND status = 'ACTIVE' AND deleted_at IS NULL`,
    [startDate, endDate]
  );
  return rows[0].cnt;
}