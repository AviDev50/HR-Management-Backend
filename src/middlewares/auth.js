import { verifyAccessToken } from "../utils/jwt.js";
import { createError } from "../utils/createError.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next(createError("TOKEN_INVALID", 401, "Access token is required."));
  }

  const token = header.split(" ")[1];

  try {
    const payload = verifyAccessToken(token); // { id, role }
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch (err) {
    next(createError("TOKEN_INVALID", 401, "Invalid or expired token."));
  }
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