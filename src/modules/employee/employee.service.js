import bcrypt from "bcryptjs";
import * as employeeModel from "./employee.model.js";
import { createError } from "../../utils/createError.js";

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM, 24h

function validateTimingFields({ expected_login_time, expected_logout_time }) {
  if (!TIME_REGEX.test(expected_login_time) || !TIME_REGEX.test(expected_logout_time)) {
    throw createError(
      "VALIDATION_ERROR",
      422,
      "expected_login_time / expected_logout_time must be in HH:MM (24h) format."
    );
  }
}

export async function createEmployeeService(body) {
  const {
    employee_code,
    name,
    email,
    password,
    phone,
    expected_login_time,
    expected_logout_time,
    late_grace_minutes,
  } = body;

  if (!employee_code || !name || !email || !password || !expected_login_time || !expected_logout_time) {
    throw createError("VALIDATION_ERROR", 422, "Required employee fields are missing.");
  }
  validateTimingFields({ expected_login_time, expected_logout_time });

  const [emailExists, codeExists] = await Promise.all([
    employeeModel.findEmployeeByEmail(email),
    employeeModel.findEmployeeByCode(employee_code),
  ]);
  if (emailExists) {
    throw createError("EMAIL_ALREADY_EXISTS", 409, "This email is already registered.");
  }
  if (codeExists) {
    throw createError("EMPLOYEE_CODE_ALREADY_EXISTS", 409, "This employee code is already in use.");
  }

  const password_hash = await bcrypt.hash(password, 10);

  const employeeId = await employeeModel.createEmployee({
    employee_code,
    name,
    email,
    password_hash,
    phone,
    expected_login_time,
    expected_logout_time,
    late_grace_minutes,
  });

  return employeeModel.findEmployeeById(employeeId);
}

export async function getEmployeeService(id) {
  const employee = await employeeModel.findEmployeeById(id);
  if (!employee) {
    throw createError("EMPLOYEE_NOT_FOUND", 404, "Employee not found.");
  }
  return employee;
}

export async function listEmployeesService(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;

  const { rows, total } = await employeeModel.listEmployees({
    limit,
    offset,
    search: query.search || null,
    status: query.status || null,
  });

  return {
    items: rows,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
}

export async function updateEmployeeService(id, body) {
  await getEmployeeService(id); // ensures exists, throws 404 otherwise

  const { name, phone, expected_login_time, expected_logout_time, late_grace_minutes } = body;
  if (!name || !expected_login_time || !expected_logout_time) {
    throw createError("VALIDATION_ERROR", 422, "name, expected_login_time and expected_logout_time are required.");
  }
  validateTimingFields({ expected_login_time, expected_logout_time });

  await employeeModel.updateEmployee(id, {
    name,
    phone,
    expected_login_time,
    expected_logout_time,
    late_grace_minutes: late_grace_minutes ?? 15,
  });

  return employeeModel.findEmployeeById(id);
}

export async function updateEmployeeStatusService(id, status) {
  if (!["ACTIVE", "INACTIVE"].includes(status)) {
    throw createError("VALIDATION_ERROR", 422, "status must be ACTIVE or INACTIVE.");
  }
  await getEmployeeService(id);
  await employeeModel.updateEmployeeStatus(id, status);
  return employeeModel.findEmployeeById(id);
}

export async function getMyProfileService(employeeId) {
  return getEmployeeService(employeeId);
}

export async function updateMyProfileService(employeeId, body) {
  await getEmployeeService(employeeId);
  await employeeModel.updateEmployeeProfile(employeeId, { phone: body.phone });
  return employeeModel.findEmployeeById(employeeId);
}