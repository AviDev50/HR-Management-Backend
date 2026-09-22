/**
 * Plain factory function (no custom Error class) that returns a
 * native Error object with statusCode + code attached, so the
 * service layer can throw structured errors and the centralized
 * errorHandler middleware can read them without string-matching
 * error.message.
 *
 * Usage in a service:
 *   import { createError } from "../../utils/createError.js";
 *
 *   if (!device || device.status !== "ACTIVE") {
 *     throw createError(
 *       "DEVICE_NOT_AUTHORIZED",
 *       403,
 *       "This employee is already registered on another device."
 *     );
 *   }
 */
export function createError(code, statusCode, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}