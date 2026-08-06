# Approver Consolidated Decision View + Decision Letter & Certificate Preview

Two licensing gaps to close, without disturbing existing review behaviour.

## What exists today (verified)

- `DecisionReadySummary`, `SufficiencyPanel`, `TwinPeaksPanel`, `ApplicationAiAssessmentPanel` and `ConsolidatedCaseTab` all exist, but they are scattered: the consolidated case sits in a tab, the rest are stacked loosely below the tab strip on `ApplicationDetail`. There is no single decision-ready screen an approver can open.
- `ConfigurableDecisionActions` reads `decision_options` / `decision_rationale_templates`, but both tables are **empty** (0 rows), so every approver falls back to the three hardcoded defaults with no rationale wording.
- `correspondence_templates` has **0 rows** — no decision letter wording of any kind.
- Certificates can only be produced *after* a licence record exists (`generate-license-certificate` requires `license_id`, writes storage + a `license_certificates` row). There is no preview at decision time and no letter preview anywhere.

## What will be built

### 1. Decision tab — consolidated decision view

A new internal-only **Decision** tab on the application detail screen, containing, in decision order:

1. Recommendation & readiness header (status, SLA, assigned officer, outstanding blockers)
2. Sufficiency + Twin Peaks clearance gates
3. AI advisory assessment
4. Decision-ready summary (forms, documents, fees, RFI history)
5. Consolidated case exposure (other applications, licences, complaints, enforcement, overdue returns, prudential breaches)
6. Decision letter & certificate preview
7. Decision actions

The existing panels are reused as-is and moved into this tab so there is one source of truth; the loose stack below the tabs is removed. Non-internal users and drafts see no change.

### 2. Decision letter & certificate preview

- New `DecisionDocumentPreview` component in the Decision tab: pick an outcome, pick a letter template, see the fully merged letter (applicant, application number, licence type, submission/decision dates, rationale, conditions, signatory block) with print and download.
- Draft certificate preview for approve / conditional-approve outcomes: rendered server-side as a real PDF, watermarked **PREVIEW**, shown inline and downloadable. Nothing is stored and no certificate record is created — the live certificate flow after licence issue stays untouched.

### 3. Seed configuration

Seed the empty configuration tables so both features have real content, all editable later from the existing admin screens:

- 6 decision options (Approve, Approve with Conditions, Reject, Request Resubmission, Defer, Escalate) with reason-length and conditions rules.
- 6 matching rationale templates.
- 5 decision letter templates (approval, conditional approval, rejection, resubmission request, deferral).

## Technical notes

- **Migration** (idempotent, `ON CONFLICT DO NOTHING` / `NOT EXISTS`): inserts into `decision_rationale_templates`, `decision_options`, and `correspondence_templates` (category `decision_letter`). No schema changes, no drops.
- **New edge function** `preview-decision-documents`, gated with `requireUserPermission(req, 'application_management', 'approve')`. Input: `application_id`, `outcome`, optional `conditions`. Returns a base64 draft certificate PDF built with `pdf-lib`, using the admin-configured signatory from `site_settings.license_certificate_signatory`. Read-only: no storage upload, no inserts. `generate-license-certificate` is left unchanged so its authz pattern and verification script keep passing.
- **Letter merge** is client-side using the existing `renderRationaleTemplate` token substitution over `correspondence_templates.body`.
- New files: `src/components/applications/ApproverDecisionView.tsx`, `src/components/applications/DecisionDocumentPreview.tsx`, `supabase/functions/preview-decision-documents/index.ts`. Edited: `src/pages/applications/ApplicationDetail.tsx` (tab wiring only).

## Verification before reporting done

- Type check + existing test suite.
- Browser run on a submitted application as internal staff: open the Decision tab, confirm every section renders, generate a letter preview, generate the watermarked draft certificate PDF, and confirm no `license_certificates` row is created.
