import pool from "../../config/db.js";
import { withTransaction } from "../../utils/withTransaction.js";
import { createError } from "../../utils/createError.js";

// ---- leave_type ----

export async function findActiveLeaveTypes() {
  const [rows] = await pool.query(
    `SELECT leave_type_id, name, code, default_annual_days
     FROM leave_type WHERE status = 'ACTIVE' AND deleted_at IS NULL`
  );
  return rows;
}

export async function listAllLeaveTypes() {
  const [rows] = await pool.query(
    `SELECT * FROM leave_type WHERE deleted_at IS NULL ORDER BY leave_type_id`
  );
  return rows;
}

export async function findLeaveTypeById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM leave_type WHERE leave_type_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function findLeaveTypeByCode(code) {
  const [rows] = await pool.query(
    `SELECT leave_type_id FROM leave_type WHERE code = ? AND deleted_at IS NULL LIMIT 1`,
    [code]
  );
  return rows[0] || null;
}

export async function createLeaveType(data) {
  const [result] = await pool.query(
    `INSERT INTO leave_type (name, code, default_annual_days, status) VALUES (?, ?, ?, 'ACTIVE')`,
    [data.name, data.code, data.default_annual_days]
  );
  return result.insertId;
}

export async function updateLeaveType(id, data) {
  await pool.query(
    `UPDATE leave_type SET name = ?, default_annual_days = ? WHERE leave_type_id = ? AND deleted_at IS NULL`,
    [data.name, data.default_annual_days, id]
  );
}

export async function updateLeaveTypeStatus(id, status) {
  await pool.query(
    `UPDATE leave_type SET status = ? WHERE leave_type_id = ? AND deleted_at IS NULL`,
    [status, id]
  );
}

// ---- employee_leave_balance ----

export async function findBalance(employeeId, leaveTypeId, year) {
  const [rows] = await pool.query(
    `SELECT * FROM employee_leave_balance
     WHERE employee_id = ? AND leave_type_id = ? AND year = ? AND deleted_at IS NULL
     LIMIT 1`,
    [employeeId, leaveTypeId, year]
  );
  return rows[0] || null;
}

export async function findBalanceById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM employee_leave_balance WHERE employee_leave_balance_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function createBalance(data) {
  const [result] = await pool.query(
    `INSERT INTO employee_leave_balance
       (employee_id, leave_type_id, year, allocated_days, used_days, remaining_days)
     VALUES (?, ?, ?, ?, 0, ?)`,
    [data.employee_id, data.leave_type_id, data.year, data.allocated_days, data.allocated_days]
  );
  return result.insertId;
}

export async function updateBalanceAllocation(id, allocatedDays) {
  // remaining is recomputed from used_days already on the row, done atomically in SQL
  await pool.query(
    `UPDATE employee_leave_balance
     SET allocated_days = ?, remaining_days = ? - used_days
     WHERE employee_leave_balance_id = ? AND deleted_at IS NULL`,
    [allocatedDays, allocatedDays, id]
  );
}

export async function listBalances({ employeeId, year, limit, offset }) {
  const conditions = ["deleted_at IS NULL"];
  const params = [];
  if (employeeId) {
    conditions.push("employee_id = ?");
    params.push(employeeId);
  }
  if (year) {
    conditions.push("year = ?");
    params.push(year);
  }
  const where = conditions.join(" AND ");

  const [rows] = await pool.query(
    `SELECT * FROM employee_leave_balance WHERE ${where} ORDER BY year DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM employee_leave_balance WHERE ${where}`,
    params
  );
  return { rows, total: countRows[0].total };
}

// ---- leave_request ----

export async function findOverlappingRequest(employeeId, startDate, endDate, excludeId = null) {
  const params = [employeeId, endDate, startDate];
  let query = `
    SELECT leave_request_id FROM leave_request
    WHERE employee_id = ? AND status IN ('PENDING','APPROVED') AND deleted_at IS NULL
      AND start_date <= ? AND end_date >= ?`;
  if (excludeId) {
    query += ` AND leave_request_id != ?`;
    params.push(excludeId);
  }
  query += ` LIMIT 1`;
  const [rows] = await pool.query(query, params);
  return rows[0] || null;
}

