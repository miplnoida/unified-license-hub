
## Returns Management Module — Implementation Plan

This is a very large module. I'll implement it in phases to ensure quality and avoid breaking existing functionality.

---

### Phase 1: Database Foundation
Create all 14 new tables with proper RLS policies, enums, and constraints:
- `return_types`, `return_configurations` (new version), `return_configuration_forms`
- `returns`, `return_form_data`, `return_documents`, `return_comments`
- `return_audit_log`, `return_requests`, `return_due_dates`
- `return_cutoff_config`, `late_fee_structures`, `late_fee_penalty_tiers`
- `return_notification_templates`, `return_notifications`
- Seed data for all tables

### Phase 2: Admin Pages (A1–A8)
- A1: Return Types CRUD
- A2: Return Configurations with form assignment UI
- A3: Cutoff Configuration
- A4: Due Date Generation & Management
- A5: Late Fees with penalty tiers
- A6: Notification Templates with token editor
- A7: Notification Log
- A8: Schedule Calendar view

### Phase 3: Entity/Licensee Pages (E1–E5)
- E1: Entity Returns Dashboard
- E2: My Returns list
- E3: Create New Return wizard
- E4: Fill Return Form (dynamic tabbed form with auto-save)
- E5: View Return (read-only with status banners)

### Phase 4: Regulator Pages (R1–R5)
- R1: Regulator Returns Dashboard with charts
- R2: Returns Queue with tabs
- R3: Review Return with comments & approve/reject
- R4: Request History
- R5: Entity Return Profile

### Phase 5: Reports & Navigation
- RP1: Returns Summary Report
- RP2: Overdue Returns Report
- RP3: Compliance Report
- Sidebar navigation updates for all roles

---

### Key Decisions
- **Existing tables**: The current `return_configurations` and `compliance_returns` tables will be replaced/superseded by the new schema
- **Form integration**: Will use existing `form_templates` + `form_fields` tables for field rendering
- **Workflow statuses**: TEMP → WIP → SUB → VAL/TBR cycle enforced in code
- **Storage**: Return documents stored in existing `secure-documents` bucket

### ⚠️ Important Notes
- This will be implemented across multiple messages due to size
- Each phase will be fully functional before moving to the next
- I'll start with Phase 1 (database migration) and need your approval before proceeding

Shall I proceed with Phase 1?
