import pool from "../../config/db.js";

export async function findActiveWfhLocation(employeeId) {
  const [rows] = await pool.query(
    `SELECT * FROM employee_wfh_location
     WHERE employee_id = ? AND status = 'ACTIVE' AND deleted_at IS NULL
     LIMIT 1`,
    [employeeId]
  );
  return rows[0] || null;
}

export async function upsertWfhLocation(employeeId, data) {
  const existing = await findActiveWfhLocation(employeeId);

  if (existing) {
    await pool.query(
      `UPDATE employee_wfh_location
       SET name = ?, latitude = ?, longitude = ?, radius_meters = ?
       WHERE employee_wfh_location_id = ?`,
      [data.name || null, data.latitude, data.longitude, data.radius_meters ?? 100, existing.employee_wfh_location_id]
    );
    return existing.employee_wfh_location_id;
  }

  const [result] = await pool.query(
    `INSERT INTO employee_wfh_location (employee_id, name, latitude, longitude, radius_meters, status)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
    [employeeId, data.name || null, data.latitude, data.longitude, data.radius_meters ?? 100]
  );
  return result.insertId;
}

export async function updateWfhStatus(employeeId, status) {
  await pool.query(
    `UPDATE employee_wfh_location SET status = ? WHERE employee_id = ? AND deleted_at IS NULL`,
    [status, employeeId]
  );
}