# Risk Heatmap — Clickable Entity Cards with Detail View

Make each entity tile on the Risk Heatmap open a detail panel that explains the score in plain language, instead of being a dead card.

## Behaviour

- Each entity card becomes clickable (keyboard accessible, hover/focus affordance).
- Clicking opens a side drawer titled with the entity name and its risk band badge.
- Drawer contents:
  - **Headline**: score out of 100, band, scoring period, and when it was last computed.
  - **What drives this score**: one row per risk component (prudential breaches, open complaints, overdue returns, open enforcement, inspection findings, fit & proper alerts) showing the plain-language name, the raw count, the weight applied, and a bar for its contribution to the total. Components with zero counts are shown as "No issues recorded".
  - **Score history**: prior scoring periods for the same entity (score + band per period) so supervisors can see whether risk is rising or falling. Shows an empty-state message when only the current period exists.
  - **Where to go next**: buttons linking to the entity's Prudential Entity Profile and (when counts are non-zero) to the relevant queues — breaches, complaints, returns, enforcement.
- Drawer is read-only; no recompute or edit actions inside it, so existing permissions are unchanged.

## Technical notes

- `src/pages/supervision/RiskHeatmap.tsx`: wrap the card markup in a `button` and hold the selected score row in state.
- New `src/components/prudential/RiskScoreDetailDrawer.tsx` using the existing `Sheet` component; reuses the page's band styles and `formatDateTime` from `src/lib/datetime.ts`.
- Component labels/caps live in a small map in the drawer (mirroring the weights used by the `risk-score-recompute` function) so the contribution maths matches the backend.
- History query: read `entity_risk_scores` for the selected `entity_id` (all periods, newest first) via TanStack Query, enabled only while the drawer is open.
- Read-only; no database migration or edge-function change required.
