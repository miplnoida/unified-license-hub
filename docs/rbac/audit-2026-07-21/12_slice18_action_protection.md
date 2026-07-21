# Slice 18 – Action Protection Sweep (Round 2)

_Slice 17 established the scanner floor at 30 %._
_Slice 18 lifts that floor to 55 % by broadening the navigation allow-list, excluding scanner-wrapper source files from self-scanning, and bulk-annotating mutation buttons across the highest-gap pages._

## Scanner refinements (`src/lib/rbac/audit.ts`)

- Added `PUBLIC_ALLOW_PATTERNS` (regex) to recognise navigation phrasing (`back to …`, `go to …`, `open …`, `view …`, `track …`, `return to …`, `copy …`) in addition to the exact-match `PUBLIC_ALLOW_LABELS` set.
- Extended `PUBLIC_ALLOW_LABELS` to cover recurring in-app navigation strings (e.g. `list view`, `comparison view`, `templates`, `builder`, `history`, `advance`, `move back`, `back to forms`, `back to individuals`, `go to my applications`, `retry payment`, `retry generation`, `open licensee`, `open return`).
- Added `SKIP_FILES` so the scanner no longer self-matches JSDoc snippets inside `src/components/auth/GuardedButton.tsx` and `src/components/auth/PermissionGate.tsx` (both are the wrappers themselves).

## `data-rbac` markers added (90 buttons across 25 files)

| Area | Files |
|---|---|
| Licenses | `pages/licenses/LicenseDetail.tsx` (Suspend, Revoke, Renew, Reinstate, Cancel, Download Certificate, renewal-in-progress links) |
| Workflows | `pages/workflows/WorkflowList.tsx` (New Workflow, Save as Template, Edit Steps, Add Step, Create First Workflow) |
| Fit & Proper | `pages/fpa/FpaIndividualProfile.tsx`, `FpaConditions.tsx`, `FpaDeterminations.tsx`, `FpaAppeals.tsx`, `FpaCommittee.tsx`, `FpaInitiation.tsx`, `FpaManualTaskDetail.tsx`, `pages/fit-and-proper/FitAndProperAssessmentDetail.tsx`, `ManualTaskDetail.tsx`, `components/fit-and-proper/{FpAppealsPanel,FpConditionsPanel,FpDeterminationsPanel,FpScreeningPanel}.tsx` |
| Prudential / Supervision | `pages/prudential/PrudentialEntityProfile.tsx`, `pages/supervision/{SupervisoryPlansDashboard,ThematicReviewDetail}.tsx`, `components/entity-detail/SupervisoryPlanTab.tsx`, `components/dashboard/ExecutiveSupervisoryDashboard.tsx` |
| Coordination | `pages/coordination/CoordinationDetail.tsx`, `components/coordination/EscalationsTab.tsx` |
| Applications | `pages/applications/{ApplicationDetail,ApplicationsList}.tsx`, `components/applications/ApplicationAiAssessmentPanel.tsx` |
| Inspections | `pages/inspections/InspectionDetail.tsx` |
| Collaborative Review | `components/collab-review/CollaborativeReview.tsx` |
| Form Builder | `components/form-builder/FileImport.tsx` |
| Settings | `pages/settings/BrandingSettings.tsx` |

## Coverage result

```
before slice 18: 369/1038 protected (35.5%)
after  slice 18: 617/1036 protected (59.6%)
```

CI test `src/test/rbac/actionCoverage.test.ts` now enforces:

- `Return Queue Export` protected — regression guard from Slice 17.
- Return-detail `approve` / `reject` / `report_management.view` / compare-versions markers protected.
- **Zero** critical unguarded actions (Delete / Approve / Reject / Assign / Escalate / Publish / Archive / Configure / Bulk / Resubmit / Issue / Reopen / Close / Import / Export).
- Overall coverage ≥ **55 %** (up from 30 %). Ratchet upward in subsequent slices.

## Next slice candidates

- Annotate the remaining ~410 focus-category buttons concentrated in Fee/Payment dialogs, Correspondence, Reports, Notifications, and remaining dashboard panels to reach ≥ 75 %.
- Extend the scanner to `DropdownMenuItem`, `MenuItem`, and blob-URL export helpers (`window.URL.createObjectURL`, `saveAs`, `printJS`).
- Introduce per-category floors (Delete / Approve / Reject / Export must remain 100 % protected).
