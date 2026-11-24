// One place that converts every error into a JSON response: { message }
function errorHandler(err, req, res, next) {
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid id' });
  }
  if (err.name === 'ValidationError') {
    const first = Object.values(err.errors)[0];
    return res.status(400).json({ message: first ? first.message : err.message });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: 'That email is already registered' });
  }

  const status = err.status || 500;
  if (status === 500) console.error(err); // log unexpected errors only

  res.status(status).json({
    message: status === 500 ? 'Something went wrong on the server' : err.message,
  });
}

module.exports = errorHandler;
