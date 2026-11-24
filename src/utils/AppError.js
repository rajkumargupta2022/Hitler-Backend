// An error that carries an HTTP status code.
// Throw it anywhere: throw new AppError(404, 'Project not found')
class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = AppError;
