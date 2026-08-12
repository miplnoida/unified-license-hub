# Complete & Harden Supervisory Advisory AI

No rebuild. The existing panel, hook, shared types, edge function, caching, staleness, confidence, feedback and feature flag stay. This plan closes the security holes and the missing Market Conduct surface, and hardens output handling.

## What I confirmed in the current code

- `generate-supervisory-ai-analysis` gates `cross_module` on a single permission (`prudential_supervision.view`), then assembles complaints, examinations, enforcement and supervisory actions with the service-role client unconditionally. A prudential-only user can therefore receive complaint and enforcement content.
- `public.can_view_advisory_ai('cross_module')` also resolves to `prudential_supervision.view`, so a cached cross-module insight (which stores full facts in `source_records`) is readable by users who could not regenerate it.
- `ai_insights` has no column recording which modules contributed to an analysis.
- `precedent_comparison` queries `enforcement_actions` with no user-visibility filter.
- Executive facts are hard-coded to a 90-day window and ignore the dashboard's selected period, sector and filters.
- Several fact queries use `select('*')` (examination, enforcement case, complaint) and then trim in memory — the full row, including complainant PII, is loaded first.
- Model output is only checked for the `confidence` enum; structure, array types, sizes and evidence references are unvalidated.
- No advisory AI panel exists on any `src/pages/conduct/*` screen — Market Conduct AI is defined in the backend but not reachable in the UI.

## 1. Per-source authorization for cross-module AI (highest priority)

- Replace the single cross-module permission gate with a permission map resolved per source module inside the edge function, using the existing `has_permission` RPC only (no parallel authorization logic): prudential, examinations, complaints, market conduct, enforcement, supervisory actions, licensing, fit & proper.
- Assemble facts source-by-source, guarded by the corresponding flag. When a source is not permitted: no query is issued, no placeholder, no count, no hint that records exist.
- Add `available_sources: [...]` to the facts and instruct the model to caveat with "based on the supervisory information available to your role" and never to speculate about anything outside that list.
- Entry gate becomes: authenticated user must hold at least one supervisory source permission; otherwise 403.
- UI: the cross-module brief on the entity profile stops implying complete coverage — description becomes "Supervisory brief based on the information available to your role."

## 2. Cached-insight leakage

- Migration (backward-safe, additive): add `source_modules text[]` to `ai_insights`, default `'{}'`.
- The function records the exact permitted sources that contributed to each generated analysis.
- Rewrite `public.can_view_advisory_ai` into a source-aware check: a row is readable only if the viewer passes the module's own permission **and** holds view permission for every module listed in `source_modules`. Rows with an empty/NULL `source_modules` and `module = 'cross_module'` (legacy) are not returned through the cross-module path — they must be regenerated. Applies to the SELECT policy and the feedback UPDATE policy.
- Cache lookup inside the function adds the caller's permitted-source set to the match, so two users with different visibility never share a cross-module cached result.

## 3. Market Conduct AI in the UI

- Add one `SupervisoryAiPanel` (module `conduct`, analysis type `conduct_recurrence`) to the existing Market Conduct analytics screen — `src/pages/conduct/ConductDashboard.tsx` — positioned below the authoritative charts/filters, plus one on `ConductEntityProfile.tsx` for entity-level recurrence. No new page, no new component.
- Title "AI conduct pattern analysis", badge "Advisory", action "Analyse conduct patterns", description stating it creates no findings, changes no classification and starts no enforcement.
- Facts come from the dashboard's current filters (period, sector, product, licensee) as aggregate conduct/complaint counts and theme groupings, not raw complaint rows.
- Prompt tightened so output distinguishes observed concentration from established misconduct.

## 4. Examination and Complaint placement review

Both workspaces already carry contextual panels. I will verify each capability sits on its own stage/tab (brief → overview, scope suggestions → scoping, request suggestions → data requests, evidence summary/gaps → workpapers, finding draft + consistency → findings, report draft → reporting, response review → management responses; classification/summary/investigation/similar/QA on the matching complaint tabs), add any missing one, and confirm no panel touches tab sequencing, current step, sign-off or stage actions. Drafts are labelled "AI-generated draft — reviewer must confirm" and are copy-only.

## 5. Enforcement precedent privacy

`precedent_comparison` will only include past actions the caller is entitled to see (entity-assignment / enforcement permission scoping applied to the query), and only the columns needed for comparison.

## 6. Executive dashboard scope

- The executive panels pass the dashboard's live context: selected period/comparison window, sector and filters.
- The function honours the supplied window instead of a fixed 90 days; when the comparison cannot be computed it returns "Insufficient data for this comparison" rather than inventing movement.
- Facts are built from the same aggregates the dashboard shows, not underlying confidential records.

## 7. Output validation and evidence links

- Add a server-side validator: expected keys only, arrays of strings/observations coerced or dropped, string length and array size caps, confidence enum, `insufficient_evidence` boolean. Malformed content is sanitised rather than stored raw; if nothing survives, the response is an explicit failure state.
- Evidence references become application-controlled: the function maps model-cited identifiers back to the facts it supplied and emits `{label, kind, id}` only for matches. The panel renders a "View …" link only from that trusted metadata and an authorized route; model text never produces a URL.

## 8. Data minimization

Replace every `select('*')` in fact assembly with explicit columns per analysis type. Complaint facts exclude complainant name, address, phone, email and identity-document fields.

## 9. Failure isolation, staleness, flag, UX

- Verify each failure path (no key, 429, 402, 500, timeout, malformed JSON, insert failure) leaves the module fully usable with "AI analysis is temporarily unavailable" + Try again, and never renders "No issues found" for a failure or for insufficient evidence.
- Staleness fingerprints extended to authoritative timestamps (record `updated_at`, latest evidence/task/RFI/workpaper/finding/event timestamps) so real data movement flags "Analysis may be outdated" with Refresh.
- With `SUPERVISORY_ADVISORY_AI_ENABLED = false`, confirm all five modules render exactly as before, with no gaps, hooks or requests.
- AI stays visually secondary to official information; plain-language labels only.

## Out of scope

Admin approval workflow, configured workflows, RBAC architecture, examination/complaint/enforcement lifecycles, risk and dashboard calculations.

## Verification

TypeScript check, lint, existing test suites, the RBAC/authz verification scripts, Supabase linter on touched tables, plus a browser pass over Examination, Complaints, Enforcement, Market Conduct and the Executive dashboard with AI on and off. I will report the three security acceptance tests (partial-permission cross-module generation, cross-user cache isolation, complaint-user without enforcement access) against the new policy and function, and state explicitly anything I cannot satisfy safely.
