import * as officeService from "./office.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const listOffices = asyncHandler(async (req, res) => {
  const offices = await officeService.listOfficesService();
  res.status(200).json({ success: true, data: offices });
});

export const createOffice = asyncHandler(async (req, res) => {
  const office = await officeService.createOfficeService(req.body);
  res.status(201).json({ success: true, message: "Office created", data: office });
});

export const getOffice = asyncHandler(async (req, res) => {
  const office = await officeService.getOfficeService(req.params.id);
  res.status(200).json({ success: true, data: office });
});

export const updateOffice = asyncHandler(async (req, res) => {
  const office = await officeService.updateOfficeService(req.params.id, req.body);
  res.status(200).json({ success: true, message: "Office updated", data: office });
});

export const deleteOffice = asyncHandler(async (req, res) => {
  await officeService.deleteOfficeService(req.params.id);
  res.status(200).json({ success: true, message: "Office deleted" });
});

export const getEmployeeOffice = asyncHandler(async (req, res) => {
  const assignment = await officeService.getEmployeeOfficeService(req.params.id);
  res.status(200).json({ success: true, data: assignment });
});

export const assignEmployeeOffice = asyncHandler(async (req, res) => {
  const assignment = await officeService.assignEmployeeOfficeService(req.params.id, req.body);
  res.status(200).json({ success: true, message: "Employee assigned to office", data: assignment });
});