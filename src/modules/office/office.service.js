import * as officeModel from "./office.model.js";
import * as employeeModel from "../employee/employee.model.js";
import { createError } from "../../utils/createError.js";

function validateOfficeInput({ office_name, latitude, longitude, allowed_radius, max_gps_accuracy }) {
  if (!office_name || latitude == null || longitude == null) {
    throw createError("VALIDATION_ERROR", 422, "office_name, latitude and longitude are required.");
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw createError("VALIDATION_ERROR", 422, "Invalid latitude/longitude.");
  }
  if (allowed_radius != null && allowed_radius <= 0) {
    throw createError("VALIDATION_ERROR", 422, "allowed_radius must be positive.");
  }
  if (max_gps_accuracy != null && max_gps_accuracy <= 0) {
    throw createError("VALIDATION_ERROR", 422, "max_gps_accuracy must be positive.");
  }
}

export async function createOfficeService(body) {
  validateOfficeInput(body);
  const id = await officeModel.createOffice(body);
  return officeModel.findOfficeById(id);
}

export async function listOfficesService() {
  return officeModel.listOffices();
}

export async function getOfficeService(id) {
  const office = await officeModel.findOfficeById(id);
  if (!office) throw createError("OFFICE_NOT_FOUND", 404, "Office not found.");
  return office;
}

export async function updateOfficeService(id, body) {
  await getOfficeService(id);
  validateOfficeInput(body);
  await officeModel.updateOffice(id, body);
  return officeModel.findOfficeById(id);
}

export async function deleteOfficeService(id) {
  await getOfficeService(id);
  const activeCount = await officeModel.countActiveAssignmentsForOffice(id);
  if (activeCount > 0) {
    throw createError(
      "VALIDATION_ERROR",
      409,
      "Cannot delete an office with employees still assigned to it. Reassign them first."
    );
  }
  await officeModel.softDeleteOffice(id);
}

// ---- employee <-> office assignment ----

export async function getEmployeeOfficeService(employeeId) {
  const employee = await employeeModel.findEmployeeById(employeeId);
  if (!employee) throw createError("EMPLOYEE_NOT_FOUND", 404, "Employee not found.");
  return officeModel.findActiveAssignment(employeeId);
}

export async function assignEmployeeOfficeService(employeeId, body) {
  const { office_setting_id } = body;
  if (!office_setting_id) {
    throw createError("VALIDATION_ERROR", 422, "office_setting_id is required.");
  }

  const employee = await employeeModel.findEmployeeById(employeeId);
  if (!employee) throw createError("EMPLOYEE_NOT_FOUND", 404, "Employee not found.");

  const office = await officeModel.findOfficeById(office_setting_id);
  if (!office) throw createError("OFFICE_NOT_FOUND", 404, "Office not found.");

  await officeModel.upsertAssignment(employeeId, office_setting_id);
  return officeModel.findActiveAssignment(employeeId);
}