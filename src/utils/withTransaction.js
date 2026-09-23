import pool from "../config/db.js";

/**
 * Runs `callback` inside a transaction. Pass it a connection (`conn`)
 * and use conn.query(...) instead of pool.query(...) for every
 * statement that must be atomic. Auto commits/rollbacks/releases.
 *
 * Usage:
 *   await withTransaction(async (conn) => {
 *     await conn.query(`UPDATE ... FOR UPDATE`, [...]);
 *     await conn.query(`INSERT ...`, [...]);
 *   });
 */
export async function withTransaction(callback) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}