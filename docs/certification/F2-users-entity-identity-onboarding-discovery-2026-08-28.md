# F2-A — USERS, ENTITY IDENTITY & ONBOARDING — DISCOVERY

**Track:** A (Enterprise Foundation Certification)
**Pass:** F2-A — Discovery, Coverage & Enterprise Gap Register
**Mode:** DISCOVERY ONLY — no remediation performed in this pass
**Date:** 2026-08-28
**Discovery HEAD:** `46759237b89a13dc61cdfe6ed13c2a922d4564d6`
**Frozen upstream contracts:** F0 (certified/frozen), F1 (certified/frozen at `51165012696fadebb531ed35bb770f6f994282d9`) — not modified

---

## 1. Method

Evidence was taken from the **live database** and the **actual source tree** only. No assumption
was carried forward from prior narrative documents.

| Probe class | Technique |
| --- | --- |
| Table/routine estate | `pg_tables`, `pg_proc`, `information_schema.columns` |
| Canonical truth | `pg_constraint` foreign-key target tracing |
| Data integrity | direct row census + orphan/duplicate joins |
| Privilege contract | `has_table_privilege` census + **empirical negative probe** (`SET LOCAL ROLE anon` inside a rolled-back transaction) |
| RLS coverage | `pg_class.relrowsecurity` + `pg_policies` |
| Route truth | `src/routes/publicRoutes.tsx`, `adminRoutes.tsx`, `dashboardRoutes.tsx` |
| UI↔backend binding | `rg` census of `.rpc(...)`/`.from(...)` call sites vs DB routines/tables |

---

## 2. F2 estate map

### 2.1 Canonical entity truth

Foreign-key tracing is unambiguous: **`public.licensees.id` is the canonical entity key** for the
entire F2 estate. Every identity/onboarding linkage table points at it:

```text
entity_identifiers.entity_id            -> licensees(id)
entity_user_memberships.entity_id       -> licensees(id)
entity_user_access.entity_id            -> licensees(id)
entity_identity_snapshots.entity_id     -> licensees(id)
entity_resolution_cases.resolved_entity_id -> licensees(id)
entity_merges.survivor/absorbed         -> licensees(id)
onboarding_journey_state.entity_id      -> licensees(id)
registration_entity_bindings.entity_id  -> licensees(id)
ppoc_entity_mappings.licensee_id        -> licensees(id)
```

The RDM party layer sits *beside* it, not above it:

```text
parties(id) <- organizations(party_id) <- licensees(party_id)   [optional, ON DELETE RESTRICT]
parties(id) <- persons(party_id)
```

### 2.2 Live census

| Object | Rows | Note |
| --- | --- | --- |
| `licensees` | 54 | canonical entity table |
| `licensees` with `party_id` bound | 25 | **29 unbound** |
| `organizations` | 25 | matches bound count exactly |
| `parties` (ORGANIZATION) | 25 | all have an `organizations` row |
| `parties` (PERSON) | 38 | **`persons` table is empty (0 rows)** |
| `entity_appointments` | 38 | the 38 PERSON parties are appointment-backed only |
| `profiles` | 49 | 0 without an `auth.users` row |
| `auth.users` without `profiles` | **3** | all e-mail-confirmed |
| `entity_user_memberships` | 26 | all `APPROVED`; 0 orphan users/entities |
| `licensees` with no membership **and** no `entity_user_access` | **38** | no owning human |
| `registrations` | 4 | 1 with no `registration_entity_bindings` row |
| `registration_journey_events` | 13 | write-only via RPC |
| `entity_identity_resolution_events` | 4 | |
| `entity_resolution_cases` | 1 | |
| `entity_merges` | 1 | |
| `entity_identity_snapshots` | **0** | no writer path exercised |
| `onboarding_journey_state` | 1 (`AUTHORITY_PENDING`) | unique per user |
| `onboarding_resolution_tokens` | 1 | 0 live, 0 expired-unconsumed |
| `otp_verifications` | — | stores `code_hash` (**hashed — correct**) |

### 2.3 Onboarding model (governed, DB-driven)

`registration_journey_types` holds exactly two enabled public journeys — there is **no third
active model**:

| key | entry route | resolution timing | default |
| --- | --- | --- | --- |
| `FORM_FIRST` — New Applicant Registration | `/register/applicant` | LATE | yes |
| `ENTITY_FIRST` — Connect to an Existing Entity | `/register/entity` | EARLY | no |

