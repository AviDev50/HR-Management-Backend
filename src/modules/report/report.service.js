import * as reportModel from "./report.model.js";
import { getISTDateString, getWeekdayAbbrevForDateString, addDaysToDateString, parseDbDatetimeUtc, formatMinutes, } from "../../utils/time.js";
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

const MAX_EXPORT_DAYS = 366;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolveExportRange(query) {
  // no range given -> fall back to old month/year behaviour
  if (!query.from_date && !query.to_date) {
    const { startDate, endDate, year, month } = resolveMonthRange(query);
    return { startDate, endDate, year, month };
  }

  const startDate = query.from_date;
  const endDate = query.to_date;

  if (!startDate || !endDate || !DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    throw createError("VALIDATION_ERROR", 422, "from_date and to_date are required in YYYY-MM-DD format.");
  }
  if (Number.isNaN(Date.parse(startDate)) || Number.isNaN(Date.parse(endDate))) {
    throw createError("VALIDATION_ERROR", 422, "Invalid date.");
  }
  if (startDate > endDate) {
    throw createError("VALIDATION_ERROR", 422, "from_date cannot be after to_date.");
  }
  const totalDays = (Date.parse(endDate) - Date.parse(startDate)) / 86400000 + 1;
  if (totalDays > MAX_EXPORT_DAYS) {
    throw createError("VALIDATION_ERROR", 422, `Date range cannot exceed ${MAX_EXPORT_DAYS} days.`);
  }

  return { startDate, endDate };
}

