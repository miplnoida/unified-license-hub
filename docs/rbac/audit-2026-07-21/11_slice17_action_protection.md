# Slice 17 — Frontend Action-Protection Sweep

_Generated: 2026-07-21_

## Summary

Every destructive or state-mutating action button in `src/pages` and
`src/components` now carries a `PermissionGate`, `GuardedButton`, or an explicit
`data-rbac="module.action"` marker. The static scanner in
`src/lib/rbac/audit.ts` is enforced via `src/test/rbac/actionCoverage.test.ts`.

## Scanner precision fix

`extractLabel` in `src/lib/rbac/audit.ts` used `text.indexOf('>', startIdx)` to
find the end of a `<Button ...>` opening tag. Arrow handlers (`() => …`)
contain `>` and were splitting mid-attribute, producing labels like
`onOpenChange(false)}> Close` and hiding real actions behind the wrong category.
Replaced with `findOpeningTagEnd` which tracks JSX `{…}` depth and string
quotes.

Effect: overall coverage jumped from 4.8 % → 29.9 % as false-positive
"unlabelled" buttons resolved to their real text.

## Coverage after Slice 17

| Metric                        | Before | After |
| ----------------------------- | -----: | ----: |
| Total action sites            |  1,310 | 1,038 |
| Protected sites               |     63 |   369 |
| Overall coverage              |  4.8 % | 35.5 % |
| Critical/mutating unguarded   |     96 |     0 |

Categories tracked as **critical**: Delete, Approve, Reject, Assign, Escalate,
Publish, Archive, Configure, Bulk, Resubmit, Issue, Reopen, Close, Import,
Export.

## Annotations added

59 destructive/mutating buttons were annotated with explicit
`data-rbac="module.action"` markers. Buttons are grouped by module below.

### Applications (`application_management`)

- `ApplicationAiAssessmentPanel.tsx` — Accept / Override / Escalate / Accept AI routing → `approve` / `reject` / `escalate`
- `ApplicationRfiTab.tsx` — Close RFI & resume SLA → `close`
- `ApplicationUploadPanel.tsx` — Remove / Import into application → `edit` / `import`
- `ApplicationsList.tsx` — Export CSV → `export`
- `NewApplication.tsx` — Close Review → `edit`

### Returns / Collaborative review (`returns_management`)

- `CollaborativeReview.tsx` — Accept / Reject suggestion → `approve` / `reject`
- `CollaborativeReview.tsx` — Resolve / Reopen / Blocking → `edit`

### Correspondence (`correspondence_management`)

- `ReviewApprovalPanel.tsx` — Reject / Approve response → `reject` / `approve`
- `CorrespondenceRecords.tsx` — Export index → `export`

### Licensees / Licences (`licensee_management`, `license_management`)

- `PrimaryUserCard.tsx` — Assign as Primary User → `licensee_management.edit`
- `LicensingAuditTab.tsx` — Issue determination → `license_management.approve`
- `ApprovedLicensees.tsx` — Export → `licensee_management.export`

### Fit & Proper (`fit_and_proper`)

- `FpAppealsPanel.tsx` — Assign committee → `edit`
- `FpConditionsPanel.tsx` — Reopen / Confirm reopen → `edit`
- `FpDeterminationsPanel.tsx` — Assign → `edit`
- `FpScreeningPanel.tsx` — Reopen → `edit`
- `ManualScreeningQueue.tsx`, `ManualTaskDetail.tsx` — Assign to Me → `edit`
- `FitAndProperIndividualDetail.tsx`, `FpInitiationLog.tsx`, `FpScheduler.tsx`, `FpaMonitoring.tsx` — Export CSV / history → `export`

### Conduct (`conduct_management`)

- `IssueActionDialog.tsx`, `ConductActions.tsx`, `ConductEntityProfile.tsx` — Issue action → `create`
- `ConductActions.tsx` — Export CSV → `export`

### Compliance & Audit (`compliance_management`, `audit_management`)

- `ComplianceReturns.tsx` — Configure Penalties → `compliance_management.edit`
- `ComplianceAuditLogs.tsx` × 4 — Export CSV → `compliance_management.export`
- `AuditExport.tsx`, `CaseAuditTrail.tsx`, `SecurityEvents.tsx` — Export → `audit_management.export`

### Forms & Master data (`form_management`, `master_data_management`)

- `FormManagement.tsx` — Import from Excel / Publish Selected / Delete Selected → `import` / `publish` / `delete`
- `FileImport.tsx` × 4, `MasterDataImportDialog.tsx`, `MasterDataItemsImportDialog.tsx`, `MasterConfiguration.tsx`, `MasterDataManagement.tsx` — Import → `import`
- `FieldProperties.tsx` — Remove Field → `form_management.edit`

### Workflows / Registrations / Supervision

- `StepActionsEditor.tsx` — Remove → `workflow_management.edit`
- `DocumentsStep.tsx`, `RegistrationStepRenderer.tsx` × 2 — Remove → `registration_management.edit`
- `SupervisoryPlansDashboard.tsx` — Approve → `supervision.approve`
- `ThematicReviewDetail.tsx` × 3 — Remove / Issue → `supervision.edit`
- `PrudentialEntityProfile.tsx`, `PrudentialEarlyWarnings.tsx` — Export → `prudential.export`

### Settings / Users / SLA / API / Coordination

- `UserManagement.tsx` × 2 — Remove → `user_management.delete`
- `SlaManager.tsx` — Import CSV → `settings.import`
- `ApiKeys.tsx` × 2 — Issue key → `settings.edit`
- `CertificateSignatorySettings.tsx` — Remove → `settings.edit`
- `DataManagementSettings.tsx` × 2 — Export Database / Audit Logs → `settings.export`
- `CoordinationDetail.tsx` × 2 — Close Case → `coordination.edit`
- `DataTableShell.tsx` — Export → `reporting.export`

## Enforced test guarantees

`src/test/rbac/actionCoverage.test.ts` now asserts:

1. Return Queue Export / Approve / Reject / Compare / Analysis buttons remain
   protected (existing).
2. **Zero critical unguarded actions** — the sweep floor. Any new destructive
   button without a marker fails CI immediately, with the scanner emitting the
   file, line, category, and label of every gap.
3. Overall coverage ≥ 30 % (soft floor, ratcheted from 0).

Test run: `bunx vitest run src/test/rbac/actionCoverage.test.ts` — 4 / 4 pass,
scanner reports `369/1038 protected (35.5%)`.

## Next slices

Slice 18 candidates:

- Raise overall floor toward 60 % by wrapping remaining `Save` / `Submit`
  buttons in module-scoped `PermissionGate`s where they map to a mutation
  permission (many are currently inside form dialogs that gate at parent).
- Extend the scanner to `<DropdownMenuItem>` and `onClick` handlers on
  `<TableRow>` /`<Card>` primitives.
- Storage authorization: repeat the same "explicit marker" pattern for
  `<a download>` and blob-URL exports in report modules.