Shared prerequisite: `/register/account` (account + e-mail verification).
Decision page: `/register` (renders journeys from the table, not hard-coded).
Legacy alias `/register/legacy` and `/registration/pre-licensee` redirect to canonical routes.

### 2.4 Governed onboarding RPC chain (ENTITY_FIRST)

```text
onboarding_issue_token(kind, entity, case, payload)         -- SECURITY DEFINER, requires auth.uid()
onboarding_redeem_token(token, kinds)                       -- owner-bound, expiry-checked, kind-scoped
onboarding_provision_from_token(token)                       -> wb_onboarding_provision_entity + journey event
onboarding_request_membership_by_token(token, role, evidence) -> entity_membership_request + journey state
onboarding_record_follow_up / onboarding_record_journey_event -- append-only ledger (onboarding_ledger_guard)
```

All client access to these is via `useOnboardingTokens.ts` / `useOnboardingAudit.ts`, which call
RPCs only (`supabase.rpc(fn, args)`) — no direct table DML from the browser on this path. That part
of the design is sound.

### 2.5 UI surfaces

| Surface | File | Status |
| --- | --- | --- |
| Journey decision | `src/pages/Register.tsx` + `RegistrationJourneyChoice.tsx` | routed |
| Account step | `registration/UserAccountStep.tsx` | routed `/register/account` |
| FORM_FIRST | `registration/PreLicenseeRegistration.tsx` | routed `/register/applicant` |
| ENTITY_FIRST | `registration/EntityIdentification.tsx` | routed `/register/entity` |
| Pending authority | `components/registration/PendingAuthorityScreen.tsx` | rendered **inline** by `EntityIdentification` only |
| Registration status | `registration/RegistrationStatusPage.tsx` | routed (dashboard) |
| Verification pending | `registration/VerificationPending.tsx` | **unreferenced / dead** |
| Registration form fill | `registration/RegistrationFormFill.tsx` | **unreferenced / dead** |
| Membership verification queue | `pages/admin/EntityMemberships.tsx` | routed |
| Entity resolution queue/detail | `pages/licensing/EntityResolutionQueue.tsx`, `EntityResolutionDetail.tsx` | routed |
| Onboarding workspace | `pages/licensing/OnboardingWorkspace.tsx` | routed |
| Web users / PPOC | `admin/PpocManagement.tsx`, `components/.../WebUsersTab.tsx` | routed |
| Identifier register/verify | `components/entity-detail/RegisterIdentifierDialog.tsx`, `VerifyIdentifierDialog.tsx` | routed, governed RPCs |

Server-side user provisioning is concentrated in edge functions using
`auth.admin.createUser`: `register-pre-licensee`, `approve-pre-licensee`, `create-web-user`,
`bootstrap-break-glass-admin`, `cert-v2-user-fixtures`. Browser-side self sign-up exists in exactly
one place (`src/contexts/AuthContext.tsx`) — no scattered signup paths.

---

## 3. Enterprise gap register

| ID | Severity | Title |
| --- | --- | --- |
| GAP-F2-01 | **Critical** | RLS-bypassing destructive grants to `anon`/`authenticated` on the F2 identity estate |
| GAP-F2-02 | **Critical** | Dual entity-identity truth: `licensees` vs partially bound RDM party layer; `persons` empty |
| GAP-F2-03 | High | Live RPC returns dead route `/register/authority-pending` |
| GAP-F2-04 | High | Missing uniqueness/ownership constraints on user and entity identity keys |
| GAP-F2-05 | High | Orphan authenticated users with no `profiles` row |
| GAP-F2-06 | Medium | Plaintext onboarding resolution tokens; single-use not enforced in the redeem primitive |
| GAP-F2-07 | Medium | Hard-coded onboarding stage and membership status vocabularies in UI |
| GAP-F2-08 | Medium | Dead onboarding screens retained in the source tree |
| GAP-F2-09 | Medium | DB capability with no UI/RPC path (identity snapshots, merges, retention/security metadata) |
| GAP-F2-10 | Medium | Onboarding→F3 registration handoff not constrained; entities without an owning human |

### GAP-F2-01 — Critical — destructive grants on the identity estate

