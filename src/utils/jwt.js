import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

export function signAccessToken(payload, expiresIn) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}