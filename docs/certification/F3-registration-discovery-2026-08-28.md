# F3 — REGISTRATION DISCOVERY (Track A)

- **Discovery HEAD:** `1df5d45fac492c143bd53952253e84829c018942`
- **Date (UTC):** 2026-08-28
- **Predecessor freeze:** F2 certified/frozen at `b0ff1947676d0a07db1474fbf0498b3d0b8be0cc`
- **Mode:** DISCOVERY ONLY — no remediation, migration, refactor or configuration change was performed. All live probes were run inside transactions that were rolled back.

---

## 1. Boundary applied

- **F2 owns:** account → identity → entity → authority → onboarding handoff (`onboarding_registration_handoff_ready`).
- **F3 (this pass) owns:** from "applicant/entity eligible to enter Registration" through the registration decision (`registrations.status`).
- **F4 owns:** licensing applications, licences, licensees.

Boundary finding recorded up front: **F3 does not own a clean handoff to F4.** A *draft `applications` row is created at registration submission time* (`supabase/functions/register-pre-licensee/index.ts:369-447`), i.e. before any registration review or decision. Licence/licensee creation happens later in the F4 application workflow (`perform_final_workflow_approval` → `approve-pre-licensee`), and **registration approval itself creates nothing downstream** (`perform_registration_workflow_transition_internal` only flips `registrations.status`).

---

## 2. Architecture and data model (actual, from source + live DB)

### 2.1 Canonical registration record

`public.registrations` — canonical. Key columns:

| Column | Note |
|---|---|
| `id` | PK |
| `user_id` | NOT NULL, links auth user (RLS anchor) |
| `status` | `text`, **default `pending_verification`**, **no CHECK constraint** |
| `registration_reference` | UNIQUE, default `generate_registration_reference()` |
| `registration_number` | nullable, **no uniqueness**, **NULL in 4/4 live rows** (applicant-supplied company number, deduped only in edge code) |
| `email_verified` | default `false`; edge intake writes `true` unconditionally |
| `sector_id` / `sub_sector_id` / `category_id` | taxonomy for config + F4 prefill |

### 2.2 Satellite tables (F3 estate, 14 registration-prefixed + onboarding tables)

- `registration_entity_bindings` — 1:1 registration → entity (`binding_status`, live: 3× `BOUND_PROVISIONAL`).
- `registration_journey_types` — governed journey catalogue (FORM_FIRST, ENTITY_FIRST; 2 enabled).
- `registration_journey_events` — append-only journey ledger (13 rows).
- `registration_form_configs` — 2 rows, 1 active, 1 default (inline `form_schema` JSONB, declarations, document types, OTP/CAPTCHA/visibility flags).
- `registration_form_submissions` — **0 rows** (declared model for update/resubmission flow, never populated).
- `onboarding_journey_state` (1), `onboarding_resolution_tokens` (1, hash-only per F2), onboarding audit ledgers (append-only).
- `otp_verifications`, `captcha_verifications` — intake controls.
- Workflow: `approval_workflows` / `approval_steps` / `workflow_instances` / `approval_actions` (`entity_type='registration'`).

### 2.3 Surface coverage manifest

**Public routes** (`src/routes/publicRoutes.tsx`): `/register` (decision page → `RegistrationJourneyChoice`), `/register/applicant` (FORM_FIRST, `PreLicenseeRegistration`), `/register/entity` (ENTITY_FIRST, `EntityIdentification`), `/register/account` (`UserAccountStep`), `/register/authority-pending`, `/register/legacy` (alias), `/registration/pre-licensee` (redirect), `/registration/success`, `/registration/portal`, `/update-registration-form[…]`, `/registration/update/:id`.

**Staff routes** (`src/routes/adminRoutes.tsx`): `/admin/registration-review`, `/admin/registration-review/:registrationId`, `/admin/registration-forms`, `/admin/registration-forms/preview`. Applicant gate landing: `/registration-status`.

