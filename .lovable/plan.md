## Goal

Refresh `FRD_Gap_Tracker.xlsx` so it reflects the delivered state of Licensing Appeals and Form Builder Version History. No code changes.

## Changes to the tracker

Produce a new version of the workbook (`FRD_Gap_Tracker_v2.xlsx`) in the documents area, preserving all existing sheets, formatting and the other 101 rows unchanged.

**Requirement Tracker sheet**

1. `LIC-APL-001` — Licensing Appeals (post-refusal appeal lodging & tracking)
   - Status: Missing -> **Done**
   - Severity / Effort / Phase: set to `-`
   - Evidence: `license_appeals` + appeal-event tables with RLS and generated appeal references; `public.reinstate_application_after_appeal` RPC; applicant `LodgeAppealDialog.tsx`, `LicenseAppealPanel.tsx`, `/appeals` My Appeals page with 30-day window and withdraw confirmation; regulator register at `/admin/license-appeals` with Consider/Decline decision dialog and reopen-application retry; upheld appeals reopen the refused application at its last workflow step with audit trail, appeal timeline and applicant notification.
   - Gap Detail: None. Note that no formal appeal-panel hearing/scheduling model exists — deliberately de-scoped to keep the decision flow simple.

2. `ADM-FB-005` — Form Builder Version History
   - Screen / Requirement text: drop ", rollback" -> **"Form Builder — Version History (compare versions)"**
   - Status: Partial -> **Done**
   - Severity / Effort / Phase: set to `-`
   - Evidence: `src/components/form-builder/VersionHistory.tsx` and `VersionDiffViewer.tsx` — version list, side-by-side attribute-level field diff, working "Show unchanged" toggle, publish/upcoming version notifications.
   - Gap Detail: None. Rollback confirmed out of scope by the business — not a requirement.

**Summary Dashboard sheet**

- Recompute the Done / Partial / Missing counts and any percentage-complete figures to account for the two status changes.
- Update the Licensing row commentary: remove "No licensing appeals;" so it reads only about the analyst workbench, legal review screen and decision letter.

**Delivery Plan sheet**

- Phase 1 "Licensing completeness": remove `LIC-APL-001` from the requirement list and reword the description/exit criteria so appeals are described as delivered, leaving decision letters and the analyst/legal queues as the open items.

## Verification

Reopen the generated workbook, print the two changed rows plus the recomputed summary counts, and confirm every other row is byte-identical to the original before handing the file over.
