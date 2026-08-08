# Fix "That panel has no active chair" on appeal referral

## What is actually happening

The error is genuine, not a bug in the check. Referral requires the panel to have one active chair, and the only panel that exists today has no chair:

- Panel "License panel appeal - Panel A": 3 active members, 3 voting, **0 chairs**, quorum 3.
- One older member row is marked chair but is inactive (stood down), and standing a member down clears the chair flag.

Root cause of how panels end up chair-less: the panel create/edit dialog appoints every selected person as a plain `member` — it has no chair field at all. A chair can only be set afterwards in the separate Composition dialog, which is easy to miss. So a freshly created panel is always ineligible for referral, and the referral screen only reveals this after the action fails, with no guidance on how to fix it.

## What to build

### 1. Chair becomes part of panel setup
- Add a **Chair** picker to the New/Edit appeal panel dialog, choosing from the members selected on that panel.
- Block save with a clear message when an active panel has members but no chair.
- On save, appoint the chosen person as chair (`member_role = chair`, chair flag set) and demote any previous chair to member, respecting the one-chair-per-panel rule.

### 2. Editing a panel no longer silently drops the chair
- When re-saving a panel, keep existing members' roles, chair status, vote weights and dates intact; only add newcomers, stand down removals, and apply an explicit chair change.

### 3. Referral screen tells the truth up front
- In "Refer to a panel", show each panel's readiness inline (chair appointed / chair missing, voting members vs quorum).
- Disable referral for panels that cannot be constituted and explain what is missing, with a pointer to Appeal Panels → Composition, instead of surfacing a failure after submit.
- Keep the server-side chair and quorum checks exactly as they are — they stay the final authority.

### 4. Composition dialog nudge
- Keep the existing "no chair" warning, and add a one-click **Make chair** action on active members so fixing an existing panel takes one step.

## Existing data

No data is rewritten automatically. Once the chair field ships, Panel A's chair must be picked by an admin (Panel A currently has 3 members, so any of them can chair it).

## Technical notes

- Frontend: `src/pages/admin/LicenseAppealPanels.tsx` (chair picker + non-destructive member sync), `src/components/appeals/AppealPanelMembersDialog.tsx` (Make chair action), `src/components/appeals/AppealPanelSection.tsx` (per-panel readiness in the referral select).
- Membership readiness comes from the existing `useAllLicenseAppealPanelMembers` hook, so no new queries are needed for the referral screen.
- Chair promotion reuses `savePanelMember`, which already derives the chair flag from the role; demotion of the previous chair happens in the same save so the unique active-chair index is never violated.
- No change to `assign_appeal_panel`, its error codes, or the immutable panel snapshots.

## Verification

- Create a panel without choosing a chair — save is blocked with an explanation.
- Create a panel with a chair, then refer an appeal with a complete case file — referral succeeds and the snapshot lists the chair.
- Set a chair on Panel A from Composition, re-save the panel from the list, and confirm the chair survives the edit.
