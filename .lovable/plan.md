
## Answer to each question (current state)

**1. End-to-end correspondence lifecycle (receipt → assignment → review → approval → response → closure with audit trail)** — **Partially. Only outbound sending exists today** (`SendCorrespondenceDialog`, `correspondence_dispatches`, `correspondence_templates`). There is no inbound intake, no assignment queue, no review/approval steps dedicated to correspondence, and no closure/lifecycle state machine. Audit trail exists at platform level but is not surfaced for a correspondence case.

**2. Auto-capture, classify, and route by configurable rules with manual override** — **No.** Nothing captures inbound letters/emails, no classification engine, no routing rules table, no manual reassignment UI.

**3. Document/records management for correspondence (versioning, attachments, search, retention, historical retrieval)** — **Partial.** Generic document management exists (Supabase Storage + `document_versions`), and per-record correspondence history is shown in `CorrespondenceHistory`. But there is no correspondence-scoped records center with search, filters, retention schedule display, or version history for a correspondence item.

**4. Dashboards for volumes, workload, aging, response performance, bottlenecks** — **No.** Reports module is generic; no correspondence-specific KPIs, aging buckets, SLA/response metrics, or bottleneck views.

## What I will build (UI only — no schema, no backend logic)

New route group `/correspondence/*` with mock/seed data driving the screens. All existing modules and functionality remain untouched.

### New files

```
src/pages/correspondence/
  CorrespondenceDashboard.tsx      # KPIs, aging, SLA, bottlenecks (Q4)
  CorrespondenceInbox.tsx          # Intake queue + filters + manual assign (Q1, Q2)
  CorrespondenceDetail.tsx         # Lifecycle tabs: Overview / Review / Approval / Response / Audit (Q1)
  CorrespondenceRecords.tsx        # Records center: search, versions, retention, history (Q3)
  RoutingRulesAdmin.tsx            # Admin: classify/route rules + manual override toggle (Q2)
  types.ts                         # Local UI types & mock data
  seed.ts                          # Mock correspondence cases

src/components/correspondence/
  LifecycleStepper.tsx             # Receipt → Assigned → Under Review → Approved → Responded → Closed
  IntakeForm.tsx                   # Capture inbound (channel, sender, subject, attachment)
  ClassificationPanel.tsx          # Auto-classified badges + manual override select
  AssignmentPanel.tsx              # Assigned unit/officer + reassign dialog
  ReviewApprovalPanel.tsx          # Comments, approve/reject, e-sign placeholder
  ResponseComposer.tsx             # Wraps existing SendCorrespondenceDialog patterns (read-only mock send)
  AuditTrailPanel.tsx              # Renders a mock audit timeline
  RecordsSearchBar.tsx             # Full-text search UI + filter chips
  RetentionBadge.tsx               # Shows retention schedule and expiry
  VersionHistoryList.tsx           # Attachment version list
  MetricsCards.tsx                 # Volume, workload, aging, response %, bottlenecks
  AgingBuckets.tsx                 # 0-3 / 4-7 / 8-14 / 15+ days
```

### Wiring

- `src/routes/dashboardRoutes.tsx`: register 5 lazy routes under `/correspondence/*` and `/admin/correspondence-routing`.
- `src/config/navigation.tsx`: add a **Correspondence** sidebar entry with children *Dashboard*, *Inbox*, *Records*.
- `src/pages/admin/AdminHub.tsx`: add tile *Correspondence Routing Rules* next to existing *Correspondence Templates*.

### Scope guardrails

- No DB migrations, no edge functions, no changes to `correspondence_dispatches`, `correspondence_templates`, or `SendCorrespondenceDialog` behavior.
- All data mocked in `seed.ts`; components are pure presentational, using shadcn primitives and existing tokens.
- Existing per-record `CorrespondenceHistory` on applications/complaints/etc. remains as-is.

### Technical details

- Lifecycle states modeled in `types.ts` as a TS union: `'received' | 'classified' | 'assigned' | 'in_review' | 'approved' | 'responded' | 'closed'`.
- Aging computed client-side from mock `received_at` timestamps.
- Dashboard uses existing Recharts setup (bar for volume-by-week, stacked for aging, table for bottleneck steps).
- Search is client-side filter over mock records (no FTS wiring).
- Route guards mirror existing admin pattern (`PermissionGate` where used elsewhere).

### Verification

- Typecheck passes.
- All new routes render with mock data.
- No changes to existing tests; add a light smoke test only if trivial.
