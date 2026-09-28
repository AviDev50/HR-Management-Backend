import pool from "../../config/db.js";

// ---- office_setting (branch master) ----

export async function createOffice(data) {
  const [result] = await pool.query(
    `INSERT INTO office_setting
       (office_name, latitude, longitude, allowed_radius, max_gps_accuracy, weekly_off, timezone)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.office_name,
      data.latitude,
      data.longitude,
      data.allowed_radius ?? 100,
      data.max_gps_accuracy ?? 100,
      data.weekly_off || "SUN",
      data.timezone || "Asia/Kolkata",
    ]
  );
  return result.insertId;
}

export async function findOfficeById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM office_setting WHERE office_setting_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function listOffices() {
  const [rows] = await pool.query(
    `SELECT * FROM office_setting WHERE deleted_at IS NULL ORDER BY office_setting_id ASC`
  );
  return rows;
}

export async function updateOffice(id, data) {
  await pool.query(
    `UPDATE office_setting
     SET office_name = ?, latitude = ?, longitude = ?, allowed_radius = ?,
         max_gps_accuracy = ?, weekly_off = ?, timezone = ?
     WHERE office_setting_id = ? AND deleted_at IS NULL`,
    [
      data.office_name,
      data.latitude,
      data.longitude,
      data.allowed_radius,
      data.max_gps_accuracy,
      data.weekly_off,
      data.timezone,
      id,
    ]
  );
}

export async function softDeleteOffice(id) {
  await pool.query(
    `UPDATE office_setting SET deleted_at = NOW() WHERE office_setting_id = ? AND deleted_at IS NULL`,
    [id]
  );
}

export async function countActiveAssignmentsForOffice(officeSettingId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM employee_office
     WHERE office_setting_id = ? AND status = 'ACTIVE' AND deleted_at IS NULL`,
    [officeSettingId]
  );
  return rows[0].cnt;
}

// ---- employee_office (branch assignment - one ACTIVE per employee) ----

export async function findActiveAssignment(employeeId) {
  const [rows] = await pool.query(
    `SELECT eo.employee_office_id, eo.office_setting_id, os.office_name
     FROM employee_office eo
     JOIN office_setting os ON os.office_setting_id = eo.office_setting_id
     WHERE eo.employee_id = ? AND eo.status = 'ACTIVE' AND eo.deleted_at IS NULL AND os.deleted_at IS NULL
     LIMIT 1`,
    [employeeId]
  );
  return rows[0] || null;
}

/**
 * Full office_setting row (lat/lng/radius/accuracy) assigned to this
 * employee, for geofence validation at check-in/check-out. null if
 * the employee has no explicit assignment (caller should fall back to
 * the default/first office_setting row in that case).
 */
export async function getAssignedOfficeSetting(employeeId) {
  const [rows] = await pool.query(
    `SELECT os.*
     FROM employee_office eo
     JOIN office_setting os ON os.office_setting_id = eo.office_setting_id
     WHERE eo.employee_id = ? AND eo.status = 'ACTIVE' AND eo.deleted_at IS NULL AND os.deleted_at IS NULL
     LIMIT 1`,
    [employeeId]
  );
  return rows[0] || null;
}

export async function upsertAssignment(employeeId, officeSettingId) {
  const existing = await findActiveAssignment(employeeId);

  if (existing) {
    await pool.query(
      `UPDATE employee_office SET office_setting_id = ? WHERE employee_office_id = ?`,
      [officeSettingId, existing.employee_office_id]
    );
    return existing.employee_office_id;
  }

  const [result] = await pool.query(
    `INSERT INTO employee_office (employee_id, office_setting_id, status) VALUES (?, ?, 'ACTIVE')`,
    [employeeId, officeSettingId]
  );
  return result.insertId;
}