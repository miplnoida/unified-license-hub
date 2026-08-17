# Move Risk Heatmap into the 360 Entity Profile

Give each prudentially supervised entity its own risk view inside its 360 profile, and stop surfacing the portfolio heatmap from the Admin Control Panel.

## What changes

1. **New "Risk Score" tab** on the Prudential Entity Profile (`/prudential/entities/:id`), placed right after Overview.
   - Headline: current composite score out of 100, risk band badge, scoring period, and when it was last computed.
   - **What drives this score**: one row per risk driver (prudential breaches, open enforcement, open complaints, overdue returns, inspection findings, fit & proper alerts) with the plain-language name, raw count, weight applied, and a contribution bar. Zero-count drivers read "No issues recorded".
   - **Score history**: prior scoring periods for this entity (score + band per period, newest first) so supervisors can see whether risk is rising or falling; empty-state message when only one period exists.
   - **Where to go next**: links to the relevant queues (breaches, complaints, returns, enforcement, inspections) shown only when the related count is non-zero.
   - Advisory AI commentary panel, consistent with the other prudential tabs (clearly labelled "Advisory", never altering deterministic scores).
   - Empty state when the entity has no computed risk score yet.
   - Read-only: no recompute or edit actions, so permissions are unchanged.

2. **Admin Control Panel**: remove the "Risk Heatmap" card. The portfolio heatmap route `/supervision/risk` keeps working (still reachable from the Supervisory/Executive dashboards), it is just no longer listed in the admin hub.

## Technical notes

- Reuse the existing driver/weight/label logic from `src/components/prudential/RiskScoreDetailDrawer.tsx` by extracting the score-explanation body into a shared presentational component (e.g. `src/components/prudential/RiskScoreExplainer.tsx`), so the drawer on the portfolio heatmap and the new profile tab render identical content from one source. The drawer keeps its Sheet wrapper.
- `src/pages/prudential/PrudentialEntityProfile.tsx`: add the `risk` tab trigger + `TabsContent` rendering a `RiskScoreTab` that queries `entity_risk_scores` for this entity (all periods, newest first, via TanStack Query) and feeds the newest row into the explainer plus history list.
- `src/pages/admin/AdminHub.tsx`: delete the Risk Heatmap entry (line 78).
- No database migration, edge-function, RLS, or permission change; band styles and `formatDateTime` from `src/lib/datetime.ts` are reused.
