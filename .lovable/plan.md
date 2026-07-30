## Goal

Make the admin appeal screen a simple yes/no call: **does the regulator consider this appeal or not** — no panels, no acknowledge step, no five outcome types.

## What changes (UI only — no backend/schema change)

### 1. Appeal detail dialog (`AppealActionsDialog.tsx`)
Replace the three stacked action blocks (Acknowledge / Refer to panel / Record outcome) with a single decision card:

```text
Decide on this appeal
[ Reason / remarks ......................... ]
[ Consider appeal ]   [ Decline appeal ]
```

- **Consider appeal** → records outcome `upheld` (shown as "Appeal considered") with the remarks.
- **Decline appeal** → records outcome `dismissed` (shown as "Appeal declined") with the remarks.
- Both use the existing `recordDecision` mutation, so history, notifications and audit stay intact.
- Remarks required (short minimum) before either button is enabled; confirmation prompt before submitting.
- Remove panel selector, hearing date, acknowledge button, and the outcome dropdown from this screen.
- Keep the read-only summary (reference, grounds, relief sought, dates) and the appeal history timeline.

### 2. Register page (`LicenseAppealsRegister.tsx`)
- Stat cards reduce to three: **Total**, **Pending decision**, **Decided**.
- Status filter reduces to: All / Pending decision / Considered / Declined / Withdrawn.
- Drop the "With appeal panel" card and column clutter; keep ref, lodged date, deadline, grounds, status, outcome.

### 3. Labels (`src/lib/licenseAppeals.ts`)
- Plain-English labels: `submitted`/`under_review`/`panel_review` all display as **Pending decision**; `upheld` → **Appeal considered**; `dismissed` → **Appeal declined**.
- Keep the remaining legacy values mapped so existing records still render correctly.

## Not touched

- Database tables, RPCs, RLS, notifications, applicant-side lodging/withdrawal flow.
- The Appeal Panels admin page stays available at its own route (unused by the simplified flow) unless you want it removed too.

## Technical note

Permission checks stay as-is; the decision buttons render under the existing `license_appeals.decide` permission, and `license_appeals.assign_panel` is simply no longer used on this screen.
