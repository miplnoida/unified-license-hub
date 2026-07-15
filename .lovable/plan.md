
## Answer (current state)

**Does the system automatically detect duplicate complaints or group complaints by institution / product / intermediary / issue?** — **No.** The existing `ComplaintsList` provides SLA tracking, triage, and workflow routing, but there is no similarity engine, no "possible duplicate" flag on intake, and no clustering view that groups related complaints. Complaints are treated as independent cases.

## What I will build (UI only — no schema, no backend logic)

A new **Duplicate Detection** surface under the existing Complaints module, driven entirely by mock data. No changes to complaint intake, triage, workflow, RLS, or edge functions.

### New files

```
src/pages/complaints/duplicates/
  DuplicateDetectionHub.tsx        # Landing: 3 tabs (Suspected Duplicates, Clusters, Rules)
  types.ts                         # Local UI types
  seed.ts                          # Mock duplicate pairs, clusters, detection rules

src/components/complaints/duplicates/
  SuspectedDuplicatesTable.tsx     # List of complaint pairs with similarity score, matched fields
  DuplicatePairDrawer.tsx          # Side-by-side comparison of two complaints + Merge/Link/Dismiss actions (mock)
  ClusterGroupsPanel.tsx           # Grouped complaints by institution / product / intermediary / issue
  ClusterDetailDialog.tsx          # Drill-in: complaints in a cluster + trend mini-chart
  DetectionRulesPanel.tsx          # Configurable rules (fuzzy name match, phone/email match, keyword overlap, time window) — UI toggles only
  SimilarityScoreBadge.tsx         # Color-coded 0-100 score badge
  MatchedFieldsList.tsx            # Chips showing which fields matched (email, phone, institution, description keywords)
  DuplicateAlertBanner.tsx         # Small banner rendered on ComplaintsList (mock: "3 possible duplicates detected today")
```

### Wiring (minimal, additive)

- `src/routes/dashboardRoutes.tsx`: register `/complaints/duplicates` (lazy).
- `src/config/navigation.tsx`: add a **Duplicate Detection** child under the existing Complaints sidebar section.
- `src/pages/complaints/ComplaintsList.tsx`: render `<DuplicateAlertBanner />` at the top (read-only mock count with a link to the hub). No changes to list/filter/query logic.

### Scope guardrails

- No DB migrations, no edge functions, no changes to `complaints`, `complaint_types`, triage, or workflow code.
- Merge / Link / Dismiss actions are visual mocks that update local component state only.
- Detection rule toggles persist to `useState` (not saved).
- Existing complaints analytics, list, and detail pages remain untouched aside from the single banner insertion.

### Technical details

- Types in `types.ts`: `SuspectedDuplicatePair`, `DuplicateCluster`, `ClusterDimension = 'institution' | 'product' | 'intermediary' | 'issue'`, `DetectionRule`.
- Similarity score is a precomputed number in seed data (no runtime NLP). Matched-fields array explains the score ("Email exact match", "Institution fuzzy 92%", "Description keyword overlap: 'unauthorized fee'").
- Cluster panel groups mock complaints by the four required dimensions with count, date range, and severity mix.
- Rule panel exposes toggles + thresholds (similarity ≥ %, time window in days, exact-match fields) as pure UI.
- All components use shadcn primitives and existing tokens; Recharts reused for the cluster trend mini-chart.

### Verification

- Typecheck passes.
- `/complaints/duplicates` renders all three tabs with mock data.
- Banner appears on `ComplaintsList` and links to the hub.
- No changes to existing tests.
