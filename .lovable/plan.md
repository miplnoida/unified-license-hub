# Appeal Panel — Internal-user identity for panel members

## What the inspection actually found

Verified in the code, not assumed:

- `AppealPanelMembersDialog.tsx` already selects members from the internal-staff directory (`useInternalUsers({ activeOnly: true })`) and stores `user_id` (profile ID) via `savePanelMember`. It does **not** use a regulator dropdown for member identity.
- The only regulator dropdown is on the panel master in `LicenseAppealPanels.tsx` (`regulator_id`), used for jurisdiction/scoping and eligibility filtering on referral — genuinely jurisdictional, so it stays.
- The referral snapshot RPC (`assign_appeal_panel`) already stores `member_id`, `user_id`, `full_name`, `email`, `member_role`, `is_chair`, `is_voting`, `vote_weight` in `member_roster`, and chair uniqueness plus quorum are enforced server-side.

So there is no regulator/person mix-up in the stored data. The real gaps are display-level: emails are never shown, the member list omits email/status, and the regulator field is ambiguously labelled "Regulator".

## Changes (frontend/presentation only)

### 1. `src/components/appeals/AppealPanelMembersDialog.tsx`
- Selector option label becomes `Full Name — email@example.com` (falls back to email alone when no name), keeping email as the sublabel so search by name **and** email keeps working through the existing combobox filter.
- Active-member rows show: Name, Email, Panel role, Voting / Non-voting, Vote weight (voting only), Effective From / To, and an Active badge. No raw UUIDs.
- Past-member rows show name, email, role and a "Stood down" badge.

### 2. `src/pages/admin/LicenseAppealPanels.tsx`
- Rename the regulator field label and table column to **Panel jurisdiction / Regulator**, with a one-line hint that it scopes the panel, not its people. No behaviour or data change.

### 3. `src/components/appeals/AppealPanelSection.tsx`
- Snapshot roster lines render name, email (from the snapshot, so historical evidence stays intact), panel role, chair badge, non-voting marker.

## Not touched

Backend RPCs, snapshot structure, chair-uniqueness constraint, quorum/voting counts, hearing, decision, dissent, reinstatement, notifications, audit, RLS, permissions.

## Verification

Typecheck, relevant tests, then a runtime pass in the running app: open a panel, add a member from the dropdown (confirm `Name — Email`), search by name and by email, save and reopen, set a chair and confirm the server blocks a second one, then confirm an appeal's constituted panel shows the real people with emails. Results reported as a PASS/FAIL table; anything not exercisable end-to-end is reported as not verified rather than claimed.
