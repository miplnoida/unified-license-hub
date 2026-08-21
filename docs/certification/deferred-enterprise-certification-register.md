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

## Governance

- No runtime defaults were hardcoded to work around missing configuration; unresolved configuration
  surfaces as "no applicable configuration" in the resolvers and simulators.
- Authoritative browser DML remains zero for licence lifecycle objects: all mutations pass through
  `license_lifecycle_step` / governed RPCs.
