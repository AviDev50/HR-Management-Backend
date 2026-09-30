import * as dashboardModel from "./dashboard.model.js";
import { getISTDateString } from "../../utils/time.js";

const ATTENDANCE_STATUSES = [
  "NOT_CHECKED_IN",
  "CHECKED_IN",
  "CHECKED_OUT",
  "MISSING_CHECKOUT",
  "ABSENT",
  "ON_LEAVE",
  "HALF_DAY_LEAVE",
  "HOLIDAY",
  "HALF_DAY_HOLIDAY",
];

export async function getDashboardSummaryService() {
  const today = getISTDateString(new Date());

  const [totalEmployees, statusRows, lateToday, pendingLeave, pendingDeviceChanges, nextHoliday] =
    await Promise.all([
      dashboardModel.countActiveEmployees(),
      dashboardModel.todayAttendanceStatusCounts(today),
      dashboardModel.countLateToday(today),
      dashboardModel.countPendingLeaveRequests(),
      dashboardModel.countPendingDeviceChangeRequests(),
      dashboardModel.getNextHoliday(today),
    ]);

  // zero-fill every status so the dashboard doesn't have to guess missing keys
  const attendanceToday = Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s, 0]));
  for (const row of statusRows) {
    attendanceToday[row.status] = Number(row.cnt);
  }

  return {
    date: today,
    total_active_employees: Number(totalEmployees),
    attendance_today: attendanceToday,
    late_today: Number(lateToday),
    pending_leave_requests: Number(pendingLeave),
    pending_device_change_requests: Number(pendingDeviceChanges),
    next_holiday: nextHoliday,
  };
}