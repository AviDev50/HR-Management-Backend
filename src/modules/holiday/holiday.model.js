import pool from "../../config/db.js";

export async function createHoliday(data) {
  const [result] = await pool.query(
    `INSERT INTO holiday (holiday_date, name, holiday_type, half_day_period, status)
     VALUES (?, ?, ?, ?, 'ACTIVE')`,
    [data.holiday_date, data.name, data.holiday_type, data.half_day_period || null]
  );
  return result.insertId;
}

export async function findHolidayById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM holiday WHERE holiday_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function findHolidayByDate(date, excludeId = null) {
  const params = [date];
  let query = `SELECT holiday_id FROM holiday WHERE holiday_date = ? AND deleted_at IS NULL`;
  if (excludeId) {
    query += ` AND holiday_id != ?`;
    params.push(excludeId);
  }
  query += ` LIMIT 1`;
  const [rows] = await pool.query(query, params);
  return rows[0] || null;
}

export async function updateHoliday(id, data) {
  await pool.query(
    `UPDATE holiday
     SET holiday_date = ?, name = ?, holiday_type = ?, half_day_period = ?
     WHERE holiday_id = ? AND deleted_at IS NULL`,
    [data.holiday_date, data.name, data.holiday_type, data.half_day_period || null, id]
  );
}

export async function softDeleteHoliday(id) {
  await pool.query(
    `UPDATE holiday SET deleted_at = NOW() WHERE holiday_id = ? AND deleted_at IS NULL`,
    [id]
  );
}

export async function listHolidays({ year, limit, offset }) {
  const conditions = ["deleted_at IS NULL"];
  const params = [];
  if (year) {
    conditions.push("YEAR(holiday_date) = ?");
    params.push(year);
  }
  const where = conditions.join(" AND ");

  const [rows] = await pool.query(
    `SELECT * FROM holiday WHERE ${where} ORDER BY holiday_date ASC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM holiday WHERE ${where}`, params);
  return { rows, total: countRows[0].total };
}

// employee-facing - only ACTIVE holidays, optional date range
export async function listActiveHolidays({ from, to }) {
  const conditions = ["status = 'ACTIVE'", "deleted_at IS NULL"];
  const params = [];
  if (from) {
    conditions.push("holiday_date >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("holiday_date <= ?");
    params.push(to);
  }
  const where = conditions.join(" AND ");

  const [rows] = await pool.query(
    `SELECT holiday_id, holiday_date, name, holiday_type, half_day_period
     FROM holiday WHERE ${where} ORDER BY holiday_date ASC`,
    params
  );
  return rows;
}