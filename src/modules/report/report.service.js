import * as reportModel from "./report.model.js";
import { getISTDateString, getWeekdayAbbrevForDateString } from "../../utils/time.js";
import { createError } from "../../utils/createError.js";

function resolveMonthRange(query) {
  const now = new Date();
  const todayIST = getISTDateString(now);
  const [todayYear, todayMonth] = todayIST.split("-").map(Number);

  const year = parseInt(query.year, 10) || todayYear;
  const month = parseInt(query.month, 10) || todayMonth;
  if (month < 1 || month > 12) {
    throw createError("VALIDATION_ERROR", 422, "month must be between 1 and 12.");
  }

  const pad = (n) => String(n).padStart(2, "0");
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDate = `${year}-${pad(month)}-01`;
  const endDate = `${year}-${pad(month)}-${pad(daysInMonth)}`;

  return { year, month, startDate, endDate, daysInMonth, todayIST };
}

async function countWeekendDays(year, month, daysInMonth) {
  const pad = (n) => String(n).padStart(2, "0");
  const officeSetting = await reportModel.getOfficeSetting();
  const weeklyOff = officeSetting?.weekly_off ? officeSetting.weekly_off.split(",") : [];

  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad(month)}-${pad(d)}`;
    if (weeklyOff.includes(getWeekdayAbbrevForDateString(dateStr))) count++;
  }
  return count;
}

function shapeMonthlyRow(row, workingDays) {
  const leaveDays = Number(row.full_leave_days) + Number(row.half_leave_days) * 0.5;
  const holidayDays = Number(row.full_holiday_days) + Number(row.half_holiday_days) * 0.5;
  const absentDays = Number(row.missed_days) + Number(row.override_absent_days);
  const totalWorkedMinutes = Number(row.total_worked_minutes);

  return {
    employee_id: row.employee_id,
    employee_code: row.employee_code,
    name: row.employee_name,
    working_days: workingDays,
    present_days: Number(row.present_days),
    absent_days: absentDays,
    leave_days: leaveDays,
    holiday_days: holidayDays,
    late_count: Number(row.late_count),
    total_late_minutes: Number(row.total_late_minutes),
    early_count: Number(row.early_count),
    total_early_minutes: Number(row.total_early_minutes),
    worked_hours: `${Math.floor(totalWorkedMinutes / 60)}h ${totalWorkedMinutes % 60}m`,
  };
}

export async function dailyReportService(query) {
  const date = query.date || getISTDateString(new Date());
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
  const offset = (page - 1) * limit;

  const { rows, total } = await reportModel.getDailyReport(date, { limit, offset });
  return { date, items: rows, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } };
}

export async function monthlyReportService(query) {
  const { year, month, startDate, endDate, daysInMonth } = resolveMonthRange(query);
  const weekendDays = await countWeekendDays(year, month, daysInMonth);
  const fullHolidayDays = await reportModel.countFullDayHolidays(startDate, endDate);
  const workingDays = daysInMonth - weekendDays - fullHolidayDays;

  const rows = await reportModel.getMonthlyReport({
    employeeId: query.employee_id || null,
    startDate,
    endDate,
  });

  return {
    year,
    month,
    weekend_days: weekendDays,
    holiday_days: fullHolidayDays,
    items: rows.map((row) => shapeMonthlyRow(row, workingDays)),
  };
}

export async function lateReportService(query) {
  const { startDate, endDate } = resolveMonthRange(query);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
  const offset = (page - 1) * limit;

  const { rows, total } = await reportModel.getLateReport({
    employeeId: query.employee_id || null,
    from: startDate,
    to: endDate,
    limit,
    offset,
  });
  return { items: rows, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } };
}

export async function leaveReportService(query) {
  const { startDate, endDate } = resolveMonthRange(query);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
  const offset = (page - 1) * limit;

  const { rows, total } = await reportModel.getLeaveReport({
    employeeId: query.employee_id || null,
    status: query.status || null,
    from: startDate,
    to: endDate,
    limit,
    offset,
  });
  return { items: rows, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } };
}

export async function exportMonthlyExcelService(query) {
  const ExcelJS = (await import("exceljs")).default;

  const { year, month, startDate, endDate, daysInMonth } = resolveMonthRange(query);
  const weekendDays = await countWeekendDays(year, month, daysInMonth);
  const fullHolidayDays = await reportModel.countFullDayHolidays(startDate, endDate);
  const workingDays = daysInMonth - weekendDays - fullHolidayDays;

  const [monthlyRows, dailyRows, lateRows, leaveRows] = await Promise.all([
    reportModel.getMonthlyReport({ startDate, endDate }),
    reportModel.getDailyReportAll(query.date || startDate),
    reportModel.getLateReportAll(startDate, endDate),
    reportModel.getLeaveReportAll(startDate, endDate),
  ]);

  const workbook = new ExcelJS.Workbook();

  const summarySheet = workbook.addWorksheet("Monthly Summary");
  summarySheet.columns = [
    { header: "Employee Code", key: "employee_code", width: 15 },
    { header: "Name", key: "name", width: 20 },
    { header: "Working Days", key: "working_days", width: 12 },
    { header: "Present Days", key: "present_days", width: 12 },
    { header: "Absent Days", key: "absent_days", width: 12 },
    { header: "Leave Days", key: "leave_days", width: 12 },
    { header: "Holiday Days", key: "holiday_days", width: 12 },
    { header: "Late Count", key: "late_count", width: 10 },
    { header: "Total Late Min", key: "total_late_minutes", width: 14 },
    { header: "Early Count", key: "early_count", width: 10 },
    { header: "Total Early Min", key: "total_early_minutes", width: 14 },
    { header: "Worked Hours", key: "worked_hours", width: 14 },
  ];
  summarySheet.addRows(monthlyRows.map((row) => shapeMonthlyRow(row, workingDays)));

  const dailySheet = workbook.addWorksheet("Daily Attendance");
  dailySheet.columns = [
    { header: "Employee Code", key: "employee_code", width: 15 },
    { header: "Name", key: "employee_name", width: 20 },
    { header: "Date", key: "attendance_date", width: 12 },
    { header: "Status", key: "status", width: 16 },
    { header: "Check In", key: "actual_check_in", width: 20 },
    { header: "Check Out", key: "actual_check_out", width: 20 },
    { header: "Late Min", key: "late_minutes", width: 10 },
    { header: "Early Min", key: "early_checkout_minutes", width: 10 },
    { header: "Worked Min", key: "worked_minutes", width: 10 },
  ];
  dailySheet.addRows(dailyRows);

  const lateSheet = workbook.addWorksheet("Late Report");
  lateSheet.columns = [
    { header: "Date", key: "attendance_date", width: 12 },
    { header: "Employee Code", key: "employee_code", width: 15 },
    { header: "Name", key: "employee_name", width: 20 },
    { header: "Expected In", key: "expected_login_time", width: 12 },
    { header: "Actual In", key: "actual_check_in", width: 20 },
    { header: "Late Min", key: "late_minutes", width: 10 },
  ];
  lateSheet.addRows(lateRows);

  const leaveSheet = workbook.addWorksheet("Leave Report");
  leaveSheet.columns = [
    { header: "Employee Code", key: "employee_code", width: 15 },
    { header: "Name", key: "employee_name", width: 20 },
    { header: "Leave Type", key: "leave_type_name", width: 15 },
    { header: "Start", key: "start_date", width: 12 },
    { header: "End", key: "end_date", width: 12 },
    { header: "Duration", key: "leave_duration_type", width: 14 },
    { header: "Days", key: "total_days", width: 8 },
    { header: "Status", key: "status", width: 12 },
  ];
  leaveSheet.addRows(leaveRows);

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `attendance-report-${year}-${String(month).padStart(2, "0")}.xlsx`;
  return { buffer, filename };
}