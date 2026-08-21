# Production Readiness Matrix

**Companion to:** `docs/certification/final-brd-frd-certification.md`
**Verdict key:** READY · READY-WITH-CONDITION · OPERATOR-DEPENDENT · NOT-READY

---

## 1. Functional domains

| Domain | Evidence | Verdict |
| --- | --- | --- |
| Authorisation & RBAC | 40 roles, 328 permissions, 994 RLS policies, pgTAP gate suites PASS | READY |
| Governed mutations | Direct DML revoked on P1 tables; permission-enforcing RPCs | READY |
| Licensing & applications | 54 audited application events, decision letters, certificates | READY |
| Registration & onboarding | Live registration flow, captcha-gated public surfaces | READY |
| Returns & obligations | 124 filings, obligation generation, filing queue drill-downs | READY |
| Prudential detection-to-action | 16 breaches → acknowledgement → directive `PA-2026-000009` | READY |
| Market conduct | Alerts, investigations, thematic review, closure controls | READY |
| Enforcement | 6 enforcement actions with obligations and evidence | READY |
| Fit & proper | 17 assessments; governed determination gate proven to block unsupported finalisation | READY-WITH-CONDITION (finalise 9 seeded determinations) |
| Examinations | 9 examinations with scoping, workpapers, findings, reports | READY |
| Complaints | 13 complaints, RFI cycle, duplicate scoring, escalation | READY |
| Correspondence & notifications | Threads, dispatches, templates, event queue worker | READY-WITH-CONDITION (provider credentials) |
| Supervisory read models & UX | 4 canonical RPCs, dashboards, Entity 360, team performance | READY |
| Reporting & exports | Report views, export governance, download audit | READY |
| AI assistance | 5 insights with accept/override human-in-the-loop states | READY |
| Audit & traceability | 1,024 immutable audit entries, principal now always stamped | READY |

---

## 2. Non-functional readiness

| NFR | Measurement | Verdict |
| --- | --- | --- |
| Page performance | 1.67–2.13 s to network idle, authenticated dev build, 10 core routes | READY-WITH-CONDITION (re-measure on production build) |
| Concurrency / load | Not executed — no load fixture or environment | OPERATOR-DEPENDENT |
| Data integrity | 14 invariants, 0 violations | READY |
| Security posture | RLS 466/466, 0 policy-less tables, 112 security events | READY-WITH-CONDITION |
| Auth hardening (leaked passwords, MFA) | Project-level toggles, owner decision pending | OPERATOR-DEPENDENT |
| Integration resilience | 15 connections, 125 successful calls; retry/DLQ/fallback empty in live data | OPERATOR-DEPENDENT (run failure drills) |
| Backup / disaster recovery | Managed platform capability; no restore drill performed | OPERATOR-DEPENDENT |
| Observability | Structured logging, integration logs, security event logs, escalation health signals | READY |
| Accessibility | Single `<h1>` + `<main>` landmark on every route, no unlabelled inputs, no unlabelled images; minor: 1–3 icon-only controls per page without `aria-label`, some `h-screen` usage, occasional skipped heading level | READY-WITH-CONDITION |
| Test automation | CI executes pgTAP suites against ephemeral DB on every change | READY |
| Documentation | Certification records for A2, A3, A4 and this final report; divergence register maintained | READY |

---

## 3. Go-live checklist

| # | Action | Owner | Blocking |
| --- | --- | --- | --- |
| 1 | Enable leaked-password protection; decide staff MFA policy | Platform owner | Yes |
| 2 | Install production provider credentials (email/SMS/registry) and run one failure drill each | Operations | Yes |
| 3 | Finalise the 9 seeded F&P determinations via the governed action; confirm `v_fp_determination_integrity` is empty | F&P officer | Yes |
| 4 | Drop pgTAP extension/objects from the production project | Platform owner | No |
| 5 | Execute backup/restore and DR drill | Operations | Yes |
| 6 | Run a load/concurrency test at expected supervisory peak | Operations | No |
| 7 | Bind explicit permission modules to the 26 authenticated-only routes | Engineering | No |
| 8 | Add `aria-label` to remaining icon-only controls; replace `h-screen` with `h-dvh` | Engineering | No |

---

## 4. Overall production readiness

**GO — conditional.** All platform-side work required for BRD/FRD
supervisory readiness is complete and evidenced. Remaining blocking items
(1, 2, 3, 5) are commissioning and dataset-finalisation activities
performed in the target environment, not software development.
