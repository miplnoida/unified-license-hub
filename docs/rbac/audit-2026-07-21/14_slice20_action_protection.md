# Slice 20 — Action Protection Sweep Round 4

**Result:** Overall coverage lifted **79.6% → 89.8%** (930 / 1036 mutation buttons annotated).

## What changed

1. Authored a batch annotation script (`scripts/rbac-annotate-slice20.mjs`, temporary) that:
   - Reads the current `scanRepo()` gap set.
   - Infers `module.action` from filepath using a rules table (applications → `application_management`, entity-detail → `license_management`, payments → `fee_management`, workflows → `workflow_management`, correspondence → `settings`, coordination → `coordination`, compliance/returns → `returns_management`, fit-and-proper → `fit_and_proper`, form-builder & registration-builder → `form_management`, admin/conduct → `market_conduct`, admin/returns → `returns_management`, admin/user & regulator/ppoc/employee → `user_management`, notification templates → `notification_management`, license action forms → `license_management`, etc.).
   - Maps category → action (`Create → create`, `Save/Upload/Edit/Workflow → edit`, `Download → view`, etc.).
   - Rewrites `<Button` occurrences on the reported lines to `<Button data-rbac="module.action"` in-place.
2. Ran the script twice — first over destructive/mutation categories, then over the generic `Action` bucket. Together this annotated **~106 buttons across 86 file edits**.
3. Removed the temp script; the change set is the annotations themselves.

## Coverage by category (post-Slice 20)

| Category | Coverage |
|---|---:|
| Delete / Approve / Reject / Assign / Escalate / Publish / Archive / Export / Import / Issue / Reopen / Configure / View / Print | **100%** |
| Edit | 96% |
| Download | 92% |
| Create | 89% |
| Upload | 100% |
| Action | 90% |
| Workflow | 78% |
| Save | 70% |
| Submit | 62% |

Remaining gaps concentrate in three buckets we intentionally left for a later slice: (a) public/onboarding flows (Login, PreLicenseeRegistration, DeclarationsStep, DocumentsStep, RegistrationStepRenderer) which are pre-auth by design, (b) UI-infra shims (`components/ui/carousel`, `ErrorBoundary`), and (c) the `Save` category (in-form save buttons where the enclosing page already owns the module gate — cosmetic gap, not a security gap).

## Test enforcement

`src/test/rbac/actionCoverage.test.ts`:

- Overall baseline raised **75 → 85%** (actual: 89.8%).
- All 11 destructive/export categories keep their **100% hard floor**.
- Return Queue Export / Approve / Reject / Analysis / Compare assertions still pass.
- All 5 assertions green: `930/1036 protected (89.8%)`.

## Deferred to Slice 21

- Extend the scanner to `DropdownMenuItem`, `ContextMenuItem`, and blob-URL exporters (`URL.createObjectURL`, `saveAs`, `printJS`) so those call sites appear in the coverage denominator.
- Sweep the `Save` and `Submit` categories to bring them above 90%.
- Add per-category hard floor for `Edit` (currently 96%, easily 100% after remaining 1 site is annotated).
