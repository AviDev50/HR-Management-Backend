import pool from "../../config/db.js";
import { withTransaction } from "../../utils/withTransaction.js";
import { createError } from "../../utils/createError.js";

export async function findActiveDeviceByEmployeeId(employeeId) {
  const [rows] = await pool.query(
    `SELECT employee_device_id, employee_id, device_id, device_name, device_model, platform, status, registered_at, last_login_at
     FROM employee_device
     WHERE employee_id = ? AND status = 'ACTIVE' AND deleted_at IS NULL
     LIMIT 1`,
    [employeeId]
  );
  return rows[0] || null;
}

export async function findPendingRequestByEmployeeId(employeeId) {
  const [rows] = await pool.query(
    `SELECT device_change_request_id, status FROM device_change_request
     WHERE employee_id = ? AND status = 'PENDING' AND deleted_at IS NULL
     LIMIT 1`,
    [employeeId]
  );
  return rows[0] || null;
}

export async function createChangeRequest({ employeeId, oldEmployeeDeviceId, newDevice }) {
  const [result] = await pool.query(
    `INSERT INTO device_change_request
       (employee_id, old_employee_device_id, new_device_id, new_device_name, new_device_model, new_platform, status)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
    [
      employeeId,
      oldEmployeeDeviceId,
      newDevice.device_id,
      newDevice.model || null,
      newDevice.model || null,
      newDevice.platform,
    ]
  );
  return result.insertId;
}

export async function findChangeRequestById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM device_change_request WHERE device_change_request_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function listChangeRequests({ limit, offset, status }) {
  const conditions = ["deleted_at IS NULL"];
  const params = [];
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  const where = conditions.join(" AND ");

  const [rows] = await pool.query(
    `SELECT device_change_request_id, employee_id, old_employee_device_id, new_device_id,
            new_device_name, new_platform, status, requested_at, reviewed_at
     FROM device_change_request
     WHERE ${where}
     ORDER BY requested_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM device_change_request WHERE ${where}`,
    params
  );

  return { rows, total: countRows[0].total };
}

export async function listEmployeeDeviceHistory(employeeId) {
  const [rows] = await pool.query(
    `SELECT employee_device_id, device_id, device_name, device_model, platform, status, registered_at, last_login_at
     FROM employee_device
     WHERE employee_id = ? AND deleted_at IS NULL
     ORDER BY registered_at DESC`,
    [employeeId]
  );
  return rows;
}

/**
 * Approves a PENDING device-change request atomically:
 * old device -> INACTIVE, new device -> ACTIVE row inserted, request -> APPROVED.
 * (employee_device.active_employee_id generated column + unique index
 * guarantees only one ACTIVE row per employee even under concurrency.)
 */
export async function approveChangeRequest(requestId, adminId) {
  return withTransaction(async (conn) => {
    const [reqRows] = await conn.query(
      `SELECT * FROM device_change_request WHERE device_change_request_id = ? AND deleted_at IS NULL FOR UPDATE`,
      [requestId]
    );
    const request = reqRows[0];
    if (!request) {
      throw createError("REQUEST_NOT_FOUND", 404, "Device change request not found.");
    }
    if (request.status !== "PENDING") {
      throw createError("REQUEST_ALREADY_REVIEWED", 409, "This request has already been reviewed.");
    }

    await conn.query(
      `UPDATE employee_device SET status = 'INACTIVE' WHERE employee_device_id = ?`,
      [request.old_employee_device_id]
    );

    // kill any refresh tokens issued to the old device so it can't
    // silently mint a fresh access token either - it must log in again
    // (and will be blocked, since it's no longer the active device)
    await conn.query(
      `UPDATE refresh_token
       SET revoked_at = NOW()
       WHERE user_type = 'EMPLOYEE' AND user_id = ? AND revoked_at IS NULL`,
      [request.employee_id]
    );

    const [insertResult] = await conn.query(
      `INSERT INTO employee_device (employee_id, device_id, device_name, device_model, platform, status, registered_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', NOW(), NOW())`,
      [request.employee_id, request.new_device_id, request.new_device_name, request.new_device_model, request.new_platform]
    );

    await conn.query(
      `UPDATE device_change_request
       SET status = 'APPROVED', reviewed_by_admin_id = ?, reviewed_at = NOW()
       WHERE device_change_request_id = ?`,
      [adminId, requestId]
    );

    return insertResult.insertId;
  });
}

export async function rejectChangeRequest(requestId, adminId, reason) {
  return withTransaction(async (conn) => {
    const [reqRows] = await conn.query(
      `SELECT * FROM device_change_request WHERE device_change_request_id = ? AND deleted_at IS NULL FOR UPDATE`,
      [requestId]
    );
    const request = reqRows[0];
    if (!request) {
      throw createError("REQUEST_NOT_FOUND", 404, "Device change request not found.");
    }
    if (request.status !== "PENDING") {
      throw createError("REQUEST_ALREADY_REVIEWED", 409, "This request has already been reviewed.");
    }

    await conn.query(
      `UPDATE device_change_request
       SET status = 'REJECTED', reviewed_by_admin_id = ?, reviewed_at = NOW(), rejection_reason = ?
       WHERE device_change_request_id = ?`,
      [adminId, reason || null, requestId]
    );
  });
}