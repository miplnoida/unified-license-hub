# Fix: Oversized buttons in Complaint Detail → Actions tab

## Scope
File: `src/pages/complaints/ComplaintDetail.tsx` (Actions tab, ~lines 466–593). UI-only change.

## Problem
Several action buttons currently span full card width (`className="w-full"`), which looks stretched inside the narrow right-column Actions panel:
- Take Investigation
- Mark Resolved (`flex-1`) + Close (icon-only sized)
- Close Complaint (resolved state)
- Link Licensee
- Open Enforcement Case

## Change
Replace `w-full` with natural-width, right-aligned action rows so buttons size to their content:

1. **Triage → Take Investigation**: wrap in `<div className="flex justify-end">` and drop `w-full`; add `size="sm"`.
2. **Resolve card**: keep the two buttons side-by-side but right-aligned (`flex justify-end gap-2`), remove `flex-1` from Mark Resolved, use `size="sm"` on both.
3. **Resolved → Close Complaint**: right-aligned, `size="sm"`, no `w-full`.
4. **Escalate to Enforcement**:
   - Link Licensee button: remove `w-full`, right-align, keep `size="sm"`.
   - Open Enforcement Case: remove `w-full`, right-align, `size="sm"`.
   - Leave the licensee search Popover trigger at full width (it's a combobox input, not an action).

No changes to mutations, permissions, layout of other tabs, or business logic.

## Verification
Visual check in preview at `/complaints/:id` → Actions tab across states (submitted, under_investigation, resolved, unlinked-licensee).
