// Express 4 does not catch errors from async functions.
// Wrapping a controller with asyncHandler sends any error to errorHandler.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
