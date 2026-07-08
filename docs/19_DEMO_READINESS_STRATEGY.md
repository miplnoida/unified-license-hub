# 19 — Demo Readiness Strategy

## Principle
Demos must run on real code paths against a seeded environment — **no mock data injected at runtime**.

## Environments
| Env | Purpose | Data |
|-----|---------|------|
| `dev` | Engineering | Sandbox, resettable |
| `demo` | Regulator/exec demos | Seeded via scripts; refreshed weekly |
| `uat` | Regulator acceptance | Regulator-controlled |
| `prod` | Live | Real |

## Seed Data
- Scripts live in `supabase/seeds/` (to be created) — idempotent.
- Personas: super_admin, admin, licensee_primary, licensee_secondary, applicant, auditor.
- Sample entities across all sectors (Banking, Insurance, Securities, etc.).
- Sample workflows in each state (draft, submitted, in-review, approved, rejected).

## Demo Scripts
- `docs/demos/*.md` — narrative walkthroughs per audience.
- Existing `docs/DEMO_PRESENTATION_GUIDE_NON_TECHNICAL.md` retained; reformatted into audience-specific pages.

## Pre-Demo Checklist
1. Refresh seed data.
2. Verify all critical journeys green in Playwright.
3. Run security scan; no High findings.
4. Confirm notification templates render.
5. Confirm PPOC + regulator switcher behave for demo persona.
6. Warm dashboard caches by loading each page once.

## Known Demo Risks (as of EPIC 0)
- No perceptible loading placeholders on some heavy dashboards.
- Notification delivery in demo env depends on real email domain — use a sink domain.
- Reports print-to-PDF depends on browser print dialog — practice.

## After-Demo Actions
- Capture feedback into `docs/frd/feedback.md`.
- File issues; do not fix live.
