/**
 * Platform Errors
 * ---------------
 * Typed AppError hierarchy + user-safe message mapper. See
 * docs/15_ERROR_HANDLING.md.
 */

export interface AppErrorOptions {
  code?: string;
  details?: unknown;
  correlationId?: string;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly correlationId?: string;
  readonly cause?: unknown;

  constructor(message: string, opts: AppErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.code = opts.code ?? "APP_ERROR";
    this.details = opts.details;
    this.correlationId = opts.correlationId;
    this.cause = opts.cause;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", opts: AppErrorOptions = {}) {
    super(message, { code: "VALIDATION_ERROR", ...opts });
  }
}
export class NotFoundError extends AppError {
  constructor(message = "Not found", opts: AppErrorOptions = {}) {
    super(message, { code: "NOT_FOUND", ...opts });
  }
}
export class PermissionDeniedError extends AppError {
  constructor(message = "Permission denied", opts: AppErrorOptions = {}) {
    super(message, { code: "PERMISSION_DENIED", ...opts });
  }
}
export class ConflictError extends AppError {
  constructor(message = "Conflict", opts: AppErrorOptions = {}) {
    super(message, { code: "CONFLICT", ...opts });
  }
}
export class RepositoryError extends AppError {
  constructor(message = "Data access failed", opts: AppErrorOptions = {}) {
    super(message, { code: "REPOSITORY_ERROR", ...opts });
  }
}
export class RemoteServiceError extends AppError {
  constructor(message = "Remote service failed", opts: AppErrorOptions = {}) {
    super(message, { code: "REMOTE_SERVICE_ERROR", ...opts });
  }
}
export class UnexpectedError extends AppError {
  constructor(message = "Unexpected error", opts: AppErrorOptions = {}) {
    super(message, { code: "UNEXPECTED_ERROR", ...opts });
  }
}

const USER_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: "Some fields are invalid. Please review and try again.",
  NOT_FOUND: "The requested record could not be found.",
  PERMISSION_DENIED: "You don't have permission to perform this action.",
  CONFLICT: "This action conflicts with the current state. Refresh and try again.",
  REPOSITORY_ERROR: "We couldn't reach the data service. Please try again.",
  REMOTE_SERVICE_ERROR: "A backend service failed. Please try again shortly.",
  UNEXPECTED_ERROR: "Something went wrong. Please try again.",
  APP_ERROR: "Something went wrong. Please try again.",
};

/** Convert any thrown value into a short, user-safe string for toasts. */
export function errorToToast(err: unknown): string {
  if (err instanceof AppError) {
    const base = USER_MESSAGES[err.code] ?? err.message ?? USER_MESSAGES.APP_ERROR;
    return err.correlationId ? `${base} (ref: ${err.correlationId.slice(0, 8)})` : base;
  }
  if (err instanceof Error && err.message) {
    // Never leak stack; only surface message if it's short & non-technical-looking.
    return err.message.length <= 160 ? err.message : USER_MESSAGES.UNEXPECTED_ERROR;
  }
  return USER_MESSAGES.UNEXPECTED_ERROR;
}

/** Wrap unknown thrown values in an AppError subclass. */
export function toAppError(err: unknown, fallback?: AppErrorOptions): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error) {
    return new UnexpectedError(err.message, { ...fallback, cause: err });
  }
  return new UnexpectedError(String(err), fallback);
}
