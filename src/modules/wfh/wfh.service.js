import * as wfhModel from "./wfh.model.js";
import * as employeeModel from "../employee/employee.model.js";
import { createError } from "../../utils/createError.js";

function validateWfhInput({ latitude, longitude, radius_meters }) {
  if (latitude == null || longitude == null) {
    throw createError("VALIDATION_ERROR", 422, "latitude and longitude are required.");
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw createError("VALIDATION_ERROR", 422, "Invalid latitude/longitude.");
  }
  if (radius_meters != null && radius_meters <= 0) {
    throw createError("VALIDATION_ERROR", 422, "radius_meters must be positive.");
  }
}

export async function getWfhLocationService(employeeId) {
  const employee = await employeeModel.findEmployeeById(employeeId);
  if (!employee) throw createError("EMPLOYEE_NOT_FOUND", 404, "Employee not found.");
  return wfhModel.findActiveWfhLocation(employeeId);
}

export async function upsertWfhLocationService(employeeId, body) {
  const employee = await employeeModel.findEmployeeById(employeeId);
  if (!employee) throw createError("EMPLOYEE_NOT_FOUND", 404, "Employee not found.");

  validateWfhInput(body);
  await wfhModel.upsertWfhLocation(employeeId, body);
  return wfhModel.findActiveWfhLocation(employeeId);
}

export async function updateWfhStatusService(employeeId, status) {
  if (!["ACTIVE", "INACTIVE"].includes(status)) {
    throw createError("VALIDATION_ERROR", 422, "status must be ACTIVE or INACTIVE.");
  }
  const existing = await wfhModel.findActiveWfhLocation(employeeId);
  if (!existing && status === "ACTIVE") {
    throw createError("VALIDATION_ERROR", 404, "No WFH location configured for this employee yet.");
  }
  await wfhModel.updateWfhStatus(employeeId, status);
  return wfhModel.findActiveWfhLocation(employeeId);
}