# Add a business lens and data-integrity layer to AI analysis

Today the AI analysis on the Application Decision tab (and the supervisory/prudential AI panels) reviews *what is present and consistent* — section status, findings, risks, missing information. It does not tell the analyst what the case means commercially or whether the underlying data can be trusted. This adds those two layers everywhere AI analysis appears, without changing any existing output, decision, or workflow behaviour.

## 1. Deterministic data-integrity checks (facts first)

The application AI function will compute a data-integrity snapshot in code before calling the model, so the AI interprets real facts instead of guessing:

- Fee vs payment: paid amount and currency vs applicable fee(s); partial, over- and unpaid cases.
- Cross-form consistency: the same business fact (entity name, incorporation date, capital, ownership %, addresses, contacts) declared differently across forms.
- Arithmetic integrity: totals/sub-totals and calculated fields that don't reconcile with their components; ownership percentages not summing to 100.
- Date logic: incorporation after submission, expiry before issue, future-dated declarations, period end after due date.
- Completeness: mandatory fields left blank, placeholder values ("NA", "-", "0"), documents with no file or zero size, duplicate uploads.
- Lifecycle integrity: RFI raised but no form change recorded, resubmission with identical data, submitted-form count vs required templates.

Each check produces a pass / warning / fail with the exact values involved. These appear in the UI as their own verifiable list — not as AI prose.

## 2. Business-point-of-view assessment (AI interprets)

The application prompt gains a `business_assessment` block covering:

- Eligibility and fit against the applied licence category and sector.
- Financial substance: capital adequacy versus the minimum for the category, funding sources, sustainability signals.
- Ownership, control and group structure implications.
- Business model viability, revenue basis and stated market/customer segment.
- Consumer, market conduct and public interest impact.
- Operational readiness (governance, key persons, systems, premises).
- Regulatory burden and supervisory implications if licensed.
- Commercial conditions worth attaching, and business-side questions to ask.

Each item carries a rating (favourable / acceptable / needs strengthening / adverse), plain-language rationale, and evidence quoting supplied values only. It remains advisory — no automatic approvals; the analyst still decides in the Workflow panel.

## 3. Same two lenses on the other AI pages

Supervisory and prudential AI outputs (risk scoring, peer analytics, risk dashboards, examinations, conduct, complaints, enforcement, returns analytics) gain two optional blocks with the same rules: `business_impact` (what the finding means for the entity's business, the sector, consumers and supervisory effort) and `data_quality_observations` (thin, stale, contradictory or missing data that limits confidence in the conclusion). Existing sections and wording stay untouched.

## 4. UI rendering

- Decision tab AI panel: two new collapsible sections — **Business assessment** and **Data integrity checks** — rendered only when the data exists, so older cached assessments keep displaying exactly as they do now.
- Supervisory/advisory AI panels: the same two optional sections appended after the current ones.
- Colour and badge use follows the existing semantic tokens and severity badges already used in these panels.

## Technical notes

- `supabase/functions/generate-application-ai-assessment/index.ts`: add the deterministic integrity computation, extend the JSON schema with `business_assessment` and `data_integrity`, persist them, and bump `PROMPT_VERSION` to `v3` so new runs use the richer prompt.
- Migration: add nullable `jsonb` columns `business_assessment` and `data_integrity` to `application_ai_assessments` (defaults `null`; no backfill, no RLS change).
- `generate-supervisory-ai-analysis` and `generate-prudential-ai-analysis`: extend `SCHEMA_HINT` and the system prompt with `business_impact` and `data_quality_observations`; bump their cache/prompt version so fresh analyses pick up the new lens while cached ones stay valid.
- UI: `ApplicationAiAssessmentPanel.tsx`, `SupervisoryAiPanel.tsx`, `AdvisoryAiPanel.tsx` — additive rendering only, all fields optional-guarded.
- No change to workflow transitions, routing enforcement, decision recording, permissions, or any existing section's output contract.