export async function createLeaveRequest(data) {
  const [result] = await pool.query(
    `INSERT INTO leave_request
       (employee_id, leave_type_id, start_date, end_date, leave_duration_type, total_days, reason, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    [
      data.employee_id,
      data.leave_type_id,
      data.start_date,
      data.end_date,
      data.leave_duration_type,
      data.total_days,
      data.reason || null,
    ]
  );
  return result.insertId;
}

export async function findLeaveRequestById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM leave_request WHERE leave_request_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function listLeaveRequests({ employeeId, status, limit, offset }) {
  const conditions = ["deleted_at IS NULL"];
  const params = [];
  if (employeeId) {
    conditions.push("employee_id = ?");
    params.push(employeeId);
  }
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  const where = conditions.join(" AND ");

  const [rows] = await pool.query(
    `SELECT * FROM leave_request WHERE ${where} ORDER BY applied_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM leave_request WHERE ${where}`, params);
  return { rows, total: countRows[0].total };
}

/**
 * Approves a PENDING request atomically: locks the request + the balance
 * row, re-checks remaining_days (race-condition safety), deducts it, and
 * marks the request APPROVED - all in one transaction.
 */
export async function approveLeaveRequest(requestId, adminId) {
  return withTransaction(async (conn) => {
    const [reqRows] = await conn.query(
      `SELECT * FROM leave_request WHERE leave_request_id = ? AND deleted_at IS NULL FOR UPDATE`,
      [requestId]
    );
    const request = reqRows[0];
    if (!request) throw createError("LEAVE_TYPE_NOT_FOUND", 404, "Leave request not found.");
    if (request.status !== "PENDING") {
      throw createError("LEAVE_ALREADY_REVIEWED", 409, "This request has already been reviewed.");
    }

    const year = new Date(request.start_date).getFullYear();
    const [balRows] = await conn.query(
      `SELECT * FROM employee_leave_balance
       WHERE employee_id = ? AND leave_type_id = ? AND year = ? AND deleted_at IS NULL
       FOR UPDATE`,
      [request.employee_id, request.leave_type_id, year]
    );
    const balance = balRows[0];
    if (!balance || Number(balance.remaining_days) < Number(request.total_days)) {
      throw createError("INSUFFICIENT_LEAVE_BALANCE", 409, "Insufficient leave balance.");
    }

    await conn.query(
      `UPDATE employee_leave_balance
       SET used_days = used_days + ?, remaining_days = remaining_days - ?
       WHERE employee_leave_balance_id = ?`,
      [request.total_days, request.total_days, balance.employee_leave_balance_id]
    );

    await conn.query(
      `UPDATE leave_request
       SET status = 'APPROVED', reviewed_by_admin_id = ?, reviewed_at = NOW()
       WHERE leave_request_id = ?`,
      [adminId, requestId]
    );
  });
}

export async function rejectLeaveRequest(requestId, adminId, reason) {
  const [reqRows] = await pool.query(
    `SELECT status FROM leave_request WHERE leave_request_id = ? AND deleted_at IS NULL LIMIT 1`,
    [requestId]
  );
  const request = reqRows[0];
  if (!request) throw createError("LEAVE_TYPE_NOT_FOUND", 404, "Leave request not found.");
  if (request.status !== "PENDING") {
    throw createError("LEAVE_ALREADY_REVIEWED", 409, "This request has already been reviewed.");
  }
  await pool.query(
    `UPDATE leave_request
     SET status = 'REJECTED', reviewed_by_admin_id = ?, reviewed_at = NOW(), rejection_reason = ?
     WHERE leave_request_id = ?`,
    [adminId, reason || null, requestId]
  );
}

/**
 * Cancels a PENDING or a future-dated APPROVED request. If it was
 * APPROVED, the deducted balance is reversed atomically.
 */
export async function cancelLeaveRequest(requestId, employeeId) {
  return withTransaction(async (conn) => {
    const [reqRows] = await conn.query(
      `SELECT * FROM leave_request WHERE leave_request_id = ? AND employee_id = ? AND deleted_at IS NULL FOR UPDATE`,
      [requestId, employeeId]
    );
    const request = reqRows[0];
    if (!request) throw createError("LEAVE_TYPE_NOT_FOUND", 404, "Leave request not found.");

    const today = new Date().toISOString().slice(0, 10);
    const startDate = String(request.start_date).slice(0, 10);

    if (request.status === "PENDING") {
      await conn.query(`UPDATE leave_request SET status = 'CANCELLED' WHERE leave_request_id = ?`, [requestId]);
      return;
    }

    if (request.status === "APPROVED" && startDate > today) {
      const year = new Date(request.start_date).getFullYear();
      await conn.query(
        `UPDATE employee_leave_balance
         SET used_days = used_days - ?, remaining_days = remaining_days + ?
         WHERE employee_id = ? AND leave_type_id = ? AND year = ?`,
        [request.total_days, request.total_days, request.employee_id, request.leave_type_id, year]
      );
      await conn.query(`UPDATE leave_request SET status = 'CANCELLED' WHERE leave_request_id = ?`, [requestId]);
      return;
    }

    throw createError("LEAVE_CANNOT_CANCEL", 409, "This request can no longer be cancelled.");
  });
}