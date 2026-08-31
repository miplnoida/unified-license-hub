# Saint Lucia FSRA — Demo Record Readiness Register

HEAD `687a4b892b0752a4448efdf64fff2b1be3f94c0d`, 2026-08-31. Read-only verification.

## Entities available (Saint Lucia demo set)

| Entity | ID |
|---|---|
| Coral Harbour Bank Limited | `5855bf85-9fde-4cf8-a082-7ea904d46184` |
| Hewanorra Nexus Digital Finance Ltd | `5c1a0001-0000-4000-8000-000000000001` |
| Piton Community Credit Union Ltd | `5c1a0002-0000-4000-8000-000000000002` |
| Coral Corporate & Fiduciary Services Ltd | `5c1a0003-0000-4000-8000-000000000003` |
| Gros Piton Life Assurance Ltd | `7a7bdc05-abdc-41b9-9b6b-a46c283c6ac7` |
| Pitons International Bank (Class A) Ltd | `8dd11aef-350c-4328-bd0d-86b6d8114975` |
| Piton Finance Services Ltd | `5c1a0009-0000-4000-8000-000000000009` |
| Piton Property Holdings Ltd | `5c1a0010-0000-4000-8000-000000000010` |

## Required records

| Scripted record | Exists | State observed | Ready |
|---|---|---|---|
| In-progress licensing application | partly | 5 `submitted` applications, all `VRF-RS-*` certification fixtures, none on a demo entity | NO (D15) |
| Approved application + resulting authorisation | yes | `APP-2026-000148`, `APP-2026-000159` (approved) — both hold legacy USD payments | CAVEAT (D7) |
| Entity 360 with meaningful data across seven supervisory areas | yes | Coral Harbour populated (returns, ratios, breaches, actions, ownership, correspondence, audit) | YES |
| Ownership example Alicia Joseph 54% / Daniel Mercer 46% | yes | derived by the ownership network from recorded interests; visible in the new runtime tree diagram on Hewanorra Nexus `5c1a0001-…0001` | YES |
| Fit & Proper case with current step, blockers, determination | no | `fp_assessments` linked to demo entities = 0 | NO (D4) |
| Coral Harbour accepted 2025-Q3 filing | yes | filing `CV2-E02-2025-Q3`, accepted immutable version `5568551b-5574-48b8-aa9a-5f1ac283751f`, XCD | YES |
| PA-2026-0001 open liquidity remediation | yes | status `in_progress` (an open state under the shared predicate), title cites 2025-Q3 liquidity 14.5% | YES |
| PA-2026-0002 closed action with closure evidence | yes | status `completed`, completion notes record ageing/provisioning assessment | YES |
| Prepared examination | no | 0 examinations on any demo entity | NO (D4) |
| CMP-2026-000103 | yes | status `submitted`, `licensee_id` NULL, respondents unlinked | CAVEAT (D12) |
| Supervisory Attention item + linked plan | no | `conduct_attention_items` = 0 | NO (D6) |
| Officer My Work items | yes | canonical queues populate | YES |
| AI governance examples | partly | 18 insights, 25 governance events, 15 attempts, 3 kill switches; **no** accepted/modified/rejected insight action | CAVEAT (D18) |
| Saint Lucia risk score / HIGH band result | no | all 19 current scores are band `low` | NO (D1) |
| UBO policy configuration | no | `ubo_policies` empty → `entity_ubo_resolve` returns `CONFIGURATION_REQUIRED` | NO (D2) |

## Noise visible on demo surfaces

- `PA-2026-000012` on Coral Harbour is titled `probe` (leftover test action) and will appear in
  the action ledger during the demonstration (D17).
- `PA-2026-0001-R` / `PA-2026-0002-R` are explicitly titled “[Superseded record retained on
  file]”, which is correct append-only behaviour and safe to explain.
