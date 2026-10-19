/**
 * An error we throw on purpose, with the HTTP status to answer with and a short
 * machine-readable code the frontend can switch on (for example "email_taken").
 * The error handler turns it into a clean JSON response.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}