# Slice 19 – Action Protection Sweep (Round 3)

_Slice 18 raised the scanner floor to 55 %._
_Slice 19 lifts that floor to 75 % by bulk-annotating ~140 more mutation buttons across Applications, Prudential, Fit-and-Proper, Entity-Detail, Complaints, and Correspondence modules, and adds per-category **hard floors** for destructive/export actions._

## Batch 1 — line-precise edits (49 buttons)

| Module | Files |
|---|---|
| Decisioning | `pages/admin/DecisionOptions.tsx` (`New Option`, `New Template`, both `Save` dialogs) |
| Supervisory Plans | `pages/admin/SupervisoryPlanTemplates.tsx` (`New template`, `Add action`, `Save`, action editor `Save`) |
| Conduct | `pages/admin/conduct/MonitoringRules.tsx` (`Run now`, `New rule`, `Edit`, `Save`) |
| Registration Forms | `pages/admin/RegistrationFormBuilder.tsx` + `components/registration-builder/RegistrationFormBuilderEditor.tsx` (Create/Add-Doc/Add-Decl/Preview/Update/Add Step) |
| Complaints | `pages/complaints/ComplaintsList.tsx` (`Analytics`, `New Complaint`, `File Complaint`) |
| Profile / Session | `pages/Profile.tsx` (`Save Changes`, `Change Photo`, `Manage sessions`, `Sign out of all other sessions`) |
| Prudential Taxonomy | `pages/prudential/PrudentialTaxonomyAdmin.tsx` (`New category`, `Edit`, `Deactivate`, `Reactivate`) |
| Supervision Breaches | `pages/supervision/BreachInbox.tsx` (`Ack`, `Escalate`, dialog `Acknowledge`, `Create enforcement case`) |
| Fit-and-Proper | `pages/fpa/{FpaFindings,FpaMonitoring}.tsx`, `pages/fit-and-proper/FitAndProperIndividualDetail.tsx` (`Review`, `Manage`, `Acknowledge`, `Trigger Event`, `Run cycle scheduler`, `Add role`, `Save role`, `Save`) |
| Workflows | `components/workflows/{ActionNotificationsEditor,StepActionsEditor}.tsx` (`Add Notification`, `Edit`, `Save`, `Add Action`, `Replace`, `Download`, `Upload Signature`) |
| Reports | `pages/reports/components/AdHocReportBuilder.tsx` (`Save Template`, `Generate Report`, `Load`, dialog `Save`) |
| Permissions Catalog | `pages/admin/PermissionCatalogTab.tsx` (`Module`, `Action`, both dialog `Save`) |

## Batch 2 — automated line-anchored insertion (90 buttons)

Bulk-annotated via `scripts/annotate` for stability across a wide fanout of small dialogs:

- Applications: `RaiseRfiDialog`, `SufficiencyPanel`, `TwinPeaksPanel`, `WorkflowActionPreviewDialog`, `ApplicationUploadPanel`, `LicenseConditionsPanel`, `documents/versioned/VersionedDocumentUploader`.
- Complaints: `ComplaintDetail`, `escalations/EscalationQueueTable`, `ComplaintAcknowledgement`, `ComplaintEvidenceRow`, `ComplaintInvestigationTab`, `duplicates/DuplicatePairDrawer`.
- Entities: `entity-detail/{Enforcement,Inspections,Reinsurance,Relationships,RiskRatings,LicensingAudit,ProductsChannels}Tab`.
- Fit-and-Proper: `FitAndProperIndividuals`, `InvitationTracker`, `FpaAiAnalysis`, `FpaDeclarations`, `FpaScreening`, `FpMonitoringPanel`, `AutoScreeningRulesTab`.
- Prudential: `ActionsList`, `AssessmentDetail`, `EscalationsList`, `StressIndicatorsAdmin`, `returns-mgmt/{ManageValidations,PrudentialRatios,PrudentialThresholds}`.
- Returns/Entity: `entity/returns/ViewReturnPage` (`Edit & Resubmit`, `Request Edit`, `Submit Request`), `dashboard/ReturnCard`, `dashboard/LicenseeDashboard`, `dashboard/cards/LicenseStatusList`.
- Correspondence & Conduct: `correspondence/{IntakeForm,SendCorrespondenceDialog}`, `conduct/EvidenceRepositoryPanel`.
- Master Data: `admin/{MasterDataImportDialog,MasterDataItemsImportDialog}`.
- Reports: `pages/reports/components/ReportPreviewDialog`.
- Collaborative Review: `collab-review/CollabReviewConfigTab`.
- Form Renderer / Form Builder: `form-renderer/FormRenderer` (`Upload`, `Add Row`, `Add Another Entry`, `Submit`), `form-builder/{FieldProperties,SectionManager}`.

## Coverage result

```
before slice 19: 617/1036 protected (59.6%)
after  slice 19: 825/1036 protected (79.6%)
```

## Per-category floors (Slice 19)

CI now fails if any of these categories drops below 100 % coverage:

`Delete · Approve · Reject · Assign · Escalate · Publish · Archive · Export · Import · Issue · Reopen`

Current state (from scanner):

| Category | Coverage |
|---|---|
| Delete / Approve / Reject / Assign / Export / Import / Issue / Reopen / Configure / Publish / Print / View / Close | **100 %** |
| Action | 85 % |
| Upload | 73 % |
| Edit | 71 % |
| Download | 69 % |
| Create | 64 % |
| Save | 49 % |
| Workflow | 44 % |

## Test wiring (`src/test/rbac/actionCoverage.test.ts`)

- Retains Slice 17 regression guards (Return Queue Export + Return Detail Approve/Reject/Analysis/Compare).
- Retains Slice 17 “zero critical unguarded” assertion.
- **New**: per-category floor test for destructive/export categories (100 % required).
- Overall baseline lifted from 55 % → **75 %**.

## Next slice candidates

- Extend scanner to `DropdownMenuItem`, `MenuItem`, `ContextMenuItem`, and blob-URL exporters (`URL.createObjectURL`, `saveAs`, `printJS`, `xlsx.write*`).
- Sweep the remaining `Save`/`Create`/`Workflow` categories (currently 49 % / 64 % / 44 %) to lift overall to ≥ 90 %.
- Correlate every annotated `data-rbac` marker with `has_permission` calls on the backend RPC/RLS side, so the frontend marker matches the SQL check.
