import * as employeeService from "./employee.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getUserId } from "../../utils/getUserId.js";

// ---- Admin ----
export const createEmployee = asyncHandler(async (req, res) => {
  const employee = await employeeService.createEmployeeService(req.body);
  res.status(201).json({ success: true, message: "Employee created", data: employee });
});

export const listEmployees = asyncHandler(async (req, res) => {
  const result = await employeeService.listEmployeesService(req.query);
  res.status(200).json({ success: true, data: result });
});

export const getEmployee = asyncHandler(async (req, res) => {
  const employee = await employeeService.getEmployeeService(req.params.id);
  res.status(200).json({ success: true, data: employee });
});

export const updateEmployee = asyncHandler(async (req, res) => {
  const employee = await employeeService.updateEmployeeService(req.params.id, req.body);
  res.status(200).json({ success: true, message: "Employee updated", data: employee });
});

export const updateEmployeeStatus = asyncHandler(async (req, res) => {
  const employee = await employeeService.updateEmployeeStatusService(req.params.id, req.body.status);
  res.status(200).json({ success: true, message: "Employee status updated", data: employee });
});

// ---- Employee (self) ----
export const getMyProfile = asyncHandler(async (req, res) => {
  const employee = await employeeService.getMyProfileService(getUserId(req));
  res.status(200).json({ success: true, data: employee });
});

export const updateMyProfile = asyncHandler(async (req, res) => {
  const employee = await employeeService.updateMyProfileService(getUserId(req), req.body);
  res.status(200).json({ success: true, message: "Profile updated", data: employee });
});