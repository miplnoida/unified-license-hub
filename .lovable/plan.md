## Problem

On the admin Return Detail page, the top-right **History** button opens a drawer that:

1. **Shows nothing** — it queries `audit_logs` with `entity_type = "return_filed"`, but return audit rows are stored under `entity_type = "return"` (and richer data lives in `return_audit_log` + `approval_actions`).
2. **Renders raw JSON** via `DiffViewer` (before/after JSON blobs), which is unreadable for non-technical reviewers.

The inline "Activity & History" card in the sidebar already renders friendly rows from `return_audit_log`; the drawer should match that experience.

## Fix

### 1. Wire the History drawer to the correct return data source
Replace the empty `audit_logs` fetch with the same unified source already used by the sidebar:
- `return_audit_log` (labels, status transitions, comments, event keys)
- `approval_actions` (workflow decisions, actor, remarks)
- Merge chronologically, newest first.

Sidebar and drawer will show the same events, but the drawer gives a full-height, filterable view.

### 2. Render events as normal data, not JSON
Each event row will show:
- **Action label** (e.g. "Return Submitted", "Resubmission Requested", "Approved by Legal Compliance") — resolved via existing `labelForReturnActivity` / `auditLabels`.
- **Actor** (name + role) instead of a UUID.
- **When** (localized date/time).
- **Status change** as `Draft → Submitted` chips, not JSON.
- **Comments / reason** as plain paragraph text.
- **Field changes** (when present in `old_value` / `new_value`): rendered as a simple two-column list —
  `Field name : old value → new value` — with keys title-cased through a small formatter (reusing the pattern in `src/lib/evidenceLabel.ts`), numbers formatted with thousands separators, dates localized, booleans as Yes/No. No `<pre>` / JSON blocks.
- Deeply nested objects (rare) collapse behind a "Show details" toggle rather than dumping JSON inline.

### 3. Scope
- Changes are limited to the returns module. Other entities keep the current `ChangeHistoryDrawer` untouched.
- No schema or RLS changes — data already flows through `get_return_revisions` / existing audit tables.

## Files touched

```text
src/pages/returns-mgmt/ReturnDetail.tsx          swap HistoryButton for a
                                                  return-specific drawer trigger
src/components/audit/ReturnHistoryDrawer.tsx     NEW – merges return_audit_log
                                                  + approval_actions, human-readable
src/components/audit/FriendlyDiff.tsx            NEW – key/value pretty renderer
                                                  (title-case keys, formatted values,
                                                  no JSON)
src/lib/auditLabels.ts                           add any missing return action labels
```

## Verification

- Open the return currently on screen (`/admin/returns/queue/53f814f3-…`); click **History** — drawer lists submission, resubmission-request, resubmit, workflow approvals, edits.
- Confirm no `{ }` / JSON blocks appear; field-level edits show as "Total Assets: 4,999.99 → 5,120.00".
- Sidebar "Activity & History" card continues to work unchanged.
- Other entity History buttons (application, license, licensee) are unaffected.