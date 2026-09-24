/**
 * Centralized error-handling middleware. Must be registered LAST,
 * after all routes, in app.js:
 *
 *   app.use(errorHandler);
 *
 * Any error passed to next(error) — whether from asyncHandler
 * catching a rejected promise, or called directly — ends up here.
 * Response shape matches the spec's error catalogue format:
 *   { success: false, error: { code, message } }
 */
export function errorHandler(err, req, res, next) {
  // Known/expected errors created via createError() carry statusCode + code
  let statusCode = err.statusCode || 500;
  let code = err.code || "INTERNAL_SERVER_ERROR";
  let message = err.message || "Something went wrong";

  // MySQL duplicate-key errors (e.g. duplicate check-in, duplicate device_id)
  // slipping through without an explicit createError() call
  if (err.code === "ER_DUP_ENTRY") {
    statusCode = 409;
    code = "DUPLICATE_ENTRY";
    message = "This record already exists.";
  }

  // Never leak internals for unexpected 500s
  if (statusCode === 500) {
    console.error(err); // keep server-side visibility
    message = "Something went wrong. Please try again.";
    code = "INTERNAL_SERVER_ERROR";
  }

  res.status(statusCode).json({
    success: false,
    error: { code, message },
  });
}