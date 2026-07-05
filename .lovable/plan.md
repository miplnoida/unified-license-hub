## Add "Audit" tab to Licensee Detail

A new tab on `/admin/licensees/:id` that opens a licensing audit view for the entity. Read-only trace across existing data, plus three write actions (final determination, generated risk profile, auto-created supervisory plan). No existing tab or module is touched.

### 1. New tab wiring — `src/pages/admin/LicenseeDetail.tsx`
- Add tab entry `{ id: 'audit', label: 'Audit', icon: <Gavel or ClipboardCheck> }` — inserted between **Supervisory Plan** and **Web Users**, so operational order stays intact.
- Lazy-load new component `LicensingAuditTab` and render inside `<TabsContent value="audit">` guarded by `loadedTabs.has('audit')`.
- No changes to other tabs, headers, or the shared licensee loader.

### 2. New component — `src/components/entity-detail/LicensingAuditTab.tsx`
Four stacked sections inside one Card layout:

1. **Trace timeline — Risk → Judgement → Conflict → Resolution** (read-only)
   - **Risk**: latest rows from `risk_ratings` for this `entity_id` (overall_rating, score, dated).
   - **Judgement**: latest supervisor assessments — merge from `prudential_assessments` and `conduct_investigations` filtered by entity, showing type, verdict/finding, reviewer.
   - **Conflict**: rows from `coordination_flags` + `twinpeaks_disagreements` for this entity (issue, raised_by, status).
   - **Resolution**: rows from `coordination_escalations` (resolution_notes/status) and any closed conflicts.
   - Rendered as a vertical timeline; each item links to the source module where one already exists (Inspections / Risk / Enforcement etc.).

2. **Final determination** (write)
   - Form: `verdict` (select: Approve / Approve with conditions / Refer / Refuse), `rationale` (textarea), `effective_date`, optional linked `risk_rating_id`.
   - Persists to new table `licensing_audit_determinations` and lists prior determinations for this entity below the form.
   - "Issue determination" writes an `audit_logs` entry (`action = 'licensee.audit.determination_issued'`) — reuses existing audit logging pattern; no schema change.

3. **Supervisory risk profile** (generate + view)
   - Button "Generate risk profile" runs client-side aggregation over the latest N `risk_ratings` + open `enforcement_actions` + open `coordination_flags` for the entity, producing `{ profile_score, tier, key_drivers[], generated_at }`.
   - Persists snapshot to new table `licensing_audit_risk_profiles` (one row per generation, latest shown at top). Displays as a compact score card + drivers list.

4. **Initial supervisory plan & corrective actions** (auto-create, uses existing tables — no new schema)
   - Button "Auto-create initial supervisory plan" — enabled once a final determination and a generated risk profile exist.
   - Inserts one row into existing `supervisory_plans` (`entity_id`, `created_from = 'audit'`, `status = 'draft'`, `risk_rating_id` = latest, `notes` = "Auto-generated from Licensing Audit determination <id>").
   - Inserts a small set of default rows into existing `supervisory_plan_actions` driven by the risk-profile tier (e.g. High → quarterly review + targeted inspection + condition review; Medium → semi-annual review; Low → annual review). Titles/descriptions are static templates in the component; owner_role defaults to `supervisor`, due dates offset from today.
   - After creation, shows an inline link "Open in Supervisory Plan tab" that switches `activeTab` to `supervisory`. Does not modify `SupervisoryPlanTab`.

### 3. Database migration (Lovable Cloud)
Two new tables, both scoped to internal staff. Follows the standard grants + RLS pattern.

- `public.licensing_audit_determinations` — fields: `entity_id` (FK licensees), `verdict`, `rationale`, `effective_date`, `risk_rating_id` (nullable FK), `issued_by`, `issued_at`.
- `public.licensing_audit_risk_profiles` — fields: `entity_id` (FK licensees), `profile_score` (int), `tier` (low/medium/high/critical), `key_drivers` (jsonb), `snapshot` (jsonb of inputs), `generated_by`, `generated_at`.

Grants: `SELECT/INSERT/UPDATE/DELETE` to `authenticated`, `ALL` to `service_role`. RLS enabled. Policies:
- `SELECT` for `admin`, `super_admin`, `supervisor`, `licensing_officer`, `analyst`, `legal_compliance` (via `has_role`).
- `INSERT`/`UPDATE` for `admin`, `super_admin`, `supervisor`, `licensing_officer`.
- No policy for external/licensee users → invisible to entity portals.
Standard `updated_at` trigger on both tables.

### 4. Scope guardrails
- No changes to `SupervisoryPlanTab`, `RiskRatingsTab`, `EnforcementTab`, `InspectionsTab`, coordination modules, or the `get-licensee-registration` edge function.
- Auto-plan creation reuses existing `supervisory_plans` / `supervisory_plan_actions` tables so the Supervisory Plan tab immediately reflects the new plan without extra wiring.
- No new edge function; all reads/writes go through the standard client with RLS enforcing role gates.
- Licensee/external users see no new UI; the Audit tab is admin-portal-only (route is already under `/admin/*`).