async function countWeekendDaysInRange(startDate, endDate) {
  const officeSetting = await reportModel.getOfficeSetting();
  const weeklyOff = officeSetting?.weekly_off ? officeSetting.weekly_off.split(",") : [];

  let count = 0;
  for (let d = startDate; d <= endDate; d = addDaysToDateString(d, 1)) {
    if (weeklyOff.includes(getWeekdayAbbrevForDateString(d))) count++;
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
  late_display: formatMinutes(row.total_late_minutes),
  early_count: Number(row.early_count),
  total_early_minutes: Number(row.total_early_minutes),
  early_display: formatMinutes(row.total_early_minutes),
  early_checkout_count: Number(row.early_checkout_count),
  total_early_checkout_minutes: Number(row.total_early_checkout_minutes),
  early_checkout_display: formatMinutes(row.total_early_checkout_minutes),
  worked_hours: formatMinutes(totalWorkedMinutes),
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
    // items: rows.map((row) => shapeMonthlyRow(row, workingDays)),
    items: rows.map((r) => ({
  ...r,
  late_display: formatMinutes(r.late_minutes),
  early_display: formatMinutes(r.early_checkin_minutes),
  early_checkout_display: formatMinutes(r.early_checkout_minutes),
})),
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
  return { items: rows.map((r) => ({ ...r, late_display: formatMinutes(r.late_minutes) })), };
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

  const { startDate, endDate } = resolveExportRange(query);
  const totalDays = (Date.parse(endDate) - Date.parse(startDate)) / 86400000 + 1;
  const weekendDays = await countWeekendDaysInRange(startDate, endDate);
  const fullHolidayDays = await reportModel.countFullDayHolidays(startDate, endDate);
  const workingDays = totalDays - weekendDays - fullHolidayDays;

  const [monthlyRows, dailyRows, lateRows, leaveRows] = await Promise.all([
    reportModel.getMonthlyReport({ startDate, endDate }),
    reportModel.getDailyReportAll(startDate, endDate), // was: single date
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
  { header: "Early Arrival Count", key: "early_count", width: 18 },
{ header: "Early Arrival Min", key: "total_early_minutes", width: 18 },
{ header: "Early Checkout Count", key: "early_checkout_count", width: 20 },
{ header: "Early Checkout Min", key: "total_early_checkout_minutes", width: 20 },
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
    { header: "Early Checkout Min", key: "early_checkout_minutes", width: 10 },
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
  const filename = `attendance-report-${startDate}-to-${endDate}.xlsx`;
  return { buffer, filename };
}

export async function earlyReportService(query) {
  const { startDate, endDate } = resolveMonthRange(query);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
  const offset = (page - 1) * limit;

  const { rows, total } = await reportModel.getEarlyReport({
    employeeId: query.employee_id || null,
    from: startDate,
    to: endDate,
    limit,
    offset,
  });
  return {
    items: rows.map((r) => ({ ...r, early_display: formatMinutes(r.early_checkin_minutes) })),
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
}

const WEEKDAY_FULL = {
  MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday",
  FRI: "Friday", SAT: "Saturday", SUN: "Sunday",
};
const PRESENT_STATUSES = ["CHECKED_IN", "CHECKED_OUT", "MISSING_CHECKOUT"];
const STATUS_CODE = {
  ABSENT: "A", ON_LEAVE: "L", HALF_DAY_LEAVE: "HL", HOLIDAY: "H", HALF_DAY_HOLIDAY: "HH",
};

export async function exportAttendanceMatrixService(query) {
  const ExcelJS = (await import("exceljs")).default;
  const { year, month, startDate, endDate, todayIST } = resolveMonthRange(query);

  const officeSetting = await reportModel.getOfficeSetting();
  const weeklyOff = officeSetting?.weekly_off ? officeSetting.weekly_off.split(",") : [];

  const [employees, rows, holidays] = await Promise.all([
    reportModel.listActiveEmployeesForMatrix(),
    reportModel.getAttendanceStatusesForRange(startDate, endDate),
    reportModel.listHolidaysInRange(startDate, endDate),
  ]);

  const dates = [];
  for (let d = startDate; d <= endDate; d = addDaysToDateString(d, 1)) dates.push(d);
  const weekdayOf = Object.fromEntries(dates.map((d) => [d, getWeekdayAbbrevForDateString(d)]));

  const statusMap = new Map(rows.map((r) => [`${r.employee_id}|${r.attendance_date}`, r.status]));
  const holidayMap = new Map(holidays.map((h) => [h.holiday_date, h.holiday_type]));

  function cellFor(emp, joinDate, date) {
    const status = statusMap.get(`${emp.employee_id}|${date}`);
    if (status) {
      if (PRESENT_STATUSES.includes(status)) return "P";
      if (status === "NOT_CHECKED_IN") return date < todayIST ? "A" : "";
      return STATUS_CODE[status] || "";
    }
    // row nahi hai
    if (weeklyOff.includes(weekdayOf[date])) return WEEKDAY_FULL[weekdayOf[date]];
    if (date < joinDate || date >= todayIST) return "";
    const h = holidayMap.get(date);
    if (h) return h === "FULL_DAY" ? "H" : "HH";
    return "A"; // past working day, koi row nahi (cron miss)
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Attendance Matrix");
  const fmt = (d) => d.split("-").reverse().join("/");
  const cap = (s) => s.charAt(0) + s.slice(1).toLowerCase();

  sheet.addRow(["Week Days", ...dates.map((d) => cap(weekdayOf[d])), "", "", ""]);
  sheet.addRow(["Name", ...dates.map(fmt), "Present", "Absent", "Leave"]);

  for (const emp of employees) {
    const joinDate = getISTDateString(parseDbDatetimeUtc(emp.created_at));
    const cells = dates.map((d) => cellFor(emp, joinDate, d));
    const present = cells.filter((c) => c === "P").length;
    const absent = cells.filter((c) => c === "A").length;
    const leave = cells.filter((c) => c === "L").length + cells.filter((c) => c === "HL").length * 0.5;
    sheet.addRow([emp.name, ...cells, present, absent, leave]);
  }

  // styling
  sheet.getColumn(1).width = 24;
  dates.forEach((_, i) => (sheet.getColumn(i + 2).width = 11));
  [1, 2].forEach((r) => (sheet.getRow(r).font = { bold: true }));
  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 2 }];

  const lastDataCol = dates.length + 1;
  sheet.eachRow((row, rowNumber) => {
    row.eachCell((cell, colNumber) => {
      if (colNumber > 1) cell.alignment = { horizontal: "center" };
      if (rowNumber <= 2 || colNumber === 1 || colNumber > lastDataCol) return;
      if (cell.value === "P") cell.font = { bold: true, color: { argb: "FF1E8E3E" } };
      else if (cell.value === "A") cell.font = { bold: true, color: { argb: "FFD93025" } };
      else if (Object.values(WEEKDAY_FULL).includes(cell.value)) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
        cell.font = { color: { argb: "FF777777" } };
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `attendance-matrix-${year}-${String(month).padStart(2, "0")}.xlsx`;
  return { buffer, filename };
}