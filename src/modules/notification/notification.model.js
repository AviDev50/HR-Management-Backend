// src/modules/notification/notification.model.js
import pool from "../../config/db.js";

export async function saveFcmToken(employeeId, deviceId, token) {
  // one physical token must belong to exactly one row
  await pool.query(`UPDATE employee_device SET fcm_token = NULL WHERE fcm_token = ? AND deleted_at IS NULL`, [token]);
  const [res] = await pool.query(
    `UPDATE employee_device SET fcm_token = ?, fcm_token_updated_at = UTC_TIMESTAMP()
     WHERE employee_id = ? AND device_id = ? AND status = 'ACTIVE' AND deleted_at IS NULL`,
    [token, employeeId, deviceId]
  );
  return res.affectedRows;
}

export async function clearFcmToken(employeeId, deviceId) {
  await pool.query(
    `UPDATE employee_device SET fcm_token = NULL
     WHERE employee_id = ? AND device_id = ? AND deleted_at IS NULL`,
    [employeeId, deviceId]
  );
}

export async function clearTokens(tokens) {
  if (!tokens.length) return;
  await pool.query(`UPDATE employee_device SET fcm_token = NULL WHERE fcm_token IN (?)`, [tokens]);
}

export async function getActiveEmployeeIds() {
  const [rows] = await pool.query(`SELECT employee_id FROM employee WHERE status = 'ACTIVE' AND deleted_at IS NULL`);
  return rows.map((r) => r.employee_id);
}

export async function getActiveTokens(employeeIds) {
  if (!employeeIds.length) return [];
  const [rows] = await pool.query(
    `SELECT d.fcm_token FROM employee_device d
     JOIN employee e ON e.employee_id = d.employee_id AND e.status = 'ACTIVE' AND e.deleted_at IS NULL
     WHERE d.employee_id IN (?) AND d.status = 'ACTIVE' AND d.deleted_at IS NULL AND d.fcm_token IS NOT NULL`,
    [employeeIds]
  );
  return rows.map((r) => r.fcm_token);
}

export async function insertMany(employeeIds, type, title, body, data) {
  if (!employeeIds.length) return;
  const json = JSON.stringify(data || {});
  const values = employeeIds.map((id) => [id, type, title, body, json]);
  await pool.query(`INSERT INTO notification (employee_id, type, title, body, data) VALUES ?`, [values]);
}

export async function listNotifications(employeeId, limit, offset) {
  const [rows] = await pool.query(
    `SELECT notification_id, type, title, body, data, is_read, read_at, created_at
     FROM notification WHERE employee_id = ? AND deleted_at IS NULL
     ORDER BY notification_id DESC LIMIT ? OFFSET ?`,
    [employeeId, limit, offset]
  );
  return rows;
}

export async function countUnread(employeeId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM notification WHERE employee_id = ? AND is_read = FALSE AND deleted_at IS NULL`,
    [employeeId]
  );
  return rows[0].total;
}

export async function markRead(employeeId, id) {
  const [res] = await pool.query(
    `UPDATE notification SET is_read = TRUE, read_at = UTC_TIMESTAMP()
     WHERE notification_id = ? AND employee_id = ? AND is_read = FALSE AND deleted_at IS NULL`,
    [id, employeeId]
  );
  return res.affectedRows;
}

export async function markAllRead(employeeId) {
  await pool.query(
    `UPDATE notification SET is_read = TRUE, read_at = UTC_TIMESTAMP()
     WHERE employee_id = ? AND is_read = FALSE AND deleted_at IS NULL`,
    [employeeId]
  );
}