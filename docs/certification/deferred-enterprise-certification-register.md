# Deferred Enterprise Certification Register

Implementation is complete for the items below; what remains is **live end-to-end certification**
(executing full scenarios against seeded data and capturing evidence). Nothing here is a known defect.

## P04 — Licence Lifecycle (Phase A)

| Ref | Deferred certification scenario | Why deferred | Prerequisite |
| --- | --- | --- | --- |
| A.9–A.11 | Full suspension → representations → decision → reinstatement run on a live certification licence, with notice and decision artefacts captured | Needs maker/checker actors provisioned in the certification environment | Two internal certification users with distinct decision authority |
| A.12 | Surrender with outstanding obligations blocked, then permitted after obligations cleared | Requires a seeded licence carrying open obligations and fees | Certification obligation fixtures |
| A.13 | Expiry sweep executed on a clock-advanced certification licence (automatic vs officer-confirmed) | Requires scheduled service-role invocation in the certification environment | Scheduler enabled for `license-expiry-sweep` |
| A.15–A.17 | Fee assessment → payment verification → gate release across renewal, variation and reinstatement | Production fee amounts are deliberately not seeded; only CERTIFICATION-purpose configuration is active | Regulator-approved fee schedule |
| A.18 | Verification case completion gating a renewal decision end to end | Only one active CERTIFICATION verification template is seeded | Verification checklist sign-off |
| A.19–A.20 | Activation and version pinning of the seeded Registration / Application / Renewal process templates | Templates are intentionally seeded inactive to avoid changing live behaviour | Business approval to activate |
| A.23–A.24 | Related-cases and correspondence surfaces populated by a full multi-process certification run | Depends on the scenarios above producing linked records | Above scenarios executed |

## P08 — Conduct & Complaints (closure delta)

| Ref | Deferred certification scenario | Why deferred | Prerequisite |
| --- | --- | --- | --- |
| P08.32 | Complaint → investigation → finding → remediation → enforcement chain rendered end to end in Related Cases on both the complaint and the investigation workspace | Needs a full seeded conduct chain across five modules | Conduct certification fixtures |
| P08.33 | Redirect of retired `/conduct/entities/:id` bookmarks verified against a live entity with conduct history | Requires seeded conduct history on a certification entity | Conduct certification fixtures |

## P12 — Correspondence & RFI (Phase C)

| Ref | Deferred certification scenario | Why deferred | Prerequisite |
| --- | --- | --- | --- |
| P12.1 | Inbound capture → classification → assignment → response → closure executed on the canonical work queue with bucket counts reconciled against the database | Needs seeded inbound correspondence across channels | Correspondence certification fixtures |
| P12.2 | SLA warning → breach transition observed live (queue bucket, case header state and waiting-on flip together) | Requires clock advancement plus the SLA sweep scheduled in the certification environment | Scheduler enabled for correspondence SLA sweep |
| P12.3 | Delivery evidence (sent → delivered → opened → bounced) captured from a real provider webhook | Requires a live email/SMS provider in the certification environment | Provider credentials provisioned |
| P12.4 | Entity-side and regulator-side views of the same thread proven to agree on state, service level and waiting-on, with internal notes invisible to the entity | Needs paired internal and entity certification users | Two certification users (internal + entity primary) |
| P12.5 | RFI links on the thread workspace populated by a live complaint and application RFI cycle | Depends on RFI scenarios being executed | RFI certification fixtures |

## Governance

- No runtime defaults were hardcoded to work around missing configuration; unresolved configuration
  surfaces as "no applicable configuration" in the resolvers and simulators.
- Authoritative browser DML remains zero for licence lifecycle objects: all mutations pass through
  `license_lifecycle_step` / governed RPCs. The same holds for correspondence and conduct: the browser
  reads `correspondence_work_queue`, `correspondence_thread_case` and `conduct_related_cases` and
  mutates only through governed RPCs — direct DML on the correspondence business tables is revoked for
  `authenticated`.
