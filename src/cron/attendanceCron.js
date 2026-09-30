import cron from "node-cron";
import * as attendanceModel from "../modules/attendance/attendance.model.js";
import { resolveNonWorkingReason } from "../modules/attendance/attendance.service.js";
import {
  getISTDateString,
  addDaysToDateString,
  istDateTimeToUtcDate,
  parseDbDatetimeUtc,
  diffInMinutes,
} from "../utils/time.js";

/**
 * Raat 12: kal (ya usse pehle) ke open CHECKED_IN rows -> MISSING_CHECKOUT.
 * actual_check_out = expected_logout_time, worked_minutes = check-in se
 * expected logout tak. is_auto_checkout = true.
 */
async function markMissingCheckouts() {
  const todayIST = getISTDateString(new Date());
  const yesterdayIST = addDaysToDateString(todayIST, -1);

  const rows = await attendanceModel.listOpenCheckedInRows(yesterdayIST); // date <= yesterday
  let updated = 0;

  for (const row of rows) {
    const expectedLogoutUtc = istDateTimeToUtcDate(row.attendance_date, row.expected_logout_time);
    const checkInUtc = parseDbDatetimeUtc(row.actual_check_in);
    const workedMinutes = Math.max(0, diffInMinutes(expectedLogoutUtc, checkInUtc));

    const affected = await attendanceModel.autoCheckoutRow(row.attendance_id, {
      actual_check_out: expectedLogoutUtc,
      early_checkout_minutes: 0,
      worked_minutes: workedMinutes,
    });
    updated += affected;
  }

  console.log(`[cron] missing-checkout: marked ${updated} row(s) up to ${yesterdayIST}`);
}

/**
 * Beeti dates ke NOT_CHECKED_IN rows (na check-in, na check-out) -> ABSENT.
 */
async function markAbsentRows() {
  const todayIST = getISTDateString(new Date());
  const absent = await attendanceModel.markAbsentBeforeDate(todayIST);
  console.log(`[cron] absent: marked ${absent} row(s) before ${todayIST}`);
}

/**
 * Pre-creates today's attendance row for every ACTIVE employee, so
 * NOT_CHECKED_IN / ABSENT (end of day) etc. have a row to work with.
 * Weekend dates get NO row (derived at read time). Reuses the exact
 * same priority logic as check-in (resolveNonWorkingReason) so the
 * two never drift apart.
 */
async function preCreateTodayRows() {
  const todayIST = getISTDateString(new Date());
  const officeSetting = await attendanceModel.getOfficeSetting();
  if (!officeSetting) {
    console.error("[cron] office_setting not configured - skipping pre-create");
    return;
  }

  const employees = await attendanceModel.listActiveEmployeesForCron();
  let created = 0;

  for (const employee of employees) {
    const existing = await attendanceModel.findAttendanceByEmployeeDate(employee.employee_id, todayIST);
    if (existing) continue;

    const nonWorking = await resolveNonWorkingReason(employee.employee_id, todayIST, officeSetting);
    if (nonWorking.blocked && nonWorking.status === "WEEKEND") continue; // no row for weekends

    const status = nonWorking.blocked ? nonWorking.status : "NOT_CHECKED_IN";

    await attendanceModel.insertPreCreatedRow({
      employee_id: employee.employee_id,
      attendance_date: todayIST,
      status,
      expected_login_time: employee.expected_login_time,
      expected_logout_time: employee.expected_logout_time,
    });
    created++;
  }

  console.log(`[cron] pre-create: created ${created} row(s) for ${todayIST}`);
}

/** Raat 12 ka poora flow: MISSING_CHECKOUT -> ABSENT -> aaj ki rows pre-create */
async function midnightJob() {
  await markMissingCheckouts();
  await markAbsentRows();
  await preCreateTodayRows();
}

/** Call once from server.js after the app starts. */
export function scheduleAttendanceCron() {
  cron.schedule(
    "0 0 * * *", // every day at 00:00 IST
    async () => {
      try {
        await midnightJob();
      } catch (err) {
        console.error("[cron] attendance midnight job failed:", err);
      }
    },
    { timezone: "Asia/Kolkata" }
  );
}