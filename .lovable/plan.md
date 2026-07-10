## Goal
Consolidate the sidebar by moving "Complaints" and "Complaint Types" out of the standalone "Complaints" group and into the existing "Market Conduct" group.

## Change
Edit `src/config/navigation.tsx`:

1. Remove the standalone `Complaints` group (lines ~114–118) that contains:
   - Complaints (`/complaints`)
   - Complaint Types (`/admin/complaint-types`)

2. Insert both items into the `Market Conduct` group at the top of its `items` array (before Conduct Dashboard), preserving their existing `roles`, `module`, `icon`, and `adminOnly` flags exactly as-is.

Resulting Market Conduct group order:
```text
- Complaints
- Complaint Types
- Conduct Dashboard
- Conduct Alerts
- Conduct Actions
- Conduct Entities
- Investigations
- Thematic Reviews
- Risk Taxonomy
- Products & Channels
- Triage Rules
- Monitoring Rules
```

## Notes / Side effects
- The Complaints item keeps its broader role list (licensee_primary, licensee_secondary, pre_licensee, applicant). This means those external users will now see a "Market Conduct" group in the sidebar containing only Complaints (other Market Conduct items remain internal-only via `ALL_INTERNAL`). Group label visibility is driven by whether any child is visible, so the group will render for them with just Complaints inside.
- No route, permission, or backend changes. Pure navigation reorganization.

## Out of scope
- Renaming the Market Conduct group.
- Changing role/module visibility rules.
- Any page-level UI changes.
