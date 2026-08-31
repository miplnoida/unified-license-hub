# Saint Lucia FSRA — Prepared Record Readiness Register

HEAD `6919e2384a1332e06b810dcb3fdda998b4c4722f`. Read-only verification, 2026-08-31.

## Entities

| Entity | ID | Ready |
|---|---|---|
| Coral Harbour Bank Limited | `5855bf85-9fde-4cf8-a082-7ea904d46184` | YES — primary demo entity |
| Gros Piton Life Assurance Ltd | `7a7bdc05-abdc-41b9-9b6b-a46c283c6ac7` | YES |
| Pitons International Bank | `8dd11aef-350c-4328-bd0d-86b6d8114975` | YES |
| Piton Community Credit Union Ltd | `5c1a0002-0000-4000-8000-000000000002` | YES — group parent (100% Piton Finance, 75% Piton Property) |
| Coral Corporate & Fiduciary Services | `5c1a0003-0000-4000-8000-000000000003` | YES |
| Piton Finance Services Ltd | `5c1a0009-0000-4000-8000-000000000009` | YES |
| Piton Property Holdings Ltd | `5c1a0010-0000-4000-8000-000000000010` | YES |
| Hewanorra Nexus Digital Finance Ltd | ownership-demo entity | YES — the 54/46 derivation entity |
| Castries Remittance Services Ltd | ownership-demo entity | YES — 70/30 + superseded 50/20 history |

Regulator: Saint Lucia Financial Services Regulatory Authority `8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3`.

## Returns and ratios

| Record | Identifier | State | Ready |
|---|---|---|---|
| Accepted Q3 filing | `CV2-E02-2025-Q3` | ACCEPTED 2025-11-11 09:30 UTC | YES |
| Accepted version | `5568551b-5574-48b8-aa9a-5f1ac283751f` | canonical metric source | YES |
| Filing record | `e124d2dc-f08c-4b17-a92f-0db411a8b985` | XCD, REGULATOR_BASE | YES |
| Metric values | 12 metrics on accepted version | complete | YES |
| Portfolio filings | 93 filings, all XCD | 90 accepted, 3 pending review, 2 overdue, 1 SLA breached | YES |

## Prudential exceptions and actions

| Record | State | Ready |
|---|---|---|
| `v_prudential_current_breaches` | 47 rows = 9 `breach` + 38 `warn`, all unacknowledged, 3 entities | YES (label carefully) |
| `return_threshold_breaches` (raw) | 85 rows — includes superseded history; not a screen source | N/A |
| `PA-2026-0001` | in_progress — liquidity remediation, Coral Harbour, due 2026-04-30 | YES |
| `PA-2026-0002` | completed — NPL explanation, Coral Harbour, due 2026-03-31, closure evidence | YES |
| `prudential_stress_indicators` | 13 configured | YES |
| `prudential_stress_events` | 0 | NO |

## Ownership

| Record | Value | Ready |
|---|---|---|
| Hewanorra Nexus direct interests | Nexus Caribbean Holdings 60%, Daniel Mercer 25%, Alicia Joseph 15% (all VERIFIED / APPROVED) | YES |
| Nexus Caribbean Holdings upper tier | Alicia Joseph 65%, Daniel Mercer 35% | YES |
| Derived effective ownership | Alicia 54%, Daniel 46% | YES |
| Castries Remittance | Lucia Payments Holdings 70%, Andre Paul 30% current; 50%/20% NOT_ASSESSED rows present | YES (history story) |
| Piton group | Credit Union → Piton Finance 100%, Piton Property 75% | YES |
| `ubo_policies` | **empty** — UBO resolution returns CONFIGURATION_REQUIRED | NO |

## Casework

| Record | State | Ready |
|---|---|---|
| Complaint `CMP-2026-000103` | submitted, medium, `licensee_id` NULL, 2 respondents with NULL licensee | PARTIAL |
| Complaints total | 16, 5 open | YES (portfolio numbers only) |
| Applications | 5 open, 7 closed, 5 SLA-breached, 5 unassigned, 2 awaiting triage, 3 under review | YES |
| Examinations | 13, none on a Saint Lucia entity | NO for entity-level story |
| F&P assessments | 36 (34 determined, 1 screening, 1 draft), none linked to a Saint Lucia licensee | PARTIAL |
| `conduct_attention_items` | 0 | NO |
| `supervisory_plans` | 2 | YES (thin) |

## Intelligence, audit, communication

| Record | State | Ready |
|---|---|---|
| `ai_insights` | 18, provider `lovable-ai-gateway`, model `google/gemini-3.5-flash`, `review_status = pending` | YES |
| `ai_governance_events` | 25 | YES |
| `audit_logs` / `compliance_audit_logs` | 9,503 / 27,909 | YES |
| `notifications` | 7,413 | YES |
| `correspondence_messages` | 20 | YES |
| Email delivery | Resend primary, SMTP fallback | YES |

## Personas

`cert_certification_users` provides paired officer/supervisor personas at `@mishainfotech.com`,
including `executive_management`, `fit_proper_officer` / `_supervisor`, `complaints_officer` /
`_supervisor`, `enforcement_officer` / `_supervisor`, `inspector` / `inspection_supervisor`,
`conduct_analyst` / `conduct_supervisor`, `aml_supervision_officer` / `_supervisor`,
`correspondence_officer`, `legal_counsel`, `auditor`, `committee_member`, `appeals_panel_member`,
`applicant_user`, `entity_ppoc`. Use the super admin account for the main journey and one
non-privileged persona (e.g. `applicant_user` or `entity_ppoc`) to demonstrate isolation.
