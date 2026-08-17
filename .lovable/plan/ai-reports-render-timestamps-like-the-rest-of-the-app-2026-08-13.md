# AI Reports — Render Timestamps Like the Rest of the App

Raw values such as `2026-08-08T11:38:31.787015+00:00` appear inside AI report content. Fix is display-only: format them the same way list pages do (`08 Aug 2026, 05:08 pm`).

## Where it comes from (verified)

- AI evidence arrives as `key: value` strings (e.g. `created_at: 2026-08-08T11:38:31.787015+00:00`). `toEvidenceFact` in `src/lib/licensing/aiAssessmentLabels.ts` humanises the key but passes the value through untouched, so the ISO string renders as-is in "What this is based on" (`ApplicationAiAssessmentPanel`) and in the evidence chips rendered by `src/components/ai/report/AiReportKit.tsx`.
- Panel headers already use the shared `formatDateTime` from `src/lib/datetime.ts` (`Prepared …`, `Produced …`), so only in-body content is inconsistent.

## Changes

1. **Shared helper** in `src/lib/datetime.ts`: `humanizeTimestamps(text)` — replaces any ISO-8601 timestamp found inside a string with `formatDateTime(...)` output, leaving all other text unchanged. Plain dates (`2026-08-08` with no time part) go through `formatDateOnly`.
2. **Evidence values**: in `toEvidenceFact`, pass the value part through the helper so evidence lines show a readable date and time. The "Technical details" toggle keeps the original raw string.
3. **AI narrative text**: apply the same helper where AI-authored text is rendered in the report kit (observation text, evidence chips, summary/lead lines) so any timestamp the model quotes is readable too.

## Not changed

Stored values, prompts, facts sent to the model, permissions, generation logic, caching/fingerprints, sorting and filtering. No migrations, no edge function changes.

## Verification

- Playwright pass on the application detail AI analysis tab and one prudential/complaint AI report tab, confirming no raw ISO strings remain and no console errors.
- `tsgo` typecheck plus existing vitest suite.
