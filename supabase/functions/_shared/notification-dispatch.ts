// Shared server-side notification dispatch helpers.
//
// Entry points (all idempotent, none ever throw):
//
//   enqueueNotificationEvent()    — durable queue via `notification_enqueue_event` RPC.
//   dispatchNotificationEventNow()— direct invoke of `dispatch-notification-event`
//                                   with explicit internal service credentials so the
//                                   dispatcher's worker gate always accepts the call.
//   dispatchOrEnqueueNotification()— preferred entry point for business flows: tries the
//                                   direct dispatch, falls back to the durable queue, and
//                                   audits every attempt (success, fallback, failure).
//
// Notification side effects must never break business flows.

// deno-lint-ignore-file no-explicit-any

export interface EnqueueArgs {
  event_key: string;
  entity_type?: string | null;
  entity_id?: string | null;
  payload?: Record<string, unknown>;
  /** Extra discriminator folded into the idempotency key (e.g. recipient, state, window). */
  idempotency_suffix?: string | null;
  correlation_id?: string | null;
  reminder_window?: string | null;
}

export interface DispatchAuditContext {
  /** Function or module performing the dispatch, e.g. "perform-registration-workflow-action". */
  source: string;
  /** Acting user, when the dispatch happens on behalf of someone. */
  actor_id?: string | null;
}

/**
 * Headers that identify an internal edge-function-to-edge-function invocation.
 * Sent on every dispatch so the shared worker gate accepts the call regardless
 * of which Authorization header the installed supabase-js version attaches.
 */
export function internalInvokeHeaders(): Record<string, string> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const workerToken = Deno.env.get("WORKER_INVOKE_TOKEN") || "";
  const headers: Record<string, string> = {};
  if (serviceKey) {
    headers["Authorization"] = `Bearer ${serviceKey}`;
    headers["apikey"] = serviceKey;
    headers["x-internal-service-key"] = serviceKey;
  }
  if (workerToken) headers["x-worker-token"] = workerToken;
  return headers;
}

export async function enqueueNotificationEvent(admin: any, args: EnqueueArgs): Promise<boolean> {
  try {
    const { error } = await admin.rpc("notification_enqueue_event", {
      _event_key: args.event_key,
      _entity_type: args.entity_type ?? null,
      _entity_id: args.entity_id ?? null,
      _payload: args.payload ?? {},
      _idempotency_suffix: args.idempotency_suffix ?? null,
      _correlation_id: args.correlation_id ?? null,
      _reminder_window: args.reminder_window ?? null,
    });
    if (error) throw error;
    return true;
  } catch (e: any) {
    console.error("[notifications] enqueue failed", args.event_key, e?.message || e);
    return false;
  }
}

export async function dispatchNotificationEventNow(
  admin: any,
  args: EnqueueArgs,
): Promise<{ ok: boolean; error?: string; data?: any }> {
  try {
    const { data, error } = await admin.functions.invoke("dispatch-notification-event", {
      headers: internalInvokeHeaders(),
      body: {
        event_key: args.event_key,
        entity_type: args.entity_type ?? undefined,
        entity_id: args.entity_id ?? undefined,
        payload: {
          ...(args.payload ?? {}),
          _correlation_id: args.correlation_id ?? undefined,
          _idempotency_suffix: args.idempotency_suffix ?? undefined,
        },
        reminder_window: args.reminder_window ?? undefined,
      },
    });
    if (error) throw error;
    if (data && (data as any).error) {
      return { ok: false, error: String((data as any).error), data };
    }
    return { ok: true, data };
  } catch (e: any) {
    const message = e?.message || String(e);
    console.error("[notifications] direct dispatch failed", args.event_key, message);
    return { ok: false, error: message };
  }
}

async function auditDispatch(
  admin: any,
  args: EnqueueArgs,
  ctx: DispatchAuditContext,
  outcome: "dispatched" | "queued" | "failed",
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await admin.from("compliance_audit_logs").insert({
      user_id: ctx.actor_id ?? null,
      action_type: "NOTIFICATION_SENT",
      object_type: args.entity_type ? `notification:${args.entity_type}` : "notification",
      object_id: args.entity_id ?? null,
      after_value: {
        event_key: args.event_key,
        outcome,
        ...(detail ?? {}),
      },
      metadata: {
        source: ctx.source,
        event_key: args.event_key,
        outcome,
        idempotency_suffix: args.idempotency_suffix ?? null,
      },
    });
  } catch (e: any) {
    // Auditing must never break the flow.
    console.warn("[notifications] audit write failed", args.event_key, e?.message || e);
  }
}

/**
 * Dispatch a notification event with a guaranteed delivery path:
 * direct dispatch first, durable queue as fallback, audit row either way.
 * Returns the outcome so callers can log it; never throws.
 */
export async function dispatchOrEnqueueNotification(
  admin: any,
  args: EnqueueArgs,
  ctx: DispatchAuditContext,
): Promise<"dispatched" | "queued" | "failed"> {
  const direct = await dispatchNotificationEventNow(admin, args);
  if (direct.ok) {
    await auditDispatch(admin, args, ctx, "dispatched", {
      summary: direct.data ?? null,
    });
    return "dispatched";
  }

  const queued = await enqueueNotificationEvent(admin, args);
  const outcome = queued ? "queued" : "failed";
  await auditDispatch(admin, args, ctx, outcome, { direct_error: direct.error ?? null });
  if (!queued) {
    console.error(
      "[notifications] dispatch AND enqueue both failed",
      args.event_key,
      direct.error,
    );
  }
  return outcome;
}
