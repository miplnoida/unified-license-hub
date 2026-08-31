# Saint Lucia FSRA — Today-Demo Data Integrity Audit & Remediation

Date: 2026-08-31 · Environment: non-production (`is_production_environment() = false`) · Migrations: 1327
Demo marker: `SAINT-LUCIA-FSRA-DEMO` · Manifest: `scripts/demo/st-lucia-fsra-demo-manifest.json`

## Discrepancy register

| Ref | Severity | Finding | Disposition |
|---|---|---|---|
| D-01 | **P0** | Nine regulated demo entities were `licensees.status = 'active'` but had **no row in `public.entity_licenses`** — the only canonical authority for entity↔licence relationships. The licence-holder register therefore showed "active" firms with a `—` licence number. Piton Finance Services Ltd was the reported symptom. | **Remediated** (data + seed + gates) |
| D-02 | **P0** | `src/pages/admin/ManageLicensees.tsx` derived licence identity from the **deprecated `licensees.license_id`** and presented `licensees.status` as licence status. | **Remediated** (screen rewritten onto `entity_licenses`) |
| D-03 | P3 | Complaint `CMP-2026-000103` has `complaints.licensee_id = NULL` and its primary respondent (“QuickCash Loans Online”) has `licensee_id = NULL`, `match_state = SUSPECTED_UNAUTHORISED`. | **Not a defect — no change.** This is an unauthorised-business complaint; attaching a licensee would falsify the record. |
| D-04 | P3 | Second respondent on `CMP-2026-000103` is an `INTERMEDIARY` (`respondent_role = broker`, `agent_name = 'A. Broker'`, `information_source = consumer_declared`) with no legal name. | **Not a defect — no change.** Consumer-declared intermediary; sparse by nature. |
| D-05 | P2 | Castries Remittance Services has overlapping temporal ownership edges summing to 170% because of a future-dated pending acquisition. | Carried forward — deliberate demonstration of temporal ownership, not corrected. |
| D-06 | P2 | Seeded Coral Harbour breach `5c300011` lacks `detection_run_id` so it is excluded from `v_prudential_current_breaches`, while the canonical engine produced its own 2025-Q3 detection (`ef370b75`). | Carried forward — append-only detection evidence; the engine-produced row is the one shown. |

## Remediation applied

Canonical licences (`FSRA-SLU-2023-0001` … `-0009`, type mirroring the manifest sector wording, issued 2023-01-15, valid to 2027-12-31) created for the nine regulated demo entities and attached through `public.entity_licenses` with `is_primary = true`. `licensees.license_id` was **not** written. Term creation was left to the existing `trg_license_open_original_term` trigger — verified as exactly one current original term per licence.

**Piton Property Holdings Ltd (`5c1a0010…`) deliberately holds no licence** (non-financial group member, excluded from consolidation). It now also proves the "Not licensed" presentation path.

Seed parity: the same logic is idempotent in `scripts/demo/seed-st-lucia-fsra-demo.sql`, with collision guards that refuse to guess if a licence number is already used elsewhere, and an assertion that the non-financial member never acquires a licence.

Screen change (`ManageLicensees.tsx`): one row per **canonical licence attachment** (multi-licence entities appear once per licence); licence status read from `licenses.status`; entities with no current attachment render a neutral **Not licensed** badge and never a licence status; expired attachments (`effective_to < now()`) and orphan attachments are excluded; stat cards now report Licence Records / Active Licences / Not Licensed.

## Verification

`scripts/verify-st-lucia-demo.sql` extended with gates **G22–G29** (rollback-scoped, creates nothing):
one current canonical licence per regulated demo entity; none for the non-financial member; Piton Finance resolvable end to end; attachment agrees with `licenses.holder_id`; exactly one current term per demo licence; no duplicate licence numbers register-wide; no orphan attachments; entity DTO surfaces the licence.

G22–G28 executed against the live demo database: **all pass**. G29 asserts the DTO and runs under the script's own role.

Browser evidence: licence register shows `FSRA-SLU-2023-0009` for Piton Finance and `Not licensed` for the non-financial member; Entity 360 shows the licence. Typecheck and build clean.

## Verdict

**DEMO READY for the licence narrative**, with one caveat: the Entity Directory list search did not filter on "Piton Finance" during this check (the list is paginated and returned the alphabetical first page), so the directory quick-record view was confirmed only through the canonical DTO and Entity 360, not by clicking through the directory search. That search behaviour is a presentation concern outside this remediation and is **not** a licence-data defect.