**Components/hooks/services:** `src/components/registration/*` (17), `src/components/registration-builder/*` (5), hooks `useRegistrationApprovalStatus`, `useRegistrationConfig`, `useRegistrationForm`, `useRegistrationJourneys`, libs `registrationStatus`, `registrationAccess`, `registrationWorkflowClient`, `registrationUpdateFlow`, `registrationEmail*`, `registrationItemVisibility`, `registrationPreview`, `registrationDisplayTypes`.

**Edge functions:** `register-pre-licensee` (public intake), `perform-registration-workflow-action` (gated `registration_management.workflow_action`), `approve-pre-licensee` (gated `registration_management.approve`), `send-registration-otp`, `verify-registration-otp`, `get-licensee-registration`, `public-registry`, `dispatch-notification-event`.

**DB functions/triggers:** `generate_registration_reference()`, `resolve_registration_workflow()`, `start_registration_workflow()`, `tg_registration_after_insert_start_workflow`, `perform_registration_workflow_transition[_internal]`, `get_registration_reviewer_remarks`, `trg_notify_registration_state`, `trg_registration_approved_notification`, `onboarding_form_first_resolve_service`, `onboarding_registration_handoff_ready`, `check_applicant_name_exists`, `check_primary_user_email_exists`.

**Tests:** 10 vitest suites (`registrationAccess`, `registrationStatus`, `registrationApprovalGate`, `registrationWorkflowClient`, `registrationTwoRouteArchitecture`, `registrationEmail*`, `registrationSectionVisibility`, `onboardingAuditGuardrails`), `approve-pre-licensee/authz_test.ts`, `supabase/tests/onboarding/01_form_first_resolution.sql`. **No e2e spec and no pgTAP suite covers the registration decision state machine.**

---

## 3. Actual state machine

```text
F2 handoff (authority APPROVED + ORGANIZATION party)
   │
   ├─ /register (journey catalogue)
   │     ├─ FORM_FIRST  → /register/applicant
   │     └─ ENTITY_FIRST → /register/entity (token, EARLY resolution)
   │
   ▼ register-pre-licensee (public edge fn)
   CAPTCHA → OTP → dedupe (email/username/registration_number/applicant_name)
   → auth user create → INSERT registrations (status HARD-CODED 'pending_review',
     email_verified=true) → generate_registration_reference()
   → onboarding_form_first_resolve_service (bind entity / resolution case)
   → seed_external_portal_defaults
   → CREATE DRAFT applications ROW   ← premature F4 record (best-effort try/catch)
   → AFTER INSERT trigger: start_registration_workflow → workflow_instances(step 1)
   → notification: registration.submitted / registration.received
   │
   ▼ staff intake  /admin/registration-review (+ detail)
   perform-registration-workflow-action → perform_registration_workflow_transition
   entry guard: status IN ('pending_review','in_progress','resubmission_required')
   actions: approve | reject | send_back | escalate | request_resubmission
            | return_for_correction | request_more_info | save_comment
   │
   ├─ approve (non-final step) → 'in_progress', advance step
   ├─ approve (final step)     → 'approved'  → trg_registration_approved_notification
   ├─ reject                   → 'rejected'
   └─ request_resubmission     → 'resubmission_required'
                                 → applicant /registration/portal, /update-registration-form
   │
   ▼ approved
   RegistrationApprovalGate allows portal entry (registrationAccess.ts)
   NO downstream creation. F4 continues from the draft applications row created at step 1.
```

Transition mapping (UI → permission → RPC → state → history → notification):

| UI action | Permission | Backend | State written | History | Notification |
|---|---|---|---|---|---|
| Submit registration | public (CAPTCHA+OTP) | `register-pre-licensee` | `registrations` + binding + draft application + workflow instance | `registration_journey_events`, `approval_actions` | `registration.submitted` |
| Approve / Reject / Send back / Resubmission / Escalate / More info / Comment | `registration_management.workflow_action` | `perform-registration-workflow-action` → `perform_registration_workflow_transition` | `registrations.status`, `workflow_instances.current_step_id` | `approval_actions` | per-action dispatch, `registration.approved` |
| View review queue/detail | `registration_management.view` | direct table reads (staff RLS) | — | — | — |
| Resubmit | applicant (own row) | direct `registrations` UPDATE from client | `registrations` (**unrestricted columns**) | none guaranteed | none guaranteed |
| Withdraw | **absent** | **absent** | — | — | — |

