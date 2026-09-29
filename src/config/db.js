import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  timezone: "+05:30",          // IST, driver isi ke hisaab se Date parse/serialize karega
  dateStrings: ["DATE"],       // DATE columns ko 'YYYY-MM-DD' string hi return karo
});

// Har connection ka session timezone bhi same rakhenge yaha (NOW(), CURRENT_TIMESTAMP ke liye)
pool.pool.on("connection", (conn) => {
  conn.query("SET time_zone = '+05:30'");
});

export default pool;