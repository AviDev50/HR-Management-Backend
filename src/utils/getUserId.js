/**
 * req.user is set by middleware/auth.js (requireAuth) after verifying
 * the access token. Never trust employee_id/admin_id from the client body.
 */
export function getUserId(req) {
  return req.user?.id;
}