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
 * Employee forgot to check out yesterday -> auto-fill checkout at
 * expected_logout_time, flagged with is_auto_checkout = true.
 * (Option A, per project decision: fill with expected_logout_time,
 * not "no checkout at all".)
 */
async function autoCheckoutYesterday() {
  const todayIST = getISTDateString(new Date());
  const yesterdayIST = addDaysToDateString(todayIST, -1);

  const openRows = await attendanceModel.listCheckedInRowsByDate(yesterdayIST);

  for (const row of openRows) {
    const expectedLogoutUtc = istDateTimeToUtcDate(yesterdayIST, row.expected_logout_time);
    const checkInUtc = parseDbDatetimeUtc(row.actual_check_in);
    const workedMinutes = Math.max(0, diffInMinutes(expectedLogoutUtc, checkInUtc));

    await attendanceModel.autoCheckoutRow(row.attendance_id, {
      actual_check_out: expectedLogoutUtc,
      early_checkout_minutes: 0, // filled exactly at expected logout - not "early" by definition
      worked_minutes: workedMinutes,
    });
  }

  console.log(`[cron] auto-checkout: processed ${openRows.length} open row(s) for ${yesterdayIST}`);
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

/** Call once from server.js after the app starts. */
export function scheduleAttendanceCron() {
  cron.schedule(
    "0 0 * * *", // every day at 00:00
    async () => {
      try {
        await autoCheckoutYesterday();
        await preCreateTodayRows();
      } catch (err) {
        console.error("[cron] attendance midnight job failed:", err);
      }
    },
    { timezone: "Asia/Kolkata" }
  );
}