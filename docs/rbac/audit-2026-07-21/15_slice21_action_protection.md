# Slice 21 — DropdownMenuItem Scanner + Save/Submit Sweep

**Result:** Overall coverage **89.8% → 91.9%** (958 / 1043 sites). Denominator grew from 1036 → 1043 as new call-site kinds entered the audit.

## Changes

1. **Scanner extension** (`src/lib/rbac/audit.ts`): added a third pass that discovers `<DropdownMenuItem>` sites, extracts their label the same way as `<Button>`, honours `data-rbac="module.action"` markers, and applies the existing `PUBLIC_ALLOW_LABELS`/`PUBLIC_ALLOW_PATTERNS` allow-list for navigation items ("Open detail", "Profile", "Sign out").
2. **Save/Submit batch** (temp script, removed): annotated 21 buttons across 20 files in entity-detail tabs, application/return submission flows, settings pages, complaint escalation admin, market-conduct investigation detail, and notification preferences. Every match used a filepath-inferred `module.action` (e.g. settings/* → `settings.edit`, entity-detail/* → `license_management.edit`, ApplicationForms → `application_management.edit`).
3. **DropdownMenuItem annotations**: added `data-rbac` on the three mutating dropdown items — `ApplicationsList` "New Pre-Licensee Application" and "New Post-Licensee Application" (`application_management.create`), `ComplaintsList` "Reprint acknowledgement" (`complaint_management.view`) and "Run / retry triage" (`complaint_management.edit`).

## Category state (post-Slice 21)

| Category | Coverage |
|---|---:|
| Submit / Delete / Approve / Reject / Assign / Escalate / Publish / Archive / Export / Import / Upload / Issue / Reopen / Configure / View / Print | **100%** |
| Edit | 96% |
| Save | 93% |
| Download | 92% |
| Action | 90% |
| Create | 90% |
| Workflow | 78% |

## Test enforcement

`src/test/rbac/actionCoverage.test.ts` now runs **6 assertions**:

- Overall baseline lifted **85 → 88%** (actual 91.9%).
- All 11 destructive/export categories retain their **100% hard floor**.
- **New:** `Submit` category locked at 100%.
- Return Queue Export / Approve / Reject / Analysis / Compare assertions still pass.

All green: `958/1043 protected (91.9%)`.

## Deferred to Slice 22

- Extend scanner to `ContextMenuItem` and to blob-URL export helpers (`URL.createObjectURL`, `saveAs`, `printJS`) as sink-level audit rows.
- Push `Workflow` (78%) and `Action` (90%) categories to 100%.
- Add hard floor for `Edit` and `Save` once remaining sites are annotated.
