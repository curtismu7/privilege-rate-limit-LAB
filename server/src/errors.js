// Named errors. The API maps `status` to the HTTP status and answers { error: code, message }.
export class LabError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'LabError';
    this.code = code;
    this.status = status;
  }
}
export const invalidConfig = (message) => new LabError('invalid_config', message);
export const invalidProfile = (message) => new LabError('invalid_profile', message);
export const invalidRequest = (message) => new LabError('invalid_request', message);
