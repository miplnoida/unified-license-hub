# Saint Lucia FSRA — Live Action & Fallback Rehearsal Register

HEAD `6919e2384a1332e06b810dcb3fdda998b4c4722f`. Read-only certification, 2026-08-31.
Every action below uses existing governed functionality; none weakens RLS or bypasses authority.

## Safe live actions (rehearsed, reversible or additive-only)

| # | Action | Where | Why it is safe | Expected result |
|---|---|---|---|---|
| A1 | Acknowledge one prudential threshold exception | Breach Inbox → row → Acknowledge, with rationale | Governed acknowledgement path certified in F8-W1C; writes actor, timestamp, rationale; duplicate acknowledgement is rejected | Row moves to acknowledged; open count 47 → 46; audit event written to both audit surfaces |
| A2 | Show the resulting audit entry | Audit trail for the acknowledged breach | Canonical `prudential_audit_event` dual-surface write | Actor, object, event, timestamp visible |
| A3 | Open `PA-2026-0001` and add a progress update | Prudential actions | Existing lifecycle transition; does not close the action | Update recorded with actor/time |
| A4 | Show `PA-2026-0002` closure evidence | Prudential actions | Read-only | Completed action with closure record |
| A5 | Generate an AI advisory analysis | Executive Dashboard AI panel | Advisory-only; writes only to advisory tables; "Nothing is saved to any record" | Live model output with provider, model, confidence, evidence, `review_status = pending` |
| A6 | Record human feedback on the AI output | AI panel 👍 / 👎 / flag | Stores `feedback_by`, `feedback_at`; no canonical mutation | Human decision recorded against the advisory item |
| A7 | Show configured thresholds under Prudential governance | `/admin/returns/prudential/thresholds` | Read-only; governance owner is `prudential_supervision` (F8-W1D) | Warn/breach values and comparators |
| A8 | Sign in as a non-privileged persona to show isolation | `applicant_user@mishainfotech.com` or `entity_ppoc@mishainfotech.com` | RLS/permission enforcement, no change | Supervisory screens and other entities' data not visible |
| A9 | Send a correspondence message | Correspondence screen | Resend primary with SMTP fallback; additive | Message queued/sent, delivery state visible |

## Actions to avoid live

| Action | Reason |
|---|---|
| Recomputing or displaying an entity risk band | No Saint Lucia entity is scored and every band is `low` (D1) |
| Opening the UBO tab | Returns `CONFIGURATION_REQUIRED` (D2) |
| Opening an examination "for our entity" | All examinations belong to non-demo entities (D4) |
| Opening the supervisory attention queue or stress events | Both are empty (D6) |
| Reading aloud the Breach Inbox "Critical / High" tile | Dead filter, always 0 (D8) |
| Opening APP-2026-000148 or APP-2026-000159 payment history | Legacy USD amounts (D7) |
| Claiming the AI stop control halts model execution | `is_engaged` is recorded but not enforced in code (D3) |

## Fallback screen for every critical section

| Section | Primary screen | Fallback if it misbehaves |
|---|---|---|
| Entity overview | Entity 360 for Coral Harbour | Licensee register list filtered to Saint Lucia entities |
| Returns & ratios | Prudential entity profile Q3 | Filing detail with stored metric values (irrefutable source) |
| Threshold governance | `/admin/returns/prudential/thresholds` | Read the four configured thresholds from the ratios screen |
| Breach oversight | Breach Inbox | Entity 360 breach tab (correctly separates counts) or the entity history drawer (correctly labels breach vs warning) |
| Supervisory action | `PA-2026-0001` detail | `PA-2026-0002` completed action with closure evidence |
| Ownership / group | Ownership network for Hewanorra Nexus | Piton group structure (Credit Union → 100% / 75%) |
| Risk-based supervision | *no certified screen* | Narrate the ratio→threshold→breach→action chain as the risk-based mechanism |
| AI capability | Executive AI advisory panel | `/governance/ai` overview with the human-decision legend and 25 governance events |
| Audit | Breach audit trail | Portfolio audit log volume (9,503 / 27,909) |
| Communication | Correspondence screen | Notification centre (7,413 notifications) |
| Returns portfolio | `/admin/returns` summary cards | `returns_supervisory_summary()` figures quoted verbally |
