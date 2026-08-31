# Saint Lucia FSRA — Demo Screen / Value Matrix

HEAD `6919e2384a1332e06b810dcb3fdda998b4c4722f`. Values verified read-only against the live
certification database on 2026-08-31. Presenter should expect exactly these figures.

| # | Screen | URL | Expected on-screen values | Certified |
|---|---|---|---|---|
| 1 | Dashboard (view switcher) | `/dashboard` | Tabs: Supervisory, Executive, Administration (super admin / bypass roles) | YES |
| 2 | Executive Dashboard | `/analytics/executive` | "Open Breaches" 47 (**say: 9 breaches + 38 early warnings**); applications open 5; complaints open 5; supervisory actions 20; enforcement actions 6; examinations 13 | YES, with wording caveat |
| 3 | Breach Inbox | prudential breach inbox route | 47 open, 0 acknowledged, 0 escalated; "Critical / High" tile shows 0 (dead filter — do not read aloud) | YES, with caveat |
| 4 | Alert Center | `/analytics/alerts` | Prudential rows titled "Breach: <metric>" including warn rows — describe as "threshold exceptions" | PARTIAL |
| 5 | Entity 360 — Coral Harbour | entity profile for `5855bf85-9fde-4cf8-a082-7ea904d46184` | current_breach_count and unacknowledged_breach_count shown separately; XCD amounts | YES |
| 6 | Prudential ratios — Coral Harbour Q3 | prudential entity profile, Q3 2025 | CAR 12.5% (compliant, warn 12 / breach 10); Liquidity 14.5% (**breach**, floor 15); NPL 5.8% (warning, warn 5); Cost/income 74% (warning, warn 65) | YES |
| 7 | Filing detail | filing `CV2-E02-2025-Q3`, version `5568551b-5574-48b8-aa9a-5f1ac283751f` | Status ACCEPTED, accepted 2025-11-11 09:30 UTC, currency XCD, currency source REGULATOR_BASE | YES |
| 8 | Filing inputs | accepted version metrics | Total capital XCD 150,000,000; RWA XCD 1,200,000,000; liquid assets XCD 87,000,000; short-term liabilities XCD 600,000,000; NPL XCD 55,680,000; gross loans XCD 960,000,000; opex XCD 44,400,000; NII XCD 60,000,000 | YES |
| 9 | Returns administration | `/admin/returns` | Total 93, submitted 93, accepted 90, pending review 3, overdue 2, SLA breached 1 | YES |
| 10 | Prudential thresholds config | `/admin/returns/prudential/thresholds` | CAR 12/10 `>=`; Liquidity 20/15 `>=`; NPL 5/10 `<=`; Cost/income 65/75 `<=`; governed by `prudential_supervision` | YES |
| 11 | Prudential actions | prudential actions list | `PA-2026-0001` in_progress, due 2026-04-30; `PA-2026-0002` completed, due 2026-03-31 | YES |
| 12 | Ownership / group structure | entity structure for Hewanorra Nexus Digital Finance Ltd (`7a7bdc05-abdc-41b9-9b6b-a46c283c6ac7` family) | Direct: Nexus Caribbean Holdings 60%, Daniel Mercer 25%, Alicia Joseph 15%; upper tier Alicia 65% / Daniel 35%; derived effective 54% / 46% | YES |
| 13 | UBO panel | same entity, UBO tab | **`CONFIGURATION_REQUIRED` — UBO_POLICY_NOT_CONFIGURED** | NO — blocker D2 |
| 14 | Risk-based supervision | risk scoring / portfolio risk view | 19 scored entities, all band `low`, all components 0; **no Saint Lucia entity scored** | NO — blocker D1 |
| 15 | Examinations | examinations list | 13 examinations, all on Meridian Commercial Bank / Windward Trust Bank | NO for demo entity — D4 |
| 16 | Complaints | complaint `CMP-2026-000103` | submitted, medium severity, no entity linkage, 2 respondents without licensee link | PARTIAL — D5 |
| 17 | AI advisory panel (Executive) | `/analytics/executive` AI panel | provider `lovable-ai-gateway`, model `google/gemini-3.5-flash`, confidence 0.3, provider_state `INSUFFICIENT_DATA`, evidence-cited observations, "Nothing is saved to any record" | YES |
| 18 | AI governance overview | `/governance/ai` | Advisory-only statement, Fact / Rule outcome / AI suggestion / Human decision legend, stop controls, 25 governance events | YES — do not claim the stop control halts execution |
| 19 | Audit trail | audit views | `audit_logs` 9,503; `compliance_audit_logs` 27,909; dual-surface via `prudential_audit_event` | YES |
| 20 | Notifications / correspondence | notifications and correspondence screens | 7,413 notifications; 20 correspondence messages; Resend primary with SMTP fallback | YES |
| 21 | Payments / fees | payment history | 10 completed XCD payments (XCD 10,000); **2 legacy USD payments (25,000 and 112.00)** exist on APP-2026-000148 / APP-2026-000159 — avoid these two applications | PARTIAL — D7 |
| 22 | Stress indicators | prudential stress view | 13 indicators configured, **0 events** | NO — D6 |
| 23 | Supervisory attention | conduct attention queue | **0 items** | NO — D6 |
| 24 | Fitness & propriety | F&P list | 36 assessments (34 determined), none linked to a Saint Lucia licensee | PARTIAL — D4 |
