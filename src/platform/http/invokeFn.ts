/**
 * platform/http/invokeFn
 * ----------------------
 * Standard wrapper around `supabase.functions.invoke()` that:
 *   - Generates & propagates a correlation ID (header + body).
 *   - Normalises the response into an EFResult<T>.
 *   - Never throws for expected validation errors returned in-band.
 *   - Logs entry / exit / duration via platform/logger.
 *
 * Edge Function contract (see docs/15_ERROR_HANDLING.md):
 *   { ok: true, data }                 → success
 *   { ok: false, error: { code, message, details? } } → validation / business error
 * Anything else is treated as RemoteServiceError.
 */
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/platform/logger";
import {
  RemoteServiceError,
  toAppError,
  type AppError,
} from "@/platform/errors";
import { CORRELATION_HEADER, newCorrelationId } from "./correlation";

export type EFResult<T> =
  | { ok: true; data: T; correlationId: string }
  | { ok: false; error: AppError; correlationId: string };

export interface InvokeFnOptions {
  correlationId?: string;
  headers?: Record<string, string>;
  /** Attach `correlation_id` into the JSON body (default true). */
  injectCorrelationInBody?: boolean;
}

export async function invokeFn<TRes = unknown, TReq = unknown>(
  name: string,
  body?: TReq,
  opts: InvokeFnOptions = {},
): Promise<EFResult<TRes>> {
  const correlationId = opts.correlationId ?? newCorrelationId();
  const started = Date.now();

  const finalBody =
    opts.injectCorrelationInBody === false || body == null
      ? body
      : { ...(body as Record<string, unknown>), correlation_id: correlationId };

  logger.debug("ef.invoke.start", { fn: name, correlationId });

  try {
    const { data, error } = await supabase.functions.invoke(name, {
      body: finalBody as any,
      headers: { [CORRELATION_HEADER]: correlationId, ...(opts.headers ?? {}) },
    });

    const duration = Date.now() - started;

    if (error) {
      const appErr = new RemoteServiceError(error.message || `Edge function ${name} failed`, {
        code: "REMOTE_SERVICE_ERROR",
        correlationId,
        details: error,
      });
      logger.error(appErr, { fn: name, correlationId, duration });
      return { ok: false, error: appErr, correlationId };
    }

    // Standard contract: { ok, data | error }
    if (data && typeof data === "object" && "ok" in (data as any)) {
      const payload = data as { ok: boolean; data?: TRes; error?: { code?: string; message?: string; details?: unknown } };
      if (payload.ok) {
        logger.debug("ef.invoke.ok", { fn: name, correlationId, duration });
        return { ok: true, data: payload.data as TRes, correlationId };
      }
      const appErr = toAppError(new RemoteServiceError(payload.error?.message ?? "Edge function error", {
        code: payload.error?.code ?? "REMOTE_SERVICE_ERROR",
        correlationId,
        details: payload.error?.details,
      }));
      logger.warn("ef.invoke.error", { fn: name, correlationId, duration, code: appErr.code });
      return { ok: false, error: appErr, correlationId };
    }

    // Legacy functions returning raw JSON — treat as success payload.
    logger.debug("ef.invoke.legacy_ok", { fn: name, correlationId, duration });
    return { ok: true, data: data as TRes, correlationId };
  } catch (e) {
    const appErr = toAppError(e, { correlationId, code: "REMOTE_SERVICE_ERROR" });
    logger.error(appErr, { fn: name, correlationId });
    return { ok: false, error: appErr, correlationId };
  }
}

export { newCorrelationId, CORRELATION_HEADER };
