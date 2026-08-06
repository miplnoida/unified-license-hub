# PRU-PAY-001 — Payment Systems Oversight (Operator Register & PFMI Dashboard)

Build the missing Payment Systems Oversight sub-module inside Prudential Supervision, following the exact patterns already used by Onsite Examinations (PRU-EXM-001): dedicated tables with RLS, permission helper functions, a hook layer, and a tabbed workspace page. No existing module behaviour changes.

## What gets built

### 1. Operator register (FMIs & Payment System Operators)
- Register of payment system operators / FMIs, each optionally linked to an existing supervised entity (licensee) so the operator profile links back to the entity page.
- Operator type: ACH, RTGS, Card Network, E-Money, MSB, CBDC, Other.
- Table columns per FRD: Operator Name, Type, License Status, Last PFMI Assessment Date, PFMI Compliance Level (Observed / Broadly observed / Partly observed / Not observed), Open Incidents, Actions.
- Add / edit operator dialog, status filters and search.

### 2. PFMI principle-by-principle assessment
- Reference catalogue of the 24 CPMI-IOSCO PFMI principles, plus an applicability map per operator type (auto-applied when an assessment starts, still editable).
- "Start PFMI Assessment" creates an annual assessment with one row per applicable principle.
- Step-by-step wizard: per principle capture self-assessment score, regulatory score (override), narrative, and evidence attachments (existing secure storage/document pattern).
- Completion is blocked until every applicable principle has a regulatory score (FRD validation), then the summary observance level is computed with RAG colouring.
- Immutable audit events: PFMI_ASSESSMENT_INITIATED, PFMI_ASSESSMENT_COMPLETED.
- Non-observance (Partly / Not observed) surfaces a "Recommend supervisory action" path into the existing prudential actions ledger — reusing `CreatePrudentialActionDialog`, not a new ledger.

### 3. PFMI observance dashboard
- Observance heatmap: operators (rows) × PFMI principles (columns), coloured by latest regulatory score.
- Summary tiles: operators assessed vs overdue (annual cycle), observance distribution, open incidents, late notifications.
- Principle-level weakness ranking across the sector.

### 4. Operator incident reporting
- Incident register: incident type, operator, affected transactions/value, severity, occurrence datetime, notification-received datetime, resolution datetime, resolution status.
- SLA rule R-PRU-026: notification window is configurable (default 2 hours). On record/update, a late notification is flagged and an SLA breach record is created, with a supervisor notification via the existing notification event pipeline.
- Resolve-incident action with audit events INCIDENT_RECORDED / INCIDENT_RESOLVED.

### 5. Supporting tabs
- **Money Service Businesses**: MSB operators (subset of the register by type) with active agent count, AML compliance status, and last return submitted read from existing returns data; row action opens the return in the existing return review screen. No new return engine.
- **Retail Payments Data**: aggregate volumes/values by payment type with trend charts and single-operator concentration share, computed from operator-reported retail payments figures captured in the register/returns data that exists. Where no source data exists yet, the tab shows an explicit empty state rather than mock numbers.

## Access control
- New permission actions under the existing `prudential_supervision` module (view / create / edit / workflow_action / delete) mirroring examinations, so R-10 Payment Systems Supervisor can act while R-09/R-13 get read access via existing role templates.
- `can_read_payment_oversight` / `can_act_on_payment_oversight` security-definer helpers, RLS enabled with explicit GRANTs on every new table. Licensee/external users get no access.

## Navigation
- Sidebar: "Payment Systems" under Prudential Supervision, after Onsite Examinations.
- Routes: `/prudential/payment-systems` (tabbed register), `/prudential/payment-systems/:operatorId` (operator profile + assessments + incidents), `/prudential/payment-systems/assessments/:assessmentId` (PFMI wizard), all guarded by the module gate.

## Technical notes
- Migration adds: `payment_system_operators`, `pfmi_principles`, `pfmi_principle_applicability`, `pfmi_assessments`, `pfmi_assessment_principles`, `payment_system_incidents`, `payment_oversight_audit_events`, plus a config row for the incident notification SLA window. Each table: CREATE → GRANT → ENABLE RLS → POLICY, with `created_at`/`updated_at` and touch triggers.
- RPCs: `pfmi_start_assessment`, `pfmi_save_principle`, `pfmi_complete_assessment` (validation + audit), `payment_incident_record`, `payment_incident_resolve` (SLA breach + notification).
- Frontend: `src/hooks/usePaymentSystems.ts`; pages under `src/pages/prudential/`; panels under `src/components/prudential/payments/` (OperatorTable, OperatorDialog, PfmiAssessmentWizard, PfmiObservanceDashboard, IncidentsPanel, MsbRegisterPanel, RetailPaymentsPanel).
- Seed the 24 PFMI principles and the standard applicability matrix per operator type.

## Verification before reporting done
- pgTAP-style SQL checks for RLS on each new table, the "all applicable principles assessed" gate, and the late-notification SLA breach path.
- Typecheck plus a browser pass through the register, assessment wizard completion, observance dashboard, and incident record/resolve flow with a signed-in internal user.
