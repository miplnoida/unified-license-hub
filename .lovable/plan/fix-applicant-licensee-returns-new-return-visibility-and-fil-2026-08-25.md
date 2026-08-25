# Fix Applicant/Licensee Returns “New Return” visibility and filing flow

## Verified findings

- `/entity/returns` already mounts the canonical `EntityReturnsWorkspace`; `/entity/returns/dashboard` mounts `EntityReturnsDashboard`.
- The route guard for Returns is read-only (`can_view_status`) and intentionally lets authenticated external users open the page. It is not the blocker.
- The `+ New Return` buttons already exist in the workspace and dashboard, but the workspace depends on `useMyApprovedMemberships()` and disables the action until an `entityId` is selected. If no `APPROVED` entity membership is returned, the page shows a membership message instead of the action.
- Current backend Returns configuration is present for all 9 active sectors: each has 2 published return templates, 2 active rules, Annual + Quarterly definitions, and 2025/2026 periods for entities with obligations.
- Apex Commercial Bank has active obligations and 5 periods for 2025 plus 5 periods for 2026.
- Entity membership roles are configured with the expected capabilities: Primary/Authorized/Filing User can prepare and submit; Preparer can prepare; Viewer can view only.
- Duplicate filing protection exists through a unique index on `return_filings.reporting_period_id`.

## What I will fix

### 1. Make entity context reliable for Returns

Unify the entity source used by the Returns page and the sidebar so the user’s selected/eligible entity is consistently resolved from approved entity memberships, PPOC context, and the active licence entitlement context.

Expected result: a user with an approved entity membership and eligible licence lands on `/entity/returns` with the correct entity selected automatically.

### 2. Keep `+ New Return` visible, but action-aware

Adjust the Returns workspace so the `+ New Return` entry point remains visible whenever the user can access the Returns workspace. It will:

- open normally when there is an approved membership and selected entity;
- show the existing membership message when there is no approved membership;
- show the licence/configuration message when no eligible filing option exists;
- show a read-only message for Viewer-only users.

This keeps page visibility separate from filing authorisation.

### 3. Strengthen the wizard empty states

Update the `NewReturnDialog` empty states so users can distinguish:

- no approved entity membership;
- approved membership but no eligible/issued licence;
- eligible licence but no configured obligations/periods;
- view-only role;
- already submitted return.

No filing will be created unless the existing server-side `returns_open_filing(_period_id)` approves it.

### 4. Refresh after filing creation

After Start/Continue opens a filing, invalidate the Returns option/calendar/summary queries so “My Returns” immediately reflects the newly opened draft.

### 5. Minimal backend check only if needed

No Returns configuration migration is planned because the audit shows active-sector templates, definitions, rules, periods, and duplicate protection already exist. I will only add a backend migration if verification exposes a concrete missing grant/function behaviour while testing.

## Technical details

Files expected to change:

- `src/pages/entity/returns/canonical/EntityReturnsWorkspace.tsx`
- `src/components/entity/returns-canonical/NewReturnDialog.tsx`
- `src/hooks/useEntityReturns.ts` if a small shared entity-selection helper is needed
- `src/hooks/useLicenseEntitlements.ts` or `src/components/layout/Sidebar.tsx` only if the sidebar lock is confirmed to use the wrong active entity context

Server-side guarantees stay unchanged:

- `returns_new_return_options` remains the read model for valid dropdown choices.
- `returns_open_filing` remains the only way to start/resume a filing.
- `returns_entitlement_ok`, `can_act_on_license`, RLS, and duplicate filing constraints remain authoritative.

## Verification

I will verify:

1. `/entity/returns` shows `+ New Return` for an approved member.
2. Single-entity users are auto-selected.
3. The wizard shows sector, year, return type, and quarter from backend options.
4. Annual 2025/2026 and Q1-Q4 2025/2026 appear for Apex Commercial Bank / International Banks mapping.
5. Starting a return creates or reuses one draft and navigates to the filing workspace.
6. Viewer-only users can see Returns but cannot start a filing.
7. No-membership and no-eligible-licence users see contextual messages rather than Access Denied.
