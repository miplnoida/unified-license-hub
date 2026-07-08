/**
 * Platform barrel — enterprise guardrails.
 * See docs/05_ENTERPRISE_STANDARDS.md and docs/20_NEXT_EPICS.md (EPIC 0.1).
 */
export { logger, scrub } from "./logger";
export type { LogContext, LogLevel } from "./logger";

export {
  AppError,
  ValidationError,
  NotFoundError,
  PermissionDeniedError,
  ConflictError,
  RepositoryError,
  RemoteServiceError,
  UnexpectedError,
  errorToToast,
  toAppError,
} from "./errors";

export { invokeFn, newCorrelationId, CORRELATION_HEADER } from "./http/invokeFn";
export type { EFResult, InvokeFnOptions } from "./http/invokeFn";