Same defect class as `DEF-F1-C2-01`, but now on user/identity tables and **worse**, because
`TRUNCATE` and `DELETE`/`UPDATE` are held directly by `anon`.

Privilege census (`has_table_privilege`) — 27 of 31 F2 tables grant
`SELECT,INSERT,UPDATE,DELETE,TRUNCATE` to **both** `anon` and `authenticated`, including:

```text
profiles, user_roles, registrations, registration_form_submissions,
registration_entity_bindings, registration_journey_types, registration_journey_events,
entity_user_memberships, entity_user_access, entity_membership_roles,
entity_identifiers, entity_identity_snapshots, entity_identity_resolution_events,
entity_resolution_cases, entity_merges, parties, organizations, persons,
otp_verifications, ppoc_entity_mappings,
onboarding_journey_state, onboarding_resolution_tokens, onboarding_alert_rules,
onboarding_alert_signals, onboarding_retention_policies, onboarding_security_metadata
```

Correctly constrained today: `entity_identifier_types`, `entity_identity_statuses`
(`authenticated` SELECT only), `registration_form_configs` (SELECT only),
`licensees` / `pre_license_users` (no `anon` privilege).

**Empirical proof (executed, rolled back):**

```sql
BEGIN;
SET LOCAL ROLE anon;
TRUNCATE TABLE public.onboarding_alert_signals;   -- NOTICE: ANON_TRUNCATE=ALLOWED
ROLLBACK;
```

RLS is enabled on all 31 tables and every table has at least one policy, so *row-level* read/write
is filtered — but **`TRUNCATE` is not subject to RLS at all**. An unauthenticated caller therefore
has a destructive path against `profiles`, `user_roles`, `otp_verifications` and the onboarding
ledger. This is a hard blocker for F2 certification.

### GAP-F2-02 — Critical — dual entity-identity truth

- All F2 FKs resolve to `licensees.id`; the RDM party model is *optional* (`licensees.party_id` is
  nullable with a partial unique index).
- 29 of 54 licensees have **no** party binding, so RDM-derived reporting sees 25 entities while the
  operational estate has 54.
- `parties` contains 38 `PERSON` rows but `public.persons` has **0 rows** — the person half of the
  party model is unpopulated while 38 `entity_appointments` exist, i.e. person identity is carried
  outside the canonical model.
- Consequence: two conflicting answers to "how many regulated entities/persons exist", and no
  constraint forcing convergence.

Remediation must declare one canonical model and either backfill or formally demote the other; no
policy decision is invented here.

### GAP-F2-03 — High — dead route emitted by a live RPC

`public.onboarding_request_membership_by_token` returns:

```sql
'resume_route', COALESCE(v_route, CASE WHEN v_status='APPROVED' THEN '/applications/new'
                                       ELSE '/register/authority-pending' END)
```

`/register/authority-pending` is **not** declared in `src/routes/publicRoutes.tsx` (verified: zero
matches in `src/`), so a pending-authority applicant following the server's own instruction lands on
`NotFound`. `PendingAuthorityScreen` exists but is only reachable inline from `/register/entity`.
This violates the F0 route-truth contract (GAP-F0-03 class).

### GAP-F2-04 — High — missing uniqueness / ownership constraints

Present and correct: `onboarding_journey_state(user_id)` unique;
`entity_user_memberships(user_id, entity_id, membership_role_id)` unique for open statuses;
`entity_user_access` one active `primary_user` per entity; `entity_identifiers` four scope-aware
partial uniques; `licensees.public_slug`, `licensees.license_id`, `licensees.party_id` unique.

Absent:

| Table | Missing constraint | Current control |
| --- | --- | --- |
| `profiles` | unique `lower(email)` | none (0 duplicates today — luck, not a constraint) |
| `pre_license_users` | unique `lower(email)` | app-level `check_primary_user_email_exists` RPC only |
| `licensees` | unique applicant/legal name scope | app-level `check_applicant_name_exists` RPC only |
| `registrations` | 1:1 entity binding | `registration_entity_bindings` nullable, no uniqueness |

### GAP-F2-05 — High — orphan authenticated users

Three e-mail-confirmed `auth.users` have no `public.profiles` row:

```text
4f0cc0ac-9fce-42bb-b17c-944f97626495  2026-08-24
56fd12a5-94cc-458c-8c32-5fcf908add8d  2026-08-24
ee323ab7-79f5-4744-8e48-d6ebbbf6ce39  2026-08-26
```

