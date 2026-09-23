import pool from "../../config/db.js";

export async function createEmployee(data) {
  const [result] = await pool.query(
    `INSERT INTO employee
       (employee_code, name, email, password_hash, phone, expected_login_time, expected_logout_time, late_grace_minutes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
    [
      data.employee_code,
      data.name,
      data.email,
      data.password_hash,
      data.phone || null,
      data.expected_login_time,
      data.expected_logout_time,
      data.late_grace_minutes ?? 15,
    ]
  );
  return result.insertId;
}

export async function findEmployeeById(id) {
  const [rows] = await pool.query(
    `SELECT employee_id, employee_code, name, email, phone,
            expected_login_time, expected_logout_time, late_grace_minutes,
            status, created_at, updated_at
     FROM employee
     WHERE employee_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function findEmployeeByEmail(email) {
  const [rows] = await pool.query(
    `SELECT employee_id FROM employee WHERE email = ? AND deleted_at IS NULL LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

export async function findEmployeeByCode(employeeCode) {
  const [rows] = await pool.query(
    `SELECT employee_id FROM employee WHERE employee_code = ? AND deleted_at IS NULL LIMIT 1`,
    [employeeCode]
  );
  return rows[0] || null;
}

export async function listEmployees({ limit, offset, search, status }) {
  const conditions = ["deleted_at IS NULL"];
  const params = [];

  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  if (search) {
    conditions.push("(name LIKE ? OR employee_code LIKE ? OR email LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = conditions.join(" AND ");

  const [rows] = await pool.query(
    `SELECT employee_id, employee_code, name, email, phone,
            expected_login_time, expected_logout_time, status, created_at
     FROM employee
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM employee WHERE ${where}`,
    params
  );

  return { rows, total: countRows[0].total };
}

export async function updateEmployee(id, data) {
  await pool.query(
    `UPDATE employee
     SET name = ?, phone = ?, expected_login_time = ?, expected_logout_time = ?, late_grace_minutes = ?
     WHERE employee_id = ? AND deleted_at IS NULL`,
    [
      data.name,
      data.phone || null,
      data.expected_login_time,
      data.expected_logout_time,
      data.late_grace_minutes,
      id,
    ]
  );
}

export async function updateEmployeeStatus(id, status) {
  await pool.query(
    `UPDATE employee SET status = ? WHERE employee_id = ? AND deleted_at IS NULL`,
    [status, id]
  );
}

export async function updateEmployeeProfile(id, data) {
  // employee self-update - only phone is editable (name/timing are admin-controlled)
  await pool.query(
    `UPDATE employee SET phone = ? WHERE employee_id = ? AND deleted_at IS NULL`,
    [data.phone || null, id]
  );
}