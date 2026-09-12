/**
 * Platform Logger
 * ---------------
 * Centralised structured logger. All non-logger modules MUST use this
 * instead of `console.*`. See docs/16_LOGGING_STANDARD.md.
 */

 

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  correlationId?: string;
  feature?: string;
  [key: string]: unknown;
}

const SCRUB_KEYS = new Set([
  "password",
  "token",
  "access_token",
  "refresh_token",
  "otp",
  "secret",
  "authorization",
  "apikey",
  "api_key",
]);

const isDev =
  (typeof import.meta !== "undefined" && (import.meta as any)?.env?.DEV) ??
  (typeof process !== "undefined" && process.env?.NODE_ENV !== "production");

function scrubValue(value: unknown, depth = 0): unknown {
  if (value == null || depth > 5) return value;
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SCRUB_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : scrubValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function scrub<T>(obj: T): T {
  return scrubValue(obj) as T;
}

function emit(level: LogLevel, event: string, context?: LogContext): void {
  const payload = {
    level,
    event,
    ts: new Date().toISOString(),
    ...(context ? (scrub(context) as Record<string, unknown>) : {}),
  };
  const fn =
    level === "error" ? console.error :
    level === "warn"  ? console.warn  :
    level === "debug" ? console.debug :
                        console.info;
  fn(payload);
}

export const logger = {
  debug(event: string, context?: LogContext): void {
    if (isDev) emit("debug", event, context);
  },
  info(event: string, context?: LogContext): void {
    emit("info", event, context);
  },
  warn(event: string, context?: LogContext): void {
    emit("warn", event, context);
  },
  error(err: unknown, context?: LogContext): void {
    const base: LogContext = { ...context };
    if (err instanceof Error) {
      base.message = err.message;
      base.name = err.name;
      if (isDev) base.stack = err.stack;
    } else {
      base.message = String(err);
    }
    emit("error", (err instanceof Error ? err.name : "error"), base);
  },
  scrub,
};

export type Logger = typeof logger;