---

## 4. Persona / permission matrix (live, probed)

| Persona | Read own reg | Read others | Write status | Workflow action | Delete |
|---|---|---|---|---|---|
| `anon` | no | no | no | no | no |
| applicant / pre_licensee (`authenticated`) | yes (1 row visible) | no (0 rows) | **YES — self-approve succeeded (1 row updated)** | denied (`WRONG_APPROVER`, HTTP 403) | no grant |
| super_admin / admin / supervisor / licensing_officer | yes (all) | yes | yes | yes (both steps require **super_admin**) | no DELETE grant |
| `service_role` | full | full | full | full | full |

Probe evidence (all rolled back):
- `P1 self_approve_rows = 1` — applicant set own `status='approved'`.
- `P2 visible_registrations = 1` — row-level scoping correct for SELECT.
- `P3` — `registration_entity_bindings` SELECT raised `42501 permission denied` with hint `GRANT SELECT … TO authenticated` although a SELECT policy exists → dead read path.
- `P4 applicant_can_mutate_submitted_data = 1` — applicant edited `applicant_name` on a `pending_review` row.
- `P5` — `perform_registration_workflow_transition` correctly refused (`WRONG_APPROVER`).
- `P6` — applicant successfully executed `start_registration_workflow(<id>)` (SECURITY DEFINER, no authz guard).
- `check_applicant_name_exists` is EXECUTE-able by `anon` and returns existence of *any* registration name (enumeration oracle).

Privilege census on `public.registrations`: `authenticated` = SELECT, INSERT, UPDATE (no DELETE/TRUNCATE/REFERENCES/TRIGGER); `anon` = none; `service_role` = ALL. Column-level grants: none (whole-row UPDATE).

---

## 5. Workflow / service / form mappings

- Exactly **one** active registration workflow: `Registration Workflow` (`aceb712a-…`), regulator-scoped, `sector_id = NULL`, 2 steps.
  - Step 1: approve/reject/request_resubmission/send_back — approver role **super_admin**.
  - Step 2: approve/reject/send_back — approver role **super_admin**.
- `resolve_registration_workflow(NULL)` falls back to this workflow — no sector/journey differentiation exists.
- All 4 live registrations have exactly 1 workflow instance; 3 have 2 `approval_actions`, 1 (`REG-2026-000050`, `pending_review`) has 0.
- Form configs: 1 active/default config drives all journeys; config specificity scoring is duplicated in client (`useRegistrationConfig.ts:138-149`) and server (`register-pre-licensee/index.ts:58-68`).
- `registration_form_submissions` has 0 rows while `registrationUpdateFlow.ts` reads it → update/resubmission flow reads an unpopulated model.

---

## 6. Contracts

**F2 → F3:** `onboarding_registration_handoff_ready` requires ORGANIZATION party binding + `APPROVED` membership authority; blocker surfaces at `/register/authority-pending`. Journey catalogue read from `registration_journey_types` (anon-readable).

**F3 → F4:** No governed contract. Two de-facto couplings:
1. Draft `applications` row created at *submission* (premature, best-effort, unguarded by registration outcome).
2. Licence/licensee/user provisioning occurs entirely inside the F4 application workflow (`perform_final_workflow_approval` → `approve-pre-licensee`), independent of `registrations.status`.

Consequence: a **rejected** registration can still leave a usable draft application; an **approved** registration produces no licensing artefact.

---

## 7. Privilege / RLS posture summary

- RLS enabled on all F3 tables inspected; `anon` holds no DML on registration tables.
- Policy/grant mismatch (dead read paths): `registration_entity_bindings`, `registration_journey_events` — SELECT policies present, `authenticated` grant absent (proved by probe).
- `registrations` grants `UPDATE` on all columns to `authenticated` with policy `auth.uid() = user_id` and **no column restriction, no state guard, no BEFORE trigger** → privilege escalation and post-submission tampering.
- No DELETE grant on `registrations` for `authenticated`; deletion/relinking is possible only via `service_role`/superuser. Relinking `user_id` to another user is blocked by the policy WITH CHECK.
- SECURITY DEFINER exposure: `start_registration_workflow` executable by `authenticated` without authorization check.

