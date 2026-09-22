/**
 * Wraps an async Express handler so any thrown/rejected error
 * is forwarded to next(error) instead of needing try/catch
 * in every controller function.
 *
 * Usage:
 *   export const getConsultation = asyncHandler(async (req, res) => {
 *     const data = await someService(req.params.id);
 *     res.status(200).json({ success: true, data });
 *   });
 */
export function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}