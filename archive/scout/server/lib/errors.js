export class HttpError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Authentication required') =>
  new HttpError(401, 'UNAUTHORIZED', message);
export const notFound = (message = 'Not found') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (message, details) => new HttpError(409, 'CONFLICT', message, details);
export const unprocessable = (message, details) =>
  new HttpError(422, 'VALIDATION_ERROR', message, details);
export const tooMany = (message, details) =>
  new HttpError(429, 'RATE_LIMITED', message, details);
export const serverError = (message = 'Internal server error') =>
  new HttpError(500, 'INTERNAL', message);