---

## 8. Gap register

Classification: **PG** = product gap, **DR** = data remediation, **BC** = business configuration.

| ID | Sev | Class | Finding | Evidence |
|---|---|---|---|---|
| GAP-F3-01 | **Critical** | PG | Applicant can set own `registrations.status='approved'`, bypassing the workflow and satisfying `RegistrationApprovalGate` (and firing `registration.approved` notification). | probe P1; `authenticated` UPDATE grant + owner policy; no CHECK/trigger guard |
| GAP-F3-02 | **Critical** | PG | `get-licensee-registration` authz gate is unreachable — `requireUserPermission` sits inside the `OPTIONS` branch after `return`; the handler then only tests for a non-empty `Authorization` header and reads `registrations` with the service-role client. Any bearer string returns a full registration row. | `supabase/functions/get-licensee-registration/index.ts:85-100`, `:30` |
| GAP-F3-03 | **High** | PG | No status domain integrity: `registrations.status` is free `text` with no CHECK; competing vocabularies (backend 6 values, `registrationStatus.ts` ~20 synonyms, `trg_notify_registration_state` legacy `correction_required`/`changes_requested`/`resubmitted`, `registration_form_submissions` own set). | live column metadata; `src/lib/registrationStatus.ts:18-30`; trigger body |
| GAP-F3-04 | **High** | PG | Applicant can mutate submitted registration payload (`applicant_name`, taxonomy, contact) at any state, including `pending_review`/`approved`, with no audit event. | probe P4 |
| GAP-F3-05 | **High** | PG | Premature F4 record: draft `applications` row created during registration intake, independent of registration outcome; no compensating action on reject/withdraw. | `register-pre-licensee/index.ts:369-447` |
| GAP-F3-06 | **High** | PG | No withdrawal/cancellation transition anywhere (RPC, UI, vocabulary). Lifecycle is not closable by the applicant. | `perform_registration_workflow_transition_internal` action set; UI action set |
| GAP-F3-07 | **High** | PG | Grant/policy mismatch blocks legitimate applicant reads of `registration_entity_bindings` and `registration_journey_events` (RLS designed, grant missing). | probe P3 (`42501` + PostgreSQL hint) |
| GAP-F3-08 | **Medium** | PG | `start_registration_workflow` (SECURITY DEFINER) executable by any authenticated user for any registration id — no ownership/permission check. | probe P6 |
| GAP-F3-09 | **Medium** | BC | Both approval steps require `super_admin`; `licensing_officer`/`supervisor` cannot act despite holding `registration_management.workflow_action`. No sector/journey-specific workflow, no maker/checker or decision-authority rule bound to registration. | `approval_steps` for `aceb712a-…`; probe P5 diagnostic |
| GAP-F3-10 | **Medium** | PG | `registration_form_submissions` is read by the update/resubmission flow but never written (0 rows) — declared model not wired. | live count; `src/lib/registrationUpdateFlow.ts` |
| GAP-F3-11 | **Medium** | PG | `registration_number` has no uniqueness constraint and no generator; dedupe exists only in edge code and is bypassable by direct client UPDATE. NULL in 4/4 rows. | column metadata; `register-pre-licensee/index.ts:227-236` |
| GAP-F3-12 | **Medium** | PG | No duplicate-registration control: a user may hold multiple registrations (no unique index on `user_id`/active status); dedupe is intake-only. | index census |
| GAP-F3-13 | **Medium** | PG | `status` default (`pending_verification`) is never used — intake hard-codes `pending_review` and forces `email_verified=true`, so the verification state is unreachable while OTP enforcement lives only in edge code. | `register-pre-licensee/index.ts:314-320` |
| GAP-F3-14 | **Low** | PG | `check_applicant_name_exists` is `anon`-executable and discloses existence of any applicant name (enumeration oracle). | privilege probe |
| GAP-F3-15 | **Low** | PG | Dead/orphaned screens: `src/pages/PreLicenseeDashboard.tsx`, `src/pages/billing/PreLicenseeBilling.tsx` unrouted; `/register/legacy` and `/registration/pre-licensee` shims retained. | route grep |
| GAP-F3-16 | **Low** | PG | Duplicated config-specificity scoring and password policy between client and edge function (drift risk); password never validated server-side. | `useRegistrationConfig.ts:138-149` vs `register-pre-licensee/index.ts:58-68`; `useRegistrationForm.ts:83` |
| GAP-F3-17 | **Low** | PG | No e2e/pgTAP coverage of the registration decision state machine (only unit tests over helpers). | test census |
| GAP-F3-18 | **Low** | DR | `REG-2026-000047` (approved) has no `registration_entity_bindings` row — the F2-recorded item. Recurrence is possible because binding creation is a best-effort call inside intake and is not enforced by constraint or gate. | live join; intake try/catch |
| GAP-F3-19 | **Low** | DR | `REG-2026-000050` sits in `pending_review` with 0 `approval_actions` (aged queue item, no intake/assignment record). | live counts |

