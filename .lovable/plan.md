# Phase 3 — Exercise every wired event and remove duplicate frontend emission

Scope: In-App + Email only. SMS excluded from work, tests and percentages.

## Verified state (queried live this turn)

| Measure | Value |
| --- | --- |
| Active event configurations | 212 |
| Active events with no queue or dispatch row ever | 156 |
| Frontend files still calling `dispatchNotificationEvent` | 13 |

The 156 unexercised events cluster by module: registration 14, system health 11, licensing 9, returns 9, prudential 8, license lifecycle 8, F&P 7, communications 7, conduct 7, reporting 6, application 6, administration 6, enforcement 5, complaints 4, plus smaller groups (compliance, payment, entity, SLA, correspondence, regulator, single-key legacy modules).

Phase 2 installed the backend triggers and sweeps. Phase 3 proves them by executing the owning business transaction, and removes the frontend emissions that now duplicate backend triggers.

## Step 1 — Deduplicate emission

For each of the 13 frontend call sites, check whether Phase 2 wired the same event key at the backend transaction boundary:

- Backend trigger exists → delete the frontend `dispatchNotificationEvent` call (keeps single-emission and dedupe guarantees).
- No backend trigger and the action is a pure client-initiated RPC → move the emission into the owning RPC/edge function rather than leaving it in the component.

Call sites in scope: `useLicenseAppeals`, `useFormTemplates`, `useCollabReview`, `useMarketConduct`, `usePrudentialSupervision`, `slaNotifications`, `RaiseRfiDialog`, `ApplicationRfiTab`, `ResponseComposer`, `MyCorrespondenceDetail`, `IssueActionDialog`, `LicenseDetail`.

`src/lib/notificationEvents.ts` stays only for genuinely client-owned events; if none remain it is deleted.

## Step 2 — Execute the events, module by module

For each module a scripted exercise runs the real transaction (RPC, trigger-firing write, or sweep invocation) against seeded fixtures — never a manual insert into `notification_event_queue` or `notifications`.

Order: registration → licensing/licence lifecycle → returns/compliance → complaints/conduct → F&P → prudential → enforcement → correspondence → escalation/system health → reporting/administration/payment/entity/SLA/regulator.

Each exercise records, per event key: actor and role, transaction result, queue row ID, notification row IDs, email dispatch row IDs, resolved recipients, template ID and version, `used_fallback_template`, correlation ID, source route, audit row ID, expected vs actual, pass/fail.

## Step 3 — Classify what cannot be exercised

An event that has no reachable business action in the approved scope is deactivated with a recorded reason and audit row, and excluded from the active-compliance maths. No event is left active-but-unprovable.

## Step 4 — Assert the invariants on every exercised event

- Recipients resolve to at least one addressable user, or the emission records a deliberate no-recipient outcome.
- Preferences applied: Critical/High stay immediate and in-app, mandatory events cannot be muted.
- Rendering uses a published immutable snapshot; `used_fallback_template` is false and no unresolved placeholders remain.
- Email row lands in a valid delivery state; in-app row carries category, severity, source entity and safe source route.
- An append-only audit row exists with actor, correlation ID and outcome.

## Step 5 — Deliverables

- `docs/verification/notifications/21_trigger_matrix.md` / `.csv` — regenerated from `scripts/notification-trigger-scan.mjs`, with zero frontend-only call sites for backend-owned events.
- `docs/verification/notifications/23_e2e_results.md` / `.csv` — one row per exercised event with the evidence fields above.
- `docs/verification/notifications/20_current_baseline.md` / `.csv` — re-measured after the exercises.
- Vitest/pgTAP additions for the frontend-dedup regression (no component emits notification events) and for the exercised trigger set.

## Technical notes

- Sweeps are invoked through their real scheduled functions so the `pg_cron` path itself is proven, not bypassed.
- Fixtures are created through public RPCs under the correct persona so RLS is exercised on the way in.
- One unresolved-placeholder dispatch row and the 788 pre-snapshot legacy rows stay flagged as legacy in the baseline; they are not counted as fallback rendering.
- Phase 3 does not change Notification Centre UI, preferences UI or the email state machine — those are Phases 8–9.
