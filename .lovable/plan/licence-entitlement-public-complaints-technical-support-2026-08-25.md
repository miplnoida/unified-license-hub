# Licence Entitlement, Public Complaints & Technical Support

## What is wrong today (verified in the code)

- `src/pages/NewPostLicenseApplication.tsx` builds its Sector / Sub-Sector / Service dropdowns from **all active master sectors** (`useSectors` / `useSubSectors` / `useServices`), with no reference to the licences the entity actually holds.
- `src/hooks/useLicenseStatusGate.ts` returns `isBlocked: false` whenever no `licenseeId` resolves — so a registered applicant with **no licence at all** passes the gate.
- Server-side, post-licence draft creation only checks *licensee access* (`can_current_user_access_licensee` via `useLicenseeAccessGuard`), never *licence entitlement for the chosen sector*.
- Public complaint routes (`/complaints/submit`, `/complaints/new`, `/submit-complaint`) all redirect to `/login`, so a consumer cannot complain without a regulated-entity account. The canonical intake RPC `public.create_complaint(variant, payload)` and `create_complaint_with_attachments` already exist and already accept an `intake_source`.
- There is no support-ticket domain anywhere in the repo (no tables, no pages).

Nothing is asserted here about returns-side enforcement beyond the code above; the returns audit (step 3) starts by tracing `useEntityReturns` / Wave C RPCs and only then changes them.

## Delivery in phases

### Phase 1 — Canonical entitlement resolver (foundation)

One source of truth, server-first:

- New SQL function `public.entity_license_entitlements(target_licensee_id uuid)` (SECURITY DEFINER, callable by authenticated) returning one row per licence the caller is authorised to see for that entity: licence id, number, status, sector / sub-sector / category, regulator, `valid_until`, grace days resolved from the existing `site_settings.license_expiry` rules, and a computed `is_eligible_for_new_activity` flag. It reuses the same status/grace semantics as `useLicenseStatusGate` and the existing `can_current_user_access_licensee` for authorisation — no new access model.
- New predicate `public.can_act_on_license(licensee_id, sector_id, sub_sector_id, category_id)` returning true only when an eligible licence covers that scope. Used by every write path.
- New hook `src/hooks/useLicenseEntitlements.ts` wrapping the RPC, keyed on the PPOC-resolved active licensee so entity switching recalculates automatically.
- `useLicenseStatusGate` is corrected so "no licence found" is a **blocked** state for licensee/applicant audiences (internal staff stay unaffected), with a plain-language reason.

### Phase 2 — Post-licence services become licence-scoped

- Rework `NewPostLicenseApplication.tsx` into: **pick a licence** (auto-selected when only one) → sector/sub-sector/category are derived read-only → services and published `post_license` form templates filtered to that scope. No master-sector dropdown remains.
- Empty/ineligible states show non-technical copy ("Post-licence services become available after your licence has been approved and issued", "This service is unavailable because the related licence is currently suspended").
- Server enforcement: the governed post-licence draft routine used by `applicationCreateDraft`, plus the form-open / save / submit / resubmit routines, call `can_act_on_license` and reject scopes outside the entitlement — so a hand-typed URL or direct API call fails.
- Historic post-licence records stay listable and viewable regardless of current licence status; only new actions are gated.

### Phase 3 — Returns follow the same rule

- Trace the returns spine (`useEntityReturns`, Wave C governed RPCs, filing queue, obligations, fill/save/import/submit) and apply the same entitlement predicate: a return is offered only when the entity holds an eligible licence whose sector/sub-sector matches the return configuration and the user has the existing filing capability.
- Obligations and dashboards filter through the resolver; save/submit/import RPCs re-validate server-side. PPOC entity switching recalculates.

### Phase 4 — Navigation and applicant UX

- Post-Licensing and Returns menu entries stay visible but render as locked/disabled with an explanatory status until the first licence is issued. Pre-Licensing is untouched.
- Registration approval is never used as a proxy for licence approval anywhere in nav or dashboard widgets.

### Phase 5 — Public market-conduct complaint intake

- New public route `/complaints/file` (plus redirecting the existing three login-redirect routes to it) with a public complaint form: complainant name, email, phone, preferred contact, entity complained against, sector/product, complaint type, subject, description, incident date, attachments, consent declaration.
- Entity picker sourced from the public licensed-entity register only (already exposed by the public registry), never from applicant accounts, and with no supervisory metadata.
- Submission goes through the existing `create_complaint_with_attachments` with `intake_source = 'consumer_portal'`, so SLA, triage, assignment, duplicate detection, RFI, escalation, notifications and audit all behave as today. Existing CAPTCHA config and rate limiting are applied.
- Acknowledgement screen shows the generated reference; tracking reuses the existing `/complaints/track` public tracking path, which already restricts access to the reference holder.

### Phase 6 — Help & Support (separate from complaints)

- New tables `support_tickets`, `support_ticket_comments`, `support_ticket_attachments`, `support_ticket_events` with GRANTs, RLS (submitter sees own; staff via existing RBAC permission), and governed RPCs for create / comment / assign / status change.
- Applicant/licensee side: "Help & Support" nav item with a form (category from the listed set, subject, description, module/page, optional reference, attachments) auto-capturing user id, licensee id, active sector, page URL and timestamp. No stack traces surfaced.
- Admin side: support queue + detail with assignment, priority, status (New → In Progress → Waiting for User → Resolved → Closed), internal notes, response, attachment download, optional links to user/application/entity. Permission-driven through the existing RBAC catalogue, not hard-coded roles.
- Tickets are fully separate from complaints, applications, RFIs and findings.

### Phase 7 — Verification

Scenarios A–H are exercised as pgTAP assertions for the server rules (entitlement, bypass rejection, complaint intake, ticket isolation) plus browser walkthroughs for applicant, single-licence, multi-licence, suspended-licence, PPOC switching, public complaint and support-ticket flows. Existing suites (RLS matrix, complaints pgTAP, cert-v2 e2e) are re-run to prove no regression.

## Technical notes

- All new SQL is additive; no existing table, policy or RPC is dropped. Writes stay on the governed-RPC pattern already used across the repo (direct DML is revoked on the affected tables).
- No duplicate source of truth: sectors stay in master data, licences in `licenses` / `entity_licenses`, complaints in the existing complaint domain.
- Client hooks never decide authorisation on their own; every create/save/submit path re-checks server-side.

## Scope guard

Untouched: approval workflow engine, form builder/versioning, payments, notifications, audit logging, complaints administration, returns reconciliation/import mechanics, RBAC/RLS architecture, regulator-side modules — except where a check is added.
