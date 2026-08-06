# Fit & Proper — AI Analysis Review: live screening provider path

## Goal

Today the AI Analysis Review screen shows findings that come from either the declaration (self-declared triggers) or a single AI text completion. No sanctions/PEP/AML provider is ever called: `fp-screening-run` does not use `invokeIntegration()` at all, so the adapters that already exist (`aml_screening`, `sanctions_screening`) are unreachable and every real screening hit has to be typed in by an analyst.

This closes that gap: screening checks execute through the Integration Manager, provider hits become findings with full provider provenance awaiting analyst triage, and the screen states plainly which provider produced each result — or that no provider is configured.

Since no provider credentials exist yet, a governed **sandbox screening provider** is included so the whole path runs end-to-end now. Supplying real credentials later is a configuration change only — no code change.

## What gets built

### 1. Provider execution inside screening runs

`fp-screening-run` gains a provider stage for the check types that map to external data:

| Check type | Adapter | Operation |
|---|---|---|
| `sanctions` | `sanctions_screening` | `screen` |
| `pep` | `sanctions_screening` | `screen` (PEP flag) |
| `adverse_media` | `aml_screening` | `screen_individual` |

Each call goes through `invokeIntegration()` with `sourceModule: 'fit_and_proper'`, the assessment as source entity, `fallbackPolicy: 'forbid'` (a sanctions result must never be faked into a pass), and the durable retry queue enabled for transport failures.

Outcomes are all explicit and recorded on the run:

- **Provider hits** — one `fp_finding` per match, `source = 'provider:<key>'`, `resolution_status = 'pending'`, carrying match score, lists matched, provider reference and redacted raw payload, plus a `severity_basis` explaining that the severity came from the provider score (not a human or an LLM).
- **Provider clean** — a single zero-severity "no match" finding, so "screened clean" is distinguishable from "never screened".
- **`not_configured`** — the run records a `not_configured` outcome for that check and the existing declaration/AI logic still runs; no silent success.
- **Technical failure** — run marked with the error, retry queued, no finding invented.

The existing declaration-trigger and AI-media logic is untouched and keeps running alongside the provider stage.

### 2. Sandbox screening provider

- New edge function `screening-sandbox` exposing the endpoint shapes the two adapters already build (`sanctions/search`, `screen/individual`, `screen/{id}`, `health`), returning deterministic results derived from the subject name so demos and tests are repeatable (clean subjects, a PEP subject, a sanctions-match subject).
- Migration registering two `integration_connections` rows (`aml_screening`, `sanctions_screening`) in **sandbox** environment pointed at that function, `fallback_enabled = false`, health-check enabled, so `/settings/integrations` shows them live and monitored.
- The sandbox key is stored as a secret (generated, not hand-typed) and referenced through `integration_credentials` — the same resolution path a real provider uses.

### 3. AI Analysis Review screen (`/fpa/ai-analysis`)

Presentation-only additions:

- **Screening source banner** — per check type, shows the resolved provider, environment (sandbox/production) and last health status, or a clear "No live provider configured — findings are manual/AI-assisted" state when unresolved.
- **Provenance on each finding** — Provider / AI / Self-declaration / Manual badge, provider match score and lists matched where present, and the citation/evidence block for provider hits alongside the existing AI citations.
- **Run outcome strip** — for the latest run: checks executed, provider-verified vs not-configured vs failed, so a broken check is never mistaken for a clean subject.
- Triage (accept/reject with note) reuses the existing flow unchanged.

### 4. Verification

- Deno tests for the sandbox provider responses and the mapping of adapter output to findings (hit, clean, not_configured, transport failure).
- pgTAP assertions that the sandbox connections resolve, that provider findings land with `pending` resolution and provider provenance, and that a `not_configured` run leaves an explicit trace.
- Manual walkthrough on a real assessment: run screening, confirm provider findings appear in AI Analysis Review with provider badges, triage one, and confirm the integration log/retry queue entries.

## Technical notes

- Files touched: `supabase/functions/fp-screening-run/index.ts`, new `supabase/functions/screening-sandbox/index.ts`, `src/pages/fpa/FpaAiAnalysis.tsx`, `src/components/fit-and-proper/FpScreeningPanel.tsx` (badges only), one migration for connection registration and any `fp_findings` provenance column needed, plus tests.
- No changes to the Integration Manager runtime, adapters, monitoring sweep behaviour, determination/appeal logic, or existing declaration triggers.
- Provider payloads are redacted through the existing `redactPayload` helper before persistence and logging.