No evidence was found that applicants can delete registrations, act cross-entity, or approve via RPC — those controls hold.

---

## 9. Maturity score

| Dimension | Score /5 | Basis |
|---|---|---|
| Data model & canonical record | 3 | single canonical table, but no status domain, no uniqueness on `registration_number`, unwired submissions model |
| Lifecycle completeness | 2 | no withdrawal, verification state unreachable, resubmission model unpopulated |
| Authorization & RLS | 1 | self-approval + payload tampering + unreachable edge gate |
| Workflow governance | 2 | single super_admin-only 2-step workflow, no decision authority/maker-checker |
| Audit & history | 3 | `approval_actions` + journey events exist; applicant-side edits unaudited |
| F2/F4 contracts | 2 | F2 in-bound governed; F4 out-bound premature and ungoverned |
| Test/verification coverage | 2 | unit tests only; no state-machine gate |
| **Overall** | **2.1 / 5** | remediation-ready, not certifiable |

---

## 10. Recommended remediation order (F3-B)

1. **GAP-F3-01 / GAP-F3-04** — remove applicant write authority over lifecycle/payload: revoke blanket `UPDATE`, route applicant edits through a governed RPC with state guard + audit, add `status` transition trigger.
2. **GAP-F3-02** — relocate `requireUserPermission` in `get-licensee-registration`; add an authz test mirroring `approve-pre-licensee`; extend `verify:edge-authz` to detect unreachable gates.
3. **GAP-F3-03 / GAP-F3-13** — canonicalise the status vocabulary (CHECK or enum), retire legacy trigger branches and unreachable frontend synonyms, decide `pending_verification` semantics.
4. **GAP-F3-07 / GAP-F3-08 / GAP-F3-14** — grant/policy alignment and definer-guard hardening.
5. **GAP-F3-05 / GAP-F3-06** — define the F3→F4 contract: create licensing records only on registration approval, and add withdrawal.
6. **GAP-F3-09** — configure registration decision authority (step roles, maker/checker) as business configuration.
7. **GAP-F3-10 / GAP-F3-11 / GAP-F3-12 / GAP-F3-16** — wire or retire the submissions model, add integrity constraints, de-duplicate shared rules.
8. **GAP-F3-17** — add `verify:f3b` gate + e2e coverage of the state machine.
9. **GAP-F3-18 / GAP-F3-19** — data remediation with recurrence prevention (binding enforced at intake).

---

## 11. Impact assessment against frozen F0–F2

- **F0:** remediation of GAP-F3-02/08/14 touches `verify:edge-authz`, `anon-execute` and `definer-guards` gates — additive assertions only; no frozen assertion is invalidated.
- **F1:** GAP-F3-09 is configuration inside the governed config framework (`config_change_log`); registration workflow already appears in service-completeness reporting.
- **F2:** GAP-F3-18 shares the binding/authority path owned by F2 but is remediated on the F3 side (intake enforcement); F2 invariants (hash-only tokens, ORGANIZATION bindings, orphan profiles) are untouched.
- No frozen HEAD is modified by this discovery pass.

---

## Final verdict

**F3 READY FOR CONTROLLED REMEDIATION**

Stopping here — no remediation performed, F4 not started.
