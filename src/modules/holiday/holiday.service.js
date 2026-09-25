import * as holidayModel from "./holiday.model.js";
import { createError } from "../../utils/createError.js";

function validateHolidayInput({ holiday_date, name, holiday_type, half_day_period }) {
  if (!holiday_date || !name || !holiday_type) {
    throw createError("VALIDATION_ERROR", 422, "holiday_date, name and holiday_type are required.");
  }
  if (!["FULL_DAY", "HALF_DAY"].includes(holiday_type)) {
    throw createError("VALIDATION_ERROR", 422, "holiday_type must be FULL_DAY or HALF_DAY.");
  }
  if (holiday_type === "HALF_DAY" && !["FIRST_HALF", "SECOND_HALF"].includes(half_day_period)) {
    throw createError(
      "VALIDATION_ERROR",
      422,
      "half_day_period (FIRST_HALF/SECOND_HALF) is required when holiday_type is HALF_DAY."
    );
  }
  if (holiday_type === "FULL_DAY" && half_day_period) {
    throw createError("VALIDATION_ERROR", 422, "half_day_period must not be set for a FULL_DAY holiday.");
  }
}

export async function createHolidayService(body) {
  validateHolidayInput(body);

  const duplicate = await holidayModel.findHolidayByDate(body.holiday_date);
  if (duplicate) {
    throw createError("VALIDATION_ERROR", 409, "A holiday already exists on this date.");
  }

  const id = await holidayModel.createHoliday(body);
  return holidayModel.findHolidayById(id);
}

export async function updateHolidayService(id, body) {
  const holiday = await holidayModel.findHolidayById(id);
  if (!holiday) throw createError("HOLIDAY_NOT_FOUND", 404, "Holiday not found.");

  validateHolidayInput(body);

  const duplicate = await holidayModel.findHolidayByDate(body.holiday_date, id);
  if (duplicate) {
    throw createError("VALIDATION_ERROR", 409, "Another holiday already exists on this date.");
  }

  await holidayModel.updateHoliday(id, body);
  return holidayModel.findHolidayById(id);
}

export async function deleteHolidayService(id) {
  const holiday = await holidayModel.findHolidayById(id);
  if (!holiday) throw createError("HOLIDAY_NOT_FOUND", 404, "Holiday not found.");
  await holidayModel.softDeleteHoliday(id);
}

export async function listHolidaysService(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 100);
  const offset = (page - 1) * limit;

  const { rows, total } = await holidayModel.listHolidays({
    year: query.year ? parseInt(query.year, 10) : null,
    limit,
    offset,
  });

  return { items: rows, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } };
}

export async function listMyHolidaysService(query) {
  return holidayModel.listActiveHolidays({ from: query.from || null, to: query.to || null });
}