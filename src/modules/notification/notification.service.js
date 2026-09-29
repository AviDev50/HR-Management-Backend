// src/modules/notification/notification.service.js
import { messaging } from "../../config/firebase.js";
import * as model from "./notification.model.js";
import { createError } from "../../utils/createError.js"; // adjust path/export to yours

const CHUNK = 500; // FCM multicast limit

// FCM data payload must be string:string
const toStr = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, String(v)]));

// mysql2 may return DATE as Date object or string - normalise to 'YYYY-MM-DD'
const toYmd = (d) => {
  if (d instanceof Date) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; // local parts (mysql2 builds DATE in local tz)
  }
  return String(d).slice(0, 10);
};

const fmtDate = (d) =>
  new Date(`${toYmd(d)}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
  });

async function pushToTokens(tokens, { title, body, data }) {
  const dead = [];
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const batch = tokens.slice(i, i + CHUNK);
    const res = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title, body },
      data: toStr(data),
      android: { priority: "high" },
    });
    res.responses.forEach((r, idx) => {
      const code = r.error && r.error.code;
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
        dead.push(batch[idx]);
      }
    });
  }
  await model.clearTokens(dead);
}

// DB row first, then best-effort push. Never throws.
async function dispatch(employeeIds, type, title, body, data) {
  try {
    await model.insertMany(employeeIds, type, title, body, data);
    const tokens = await model.getActiveTokens(employeeIds);
    if (tokens.length) await pushToTokens(tokens, { title, body, data: { type, ...data } });
  } catch (err) {
    console.error("[notification] dispatch failed:", type, err.message);
  }
}

// holiday row: { holiday_id, holiday_date, name, holiday_type, half_day_period }
export async function notifyHolidayAnnouncement(holiday) {
  const ids = await model.getActiveEmployeeIds();
  const half = holiday.holiday_type === "HALF_DAY"
    ? ` (${holiday.half_day_period === "FIRST_HALF" ? "first" : "second"} half)` : "";
  await dispatch(ids, "HOLIDAY", "Holiday Announcement",
    `${holiday.name}${half} - ${fmtDate(holiday.holiday_date)}`,
    { holiday_id: holiday.holiday_id, holiday_date: toYmd(holiday.holiday_date) });
}

// leave row: { leave_request_id, employee_id, start_date, end_date }
export async function notifyLeaveDecision(leave, status, rejectionReason) {
  const range = toYmd(leave.start_date) === toYmd(leave.end_date)
    ? fmtDate(leave.start_date)
    : `${fmtDate(leave.start_date)} to ${fmtDate(leave.end_date)}`;
  const approved = status === "APPROVED";
  await dispatch([leave.employee_id], approved ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
    approved ? "Leave Approved" : "Leave Rejected",
    approved
      ? `Your leave for ${range} has been approved.`
      : `Your leave for ${range} was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`,
    { leave_request_id: leave.leave_request_id });
}

export async function registerToken(employeeId, deviceId, token) {
  const n = await model.saveFcmToken(employeeId, deviceId, token);
  if (!n) throw createError("DEVICE_NOT_AUTHORIZED", 403, "Active device not found for this token");
}

export const removeToken = model.clearFcmToken;
export const getUnreadCount = model.countUnread;
export const markRead = model.markRead;
export const markAllRead = model.markAllRead;

export function listMine(employeeId, page = 1, limit = 20) {
  const l = Math.min(Number(limit) || 20, 50);
  const p = Math.max(Number(page) || 1, 1);
  return model.listNotifications(employeeId, l, (p - 1) * l);
}