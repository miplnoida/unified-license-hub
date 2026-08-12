# Advisory AI for Risk Scoring, Peer Analytics and Risk Dashboards

Add an optional, clearly-labelled "AI-assisted analysis — advisory" layer on top of the existing prudential risk modules. Every number stays deterministic: the AI only receives facts the platform has already computed, and only produces narrative interpretation. No existing score, threshold, EWI severity, ratio, peer metric, heatmap band, alert, workflow or permission changes.

## Where it appears

1. **Entity risk & early warning** — `Prudential > Supervised Entities > entity profile`
   - Overview tab: official risk score/band card stays exactly as-is; a new advisory card sits below it with "Explain risk" and "Explain changes" actions.
   - Early Warning tab: advisory "suggested attention priority" list beside the existing EWI table (configured severity untouched).
2. **Ratio, trend & peer analytics** — entity profile "Ratios & Trends" and "Peer Comparison" tabs, plus `Returns > Prudential Analytics`
   - "AI trend commentary — advisory" card under the existing chart, with "Generate commentary" / "Summarize this chart" and a peer-divergence explanation.
3. **Risk heatmap & dashboards** — `Supervision > Risk Heatmap` (and the executive systemic-risk panels)
   - "AI portfolio summary — advisory" card above the heatmap with "Generate supervisory summary", plus "Explain this risk movement" inside the existing risk-score detail drawer.

Every panel is collapsed/empty until the user clicks generate. Nothing on these pages waits on AI to render.

## How it behaves

- **Advisory framing**: each panel carries the badge "AI-assisted analysis — advisory" and the line "This analysis summarizes existing supervisory data. It does not change risk scores, thresholds, alerts or supervisory decisions." Visual treatment (muted/dashed card, distinct from official cards) keeps it separate from authoritative results.
- **Evidence-grounded**: bullet observations show the supporting deterministic facts (e.g. "Liquidity ratio 18.2% → 12.8% over 4 periods; peer median 17.1%") with drill-through links into the existing tabs/pages. Facts come from the platform payload, never invented by the model.
- **Structured output**: summary, key observations, deteriorating / improving indicators, peer observations, emerging risks, suggested focus areas, evidence refs, categorical confidence (High / Moderate / Limited), limitations. Rendered as plain-language sections, not an essay. The model may answer "insufficient information for a reliable interpretation".
- **Caching + staleness**: each generation is stored with scope, analysis type, source period, model metadata, requester, and a fingerprint of the deterministic inputs. Panels show "Generated 12 Aug 2026, 4:20 PM" and a "Refresh analysis" action. If the fingerprint no longer matches current data, an "Analysis may be outdated" banner appears. Refresh only replaces the narrative — no filter, chart, score or workflow side effects.
- **Failure isolation**: AI errors render "AI analysis unavailable — the deterministic system remains authoritative. [Try again]". Never rendered as "no risks found". All existing functionality continues without AI.
- **No auto-actions**: suggested focus areas render as text plus a "Review supervisory options" link into the existing manual action/escalation flows. Nothing is created automatically.
- **Feedback**: Helpful / Not helpful / Flag incorrect analysis, recorded against the stored analysis only.
- **Feature flag**: gated by a new flag in the existing `src/lib/featureFlags.ts` pattern so rollout can be switched off centrally.

## Technical notes

- **Backend**: one new edge function `generate-prudential-ai-analysis`, modelled on the existing `generate-return-analysis` / `generate-dashboard-insights` functions — same Lovable AI Gateway usage, `requireUserPermission` gate, strict JSON parsing, `provider_state` handling, `logIntegration` audit, and CORS/error conventions. It accepts `{ analysis_type, scope, scope_id, period }`, assembles the fact payload by reading already-computed rows (`entity_risk_scores`, `prudential_ratio_results`, `return_threshold_breaches`, `prudential_ewi_alerts`, `prudential_actions`, peer snapshot RPC output), and never recomputes a metric.
- **Peer privacy**: peer facts are taken from the same peer-snapshot RPC the UI uses, so the configured minimum-peer floor and aggregation rules apply unchanged; no individual peer identities or values are sent unless the caller can already see them.
- **Storage**: reuse the existing `ai_insights` / `ai_insight_actions` tables (they already carry `module`, `entity_id`, `object_type/id`, `source_records`, `citations`, `provider_state`, `confidence`, `explanation`, `review_status`). A small migration adds the analysis payload/fingerprint/period columns needed for caching and staleness, with GRANTs and RLS policies matching the existing prudential read scope.
- **Frontend**: one reusable `AdvisoryAiPanel` component plus a `usePrudentialAiAnalysis` hook (react-query, independent of the page's data queries) shared by all placements. Existing components (`RiskScoreDetailDrawer`, `EwiPanel`, `PrudentialEntityProfile`, `PrudentialAnalytics`, `RiskHeatmap`) are only extended by mounting the panel — their existing logic is untouched.
- **Data minimization**: payload contains supervisory metrics and identifiers only — no applicant PII, documents, tokens or unrelated records. Audit logs record the generation event and scope, not full prompt bodies.

## Verification

- Risk score, band, EWI severities, ratio values, peer distributions and heatmap bands identical before/after (spot-checked on a seeded entity).
- Every quantitative sentence in generated output traceable to a platform value.
- Simulated AI failure: all pages, filters, drilldowns and exports still work; only the advisory card shows the unavailable state.
- Stale path: generate, change underlying data, confirm the outdated banner and refresh behaviour.
- No supervisory action, alert, RFI or workflow transition is created by any AI path.
