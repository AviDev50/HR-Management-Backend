import pool from "../../config/db.js"; // adjust path to your actual db.js location

export async function findEmployeeByEmail(email) {
  const [rows] = await pool.query(
    `SELECT employee_id, employee_code, name, email, password_hash, status
     FROM employee
     WHERE email = ? AND deleted_at IS NULL
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

export async function findAdminByEmail(email) {
  const [rows] = await pool.query(
    `SELECT admin_id, name, email, password_hash, status
     FROM admin
     WHERE email = ? AND deleted_at IS NULL
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

export async function findActiveDeviceByEmployeeId(employeeId) {
  const [rows] = await pool.query(
    `SELECT employee_device_id, employee_id, device_id, device_name, device_model, platform, status
     FROM employee_device
     WHERE employee_id = ? AND status = 'ACTIVE' AND deleted_at IS NULL
     LIMIT 1`,
    [employeeId]
  );
  return rows[0] || null;
}

export async function insertEmployeeDevice(employeeId, device) {
  const [result] = await pool.query(
    `INSERT INTO employee_device
       (employee_id, device_id, device_name, device_model, platform, status, registered_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', NOW(), NOW())`,
    [employeeId, device.device_id, device.device_name || null, device.model || null, device.platform]
  );
  return result.insertId;
}

export async function touchDeviceLastLogin(employeeDeviceId) {
  await pool.query(
    `UPDATE employee_device SET last_login_at = NOW() WHERE employee_device_id = ?`,
    [employeeDeviceId]
  );
}

export async function touchAdminLastLogin(adminId) {
  await pool.query(`UPDATE admin SET last_login_at = NOW() WHERE admin_id = ?`, [adminId]);
}

export async function insertRefreshToken({ userType, userId, tokenHash, expiresAt }) {
  await pool.query(
    `INSERT INTO refresh_token (user_type, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [userType, userId, tokenHash, expiresAt]
  );
}

export async function findRefreshTokenByHash(tokenHash) {
  const [rows] = await pool.query(
    `SELECT refresh_token_id, user_type, user_id, expires_at, revoked_at
     FROM refresh_token
     WHERE token_hash = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
}

export async function revokeRefreshTokenByHash(tokenHash) {
  await pool.query(
    `UPDATE refresh_token SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL`,
    [tokenHash]
  );
}