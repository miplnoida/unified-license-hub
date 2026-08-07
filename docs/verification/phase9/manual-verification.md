# Phase 9 — Communication Registry: Manual Verification Pack

Scope: FRD NOT-* residuals implemented in Phase 9 — canonical communication
states, truthful provider reporting, dead-letter operations, template snapshot
retention, and per-record communication timelines.

Automated coverage:

- `supabase/tests/notifications/10_communication_registry.sql` — state derivation units
- `supabase/tests/phase9/01_communication_lifecycle.sql` — real row lifecycle through the trigger
- `supabase/tests/phase9/02_timeline_rls_personas.sql` — 6-persona authorization matrix

Run all of them with `supabase test db`.

---

## V1 — Provider handoff is never reported as delivery

1. Sign in as an internal licensing officer.
2. Trigger any notification event (e.g. submit a test application).
3. Open the record's **Communications** timeline.

Expected: the entry shows **Sent to provider**, not "Delivered".
"Delivered" appears only after the provider posts a delivery callback
(`delivered_at` populated). No timestamp is invented.

## V2 — Missing provider configuration is stated truthfully

1. Ensure the SMS provider is not configured.
2. Trigger an event with an SMS recipient.

Expected: the timeline entry reads **Provider not configured** with failure
category `not_configured`. It must not read Sent, Delivered, or a generic error.

## V3 — Retry then dead letter

1. Force a transient failure (invalid SMTP host).
2. Observe the entry: state **Retrying**, with a next attempt time.
3. Let retries exhaust (or set retry count past the ceiling).

Expected: the entry becomes **Dead letter**. The row is retained — nothing is
deleted — and it appears in the Dead Letter queue in the Notifications admin.

## V4 — Dead-letter operator queue

1. Go to Admin → Notifications → Dead Letters.

Expected: both dead-lettered and provider-not-configured communications are
listed with module, event, recipient, failure category, error, attempts, and the
parent record link. Delivered messages never appear here.

## V5 — Template snapshot retention

1. Open a communication that was sent, note its template version.
2. Edit and publish a new version of that template.
3. Re-open the historical communication.

Expected: the historical entry still shows the **original** template version and
the rendered body captured at send time. Historic evidence never re-renders.

## V6 — Timeline authorization (must all deny)

Using the record id of an application that belongs to another applicant:

1. As an unrelated external applicant → access denied (error, no rows).
2. As an authenticated internal user with no module permissions → denied.
3. Signed out → denied.
4. As the owning applicant → sees only their own record's communications.
5. As a licensing officer with `licensing.view` → sees the history.
6. As a super admin → sees the history.

Expected: denials raise an insufficient-privilege error and return zero rows.
A leaked record id alone grants nothing.

## V7 — Cross-record and cross-type isolation

1. Call the timeline for a complaint using an application's id.

Expected: denied. Object type and object id must both match; communication
histories cannot be read across record types.

## V8 — Correlation and module tagging

1. Inspect any communication entry.

Expected: `module` is set (licensing, complaints, prudential, conduct, …) and the
correlation id is preserved across every state transition, so a single
communication can be traced from queue to final state.
