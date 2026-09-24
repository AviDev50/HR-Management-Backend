import bcrypt from "bcryptjs";
import * as authModel from "./auth.model.js";
import * as deviceModel from "../device/device.model.js";
import { signAccessToken } from "../../utils/jwt.js";
import { generateRefreshToken, hashRefreshToken } from "../../utils/token.js";
import { createError } from "../../utils/createError.js";

const EMPLOYEE_ACCESS_EXPIRY = "30d"; // mobile app - long-lived
const ADMIN_ACCESS_EXPIRY = "8h"; // web panel - shorter
const REFRESH_TOKEN_DAYS = 90;

function refreshExpiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + REFRESH_TOKEN_DAYS);
  return date;
}

export async function loginEmployeeService(body) {
  const { login: email, password, device } = body;

  if (!email || !password) {
    throw createError("VALIDATION_ERROR", 422, "Email and password are required.");
  }
  if (!device || !device.device_id || !device.platform) {
    throw createError("VALIDATION_ERROR", 422, "Device details are required.");
  }

  const employee = await authModel.findEmployeeByEmail(email);
  if (!employee) {
    throw createError("INVALID_CREDENTIALS", 401, "Invalid email or password.");
  }
  if (employee.status !== "ACTIVE") {
    throw createError("EMPLOYEE_INACTIVE", 403, "This employee account is disabled.");
  }

  const passwordMatches = await bcrypt.compare(password, employee.password_hash);
  if (!passwordMatches) {
    throw createError("INVALID_CREDENTIALS", 401, "Invalid email or password.");
  }

  const activeDevice = await authModel.findActiveDeviceByEmployeeId(employee.employee_id);

  if (!activeDevice) {
    // no device bound yet -> this device becomes ACTIVE automatically
    await authModel.insertEmployeeDevice(employee.employee_id, device);
  } else if (activeDevice.device_id === device.device_id) {
    // same device logging in again -> allowed
    await authModel.touchDeviceLastLogin(activeDevice.employee_device_id);
  } else {
    // different device -> blocked until admin-approved device-change request.
    // Employee can never provide the NEW device's info from the OLD device,
    // so login itself raises the request using the device info this call
    // just received (from the new device attempting to log in).
    const alreadyPending = await deviceModel.findPendingRequestByEmployeeId(employee.employee_id);
    if (!alreadyPending) {
      await deviceModel.createChangeRequest({
        employeeId: employee.employee_id,
        oldEmployeeDeviceId: activeDevice.employee_device_id,
        newDevice: device,
      });
    }

    throw createError(
      "DEVICE_NOT_AUTHORIZED",
      403,
      "This employee is already registered on another device. A device-change request has been raised and is pending admin approval."
    );
  }

  const accessToken = signAccessToken(
    { id: employee.employee_id, role: "EMPLOYEE" },
    EMPLOYEE_ACCESS_EXPIRY
  );

  const { raw: refreshToken, hash } = generateRefreshToken();
  await authModel.insertRefreshToken({
    userType: "EMPLOYEE",
    userId: employee.employee_id,
    tokenHash: hash,
    expiresAt: refreshExpiryDate(),
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: { id: employee.employee_id, role: "EMPLOYEE", name: employee.name },
    device_status: "ACTIVE",
  };
}

export async function loginAdminService(body) {
  const { login: email, password } = body;

  if (!email || !password) {
    throw createError("VALIDATION_ERROR", 422, "Email and password are required.");
  }

  const admin = await authModel.findAdminByEmail(email);
  if (!admin) {
    throw createError("INVALID_CREDENTIALS", 401, "Invalid email or password.");
  }
  if (admin.status !== "ACTIVE") {
    throw createError("EMPLOYEE_INACTIVE", 403, "This admin account is disabled.");
  }

  const passwordMatches = await bcrypt.compare(password, admin.password_hash);
  if (!passwordMatches) {
    throw createError("INVALID_CREDENTIALS", 401, "Invalid email or password.");
  }

  await authModel.touchAdminLastLogin(admin.admin_id);

  const accessToken = signAccessToken({ id: admin.admin_id, role: "ADMIN" }, ADMIN_ACCESS_EXPIRY);

  const { raw: refreshToken, hash } = generateRefreshToken();
  await authModel.insertRefreshToken({
    userType: "ADMIN",
    userId: admin.admin_id,
    tokenHash: hash,
    expiresAt: refreshExpiryDate(),
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: { id: admin.admin_id, role: "ADMIN", name: admin.name },
  };
}

export async function refreshTokenService(refreshToken) {
  if (!refreshToken) {
    throw createError("VALIDATION_ERROR", 422, "Refresh token is required.");
  }

  const hash = hashRefreshToken(refreshToken);
  const stored = await authModel.findRefreshTokenByHash(hash);

  if (!stored || stored.revoked_at || new Date(stored.expires_at) < new Date()) {
    throw createError("TOKEN_INVALID", 401, "Refresh token is invalid or expired.");
  }

  const expiry = stored.user_type === "ADMIN" ? ADMIN_ACCESS_EXPIRY : EMPLOYEE_ACCESS_EXPIRY;
  const accessToken = signAccessToken({ id: stored.user_id, role: stored.user_type }, expiry);

  return { access_token: accessToken };
}

export async function logoutService(refreshToken) {
  // Logout only ends the session (revokes refresh token). It does NOT
  // release device binding - spec section 72.7.
  if (!refreshToken) return;
  const hash = hashRefreshToken(refreshToken);
  await authModel.revokeRefreshTokenByHash(hash);
}