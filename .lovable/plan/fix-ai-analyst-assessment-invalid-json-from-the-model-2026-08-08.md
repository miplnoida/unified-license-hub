# Fix AI Analyst Assessment — invalid JSON from the model

## What is actually happening

On APP-2026-000135 the panel is no longer stuck loading — it now renders a hard error: **"AI assessment failed — AI response was not valid JSON"** (latest row `e311d65b…`, 09:17 UTC). The gateway call itself succeeded (log_id `019fe0a9-eb38-7df0-b965-39731815802b`, 2026-08-08T09:17:59Z, http 200, finish_reason `stop`, 4390 output tokens) — nothing timed out.

The captured response stream shows the cause: the model emits *syntactically invalid JSON*. The prompt asks for `evidence` entries that quote a field path plus its value, and the model writes unterminated strings whenever the value is not a quoted string, e.g.

```text
"evidence": [
  "risk_indicators.prior_rfi_count\": 0
],
"evidence": [
  "fees_payment.payments[0].amount\": 2,
  "fees_payment.payments[0].currency\": \"USD\""
]
```

The first entry never closes its quote, so `JSON.parse` fails and the brace-slice fallback in `safeParseJson` fails too. The 09:15 run that succeeded got lucky — every evidence value there happened to be a quoted string. This is a non-deterministic prompt/format defect, not a timeout.

## Fix

1. **Constrain the output format at the API level** — `supabase/functions/generate-application-ai-assessment/index.ts`
   - Send a strict `response_format` json_schema for the assessment shape (sections, findings, risks, routing_recommendation, decision_report, missing_information, confidence_score) so the provider is forced to return schema-valid JSON instead of free-form text in code fences.
   - Type every `evidence` entry as a plain string and change the prompt instruction to "a short plain-language reference — do not embed quotes, colons, or JSON fragments", which removes the exact construct that breaks parsing.
   - Switch the auth header to `Lovable-API-Key` (the gateway's documented header) and keep `stream: true` with server-side accumulation.

2. **Make parsing resilient instead of fatal**
   - Harden `safeParseJson` with a brace-depth scan that respects string escapes, and add one repair pass that closes unterminated string literals before a final parse attempt.
   - If parsing still fails, retry the gateway call **once** with a stricter "return JSON only" instruction before writing `failed`.

3. **Keep the failure diagnosable**
   - Persist the first ~4000 chars of the raw model text on the assessment row when parsing fails, so the next occurrence is inspectable without re-running the model.
   - Leave the existing terminal-status and stale-pending recovery in place.

4. **Verify on this application**
   - Trigger a fresh generation for APP-2026-000135, confirm the row reaches `completed` with populated findings/sections, and confirm the panel and the Decision-Ready Summary render the report (not the "generated before the decision-ready report was available" notice).
   - Re-run generation a second time to confirm it is repeatable, and check the gateway logs for both runs.

## Technical notes

- Files touched: `supabase/functions/generate-application-ai-assessment/index.ts` (schema, prompt, header, parser, retry, raw-text capture). A small migration is needed only if the raw-text column does not already exist on `application_ai_assessments`; otherwise no schema change.
- No frontend change required — the panel already handles `completed` / `failed` / stale `pending` correctly.
