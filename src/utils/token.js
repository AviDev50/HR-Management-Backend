import crypto from "crypto";

/**
 * Generates a random refresh token. Returns both:
 *  - raw: sent to the client, never stored in DB
 *  - hash: stored in refresh_token.token_hash
 */
export function generateRefreshToken() {
  const raw = crypto.randomBytes(40).toString("hex");
  const hash = hashRefreshToken(raw);
  return { raw, hash };
}

export function hashRefreshToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}