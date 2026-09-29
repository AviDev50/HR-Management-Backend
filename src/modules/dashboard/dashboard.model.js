import pool from "../../config/db.js";

export async function countActiveEmployees() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM employee WHERE status = 'ACTIVE' AND deleted_at IS NULL`
  );
  return rows[0].cnt;
}

export async function todayAttendanceStatusCounts(date) {
  const [rows] = await pool.query(
    `SELECT status, COUNT(*) AS cnt
     FROM attendance
     WHERE attendance_date = ? AND deleted_at IS NULL
     GROUP BY status`,
    [date]
  );
  return rows; // [{ status: 'CHECKED_IN', cnt: 5 }, ...]
}

export async function countLateToday(date) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM attendance
     WHERE attendance_date = ? AND late_minutes > 0 AND deleted_at IS NULL`,
    [date]
  );
  return rows[0].cnt;
}

export async function countPendingLeaveRequests() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM leave_request WHERE status = 'PENDING' AND deleted_at IS NULL`
  );
  return rows[0].cnt;
}

export async function countPendingDeviceChangeRequests() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM device_change_request WHERE status = 'PENDING' AND deleted_at IS NULL`
  );
  return rows[0].cnt;
}

export async function getNextHoliday(fromDate) {
  const [rows] = await pool.query(
    `SELECT holiday_date, name, holiday_type
     FROM holiday
     WHERE holiday_date >= ? AND status = 'ACTIVE' AND deleted_at IS NULL
     ORDER BY holiday_date ASC
     LIMIT 1`,
    [fromDate]
  );
  return rows[0] || null;
}