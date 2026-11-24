# Gap closure plan — OLRAS (PM review, 24 Nov 2026)

Gaps below come from earlier reviews, the roadmap and monitoring findings. Each phase ends with a browser check by the right role (not only Super Admin) and a short evidence note.

## Phase 1 — Security and access (highest risk)
1. Backend enforcement of post-licence access: pre-licensee/applicant accounts must be refused when saving a post-licence request (today only the screen blocks them).
2. Direct-URL block for Complaints for licensees (menu is hidden, address bar is not).
3. Portal capability check ignores the institution passed in — review and fix (possible cross-institution access). Needs owner go-ahead (currently "documented only").
4. Subscription package: hide/refuse backend actions for disabled modules, not just menus; unknown modules should default to off.
5. File uploads: connect a malware scanner provider and scheduled worker (54 files stuck "pending scan").

## Phase 2 — Application and licensing lifecycle
1. Apply the staged "Under Review" status guard and deploy verify-and-submit (awaiting approval).
2. Allow draft save while "returned for correction" (staged migration ready).
3. Primary user should see their institution's pre-licence applications (on hold by owner).
4. Dashboard: stop counting "in progress" drafts as Submitted (owner decision).
5. Post-licence workflows: publish the active-but-unpublished workflows.
6. Prove key-person approvals update the institution's appointments register.
7. Credit Union renewal service missing; re-queue 17 dead-lettered provisioning jobs.
8. New-user access requests: add the provisioning step after approval; browser-test reviewer/decider and Primary User change.

## Phase 3 — Supervision data and modules
1. Prudential assessment figures, ratings and supervisory plan for Rodney Bay (owner decides who enters).
2. Examinations, findings and corrective actions reachable for supervisor roles.
3. Return periods predating the licence date — correct obligation start dates.
4. Data integrity: 6 licence/sector mismatches, 72 of 91 entities without lead regulator.
5. Methodology question edit overwriting options (#4) and returns config registry (#8) — recheck.
6. AML/CFT: frozen (AML-CLOSE-08). Nothing done without separate owner instruction.

## Phase 4 — Reporting
1. Reconcile Reports Overview, dashboards and Board Pack populations (one definition per KPI).
2. Open each of the 46 reports in-app with real data; add institution names to Findings report.
3. Upload official FSRC logo via Settings → Branding and check PDF/Excel/preview.
4. Executive AI briefing generation end-to-end check.

## Phase 5 — Release readiness
1. Role-based browser matrix: primary user, returns officer/supervisor, prudential, complaints, F&P, admin.
2. Fix remaining Playwright failures (Complaints, Inspection).
3. Security scan clean, then publish and smoke-test live site.
4. SMTP replacement credential and mailbox delivery proof (SEC-CRED-01 still conditional).

## Decisions needed from you
- Approve Phase 1 item 3 and the on-hold application visibility item.
- Who enters prudential figures (Phase 3.1).
- Draft counting rule (Phase 2.4) and scanner provider choice.

## Technical notes
- DB authorization changes are shown as exact SQL for approval before applying, per prior instruction.
- Each rule change gets a regression test (rolled-back SQL or Vitest).
- roadmap.md updated as items close.
