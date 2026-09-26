import { verifyAccessToken } from "../utils/jwt.js";
import { createError } from "../utils/createError.js";
import * as deviceModel from "../modules/device/device.model.js";

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next(createError("TOKEN_INVALID", 401, "Access token is required."));
  }

  const token = header.split(" ")[1];

  let payload;
  try {
    payload = verifyAccessToken(token); // { id, role, device_id? }
  } catch (err) {
    return next(createError("TOKEN_INVALID", 401, "Invalid or expired token."));
  }

  // One active device per employee (spec section 72): if a different
  // device has since been approved, this token's device_id is stale -
  // reject immediately instead of waiting for the token to expire.
  // This is what makes device approval "log out" the old device.
  if (payload.role === "EMPLOYEE") {
    try {
      const activeDevice = await deviceModel.findActiveDeviceByEmployeeId(payload.id);
      if (!activeDevice || activeDevice.device_id !== payload.device_id) {
        return next(
          createError(
            "DEVICE_NOT_AUTHORIZED",
            403,
            "This device is no longer authorized. Please log in again from your active device."
          )
        );
      }
    } catch (err) {
      return next(err);
    }
  }

  req.user = { id: payload.id, role: payload.role };
  next();
}

export function requireRole(role) {
  return function (req, res, next) {
    if (!req.user || req.user.role !== role) {
      return next(
        createError("FORBIDDEN", 403, "You do not have permission to access this resource.")
      );
    }
    next();
  };
}