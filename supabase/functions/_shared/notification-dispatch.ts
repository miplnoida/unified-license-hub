// Shared server-side notification dispatch helpers.
//
// Two entry points, both idempotent:
//
//   enqueueNotificationEvent()  — writes to public.notification_event_queue via the
//     `notification_enqueue_event` RPC. Preferred inside/after a business transaction:
//     the queue row is durable and the queue worker performs the actual dispatch, so a
//     delivery failure can never roll back a completed regulatory decision.
//
//   dispatchNotificationEventNow() — invokes the shared `dispatch-notification-event`
//     function directly. Used by the queue worker itself and by sweeps that already run
//     out-of-band.
//
// Never throws: notification side effects must not break business flows.

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

export async function dispatchNotificationEventNow(admin: any, args: EnqueueArgs): Promise<boolean> {
  try {
    const { error } = await admin.functions.invoke("dispatch-notification-event", {
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
    return true;
  } catch (e: any) {
    console.error("[notifications] direct dispatch failed", args.event_key, e?.message || e);
    return false;
  }
}