These accounts can authenticate but have no profile, no role resolution guarantee and no journey
state — an unspecified state for every downstream authorization decision. `handle_new_user()`
coverage and backfill both need review.

### GAP-F2-06 — Medium — onboarding token handling

`onboarding_resolution_tokens.token` stores the **raw** token string (unique index on the plaintext).
Mitigations already present: owner binding to `auth.uid()`, expiry check, `token_kind` allowlist per
step, and `consumed_at` set by the two consuming RPCs. Residual risk: token values are readable from
any path that can read the row, and `onboarding_redeem_token` itself does **not** reject an already
consumed token — single use depends on each caller remembering to stamp `consumed_at`.

### GAP-F2-07 — Medium — hard-coded onboarding vocabularies

F1 established DB-governed configuration. These UI literals bypass it:

```text
src/pages/licensing/OnboardingWorkspace.tsx:32
  const STAGES = ['USER_ACCOUNT','ENTITY_IDENTIFICATION','AUTHORITY_PENDING','AUTHORITY_GRANTED','APPLICATION','COMPLETE']
src/pages/admin/EntityMemberships.tsx:25
  const STATUS_TABS = ['PENDING_VERIFICATION','REQUESTED','VERIFIED','APPROVED','REJECTED','REVOKED','all']
src/hooks/useOnboardingTokens.ts:58  -- stage union type duplicated
src/pages/registration/EntityIdentification.tsx:83,119,166 -- stage/journey literals
```

Journey **keys** (`FORM_FIRST`/`ENTITY_FIRST`) are read from the DB for rendering but branched on by
literal in five places, so adding a governed journey requires code change.

### GAP-F2-08 — Medium — dead screens

`src/pages/registration/VerificationPending.tsx` and
`src/pages/registration/RegistrationFormFill.tsx` have no route and no importer anywhere in `src/`.

### GAP-F2-09 — Medium — DB capability without a path

| Table | Rows | Client/RPC path |
| --- | --- | --- |
| `entity_identity_snapshots` | 0 | none — append-only trigger exists, no writer invoked |
| `entity_merges` | 1 | none in `src/` or edge functions (row created out-of-band) |
| `onboarding_security_metadata` | 0 | none |
| `onboarding_retention_policies` | 3 | none — configured but unenforced by any worker |

(`registration_journey_events`, `entity_identity_resolution_events`, `entity_resolution_cases` have
no direct client read but *are* served through governed RPCs — acceptable.)

### GAP-F2-10 — Medium — onboarding→F3 handoff

- 1 of 4 `registrations` has no `registration_entity_bindings` row, so the registration cannot be
  attributed to an entity — the F3 Registration entry contract is not enforced structurally.
- **38 of 54** licensees have neither an `entity_user_memberships` row nor an `entity_user_access`
  row, i.e. no human can act for them; they are regulator-created shells with no onboarding closure.

---

## 4. Coverage summary

| Dimension | Result |
| --- | --- |
| Duplicate/legacy onboarding models | None active. Two governed journeys only; legacy routes are redirects. **Clean.** |
| Conflicting entity/user linkage tables | `entity_user_memberships` (governed, RPC-driven) vs `entity_user_access` (legacy `access_type` model, direct-FK to `licensees`) coexist → folded into GAP-F2-02 scope for remediation decision |
| Hard-coded onboarding states/rules | GAP-F2-07 |
| Dead routes/screens | GAP-F2-03, GAP-F2-08 |
| DB capability without UI | GAP-F2-09 |
| UI not on canonical backend | None found on the onboarding path — all writes go through `SECURITY DEFINER` RPCs |
| Missing uniqueness/ownership constraints | GAP-F2-04 |
| Orphan users/entities | GAP-F2-05, GAP-F2-10 |
| Entity-identifier debt | 25 organizations vs 54 licensees; identifier uniqueness scopes correct → GAP-F2-02 |
| Unsafe invitation/token handling | GAP-F2-06 (OTP itself is hashed — no gap) |
| Onboarding→F3 entry gap | GAP-F2-10 |

**Blocking for F2-B:** GAP-F2-01 and GAP-F2-02.
**No remediation, migration, or code change was performed in this pass.**

---

## 5. Verdict

**F2 READY FOR CONTROLLED REMEDIATION**
