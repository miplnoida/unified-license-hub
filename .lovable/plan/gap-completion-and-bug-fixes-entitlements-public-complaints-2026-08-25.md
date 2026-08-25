# Gap completion and bug fixes — entitlements, public complaints, support desk

Inspection of the current code confirms the entitlement resolver, grace-period logic, returns gating, post-licence licence selector, complaints administration, PPOC context and RBAC/RLS are in place and will be left untouched. The work below is additive and targeted.

## Confirmed defects (verified in the live code/database)

1. `create_application_draft()` derives `v_entity_id` from "latest approved membership / profile / applicant" and stores that in `applications.entity_id`, while only sector/sub-sector/category are entitlement-checked. `license_id` is not validated at all. A PPOC acting for Entity B can therefore have the application recorded against Entity A.
2. `public-complaint-intake` returns HTTP 200 on insert failure and leaks the raw database message; rate limiting is per-email only despite the comment; there is no CAPTCHA verification; complainant name/phone are appended to the description text; it writes `intake_source: 'public_portal'` (existing data uses `internal`); respondent eligibility is hardcoded to `licenses.status = 'active'`; no attachments.
3. `/complaints/track` is only mounted inside the authenticated dashboard routes with a module guard, so the anonymous consumer journey dead-ends at login. A public tracking page component already exists but is not reachable.
4. `support_is_staff()` hardcodes seven roles, bypassing the dynamic RBAC model.
5. `support_tickets` has no attachment table and no captured context (page/URL, user agent, licence/sector, reference).
6. `useLicenseEntitlements` collapses a query error into "no licence", producing a misleading message.

## Phase 1 — Licence-specific authorisation (bug 1, requirements 1-3)

- New canonical validator `public.can_act_on_specific_license(_license_id, _licensee_id, _sector_id, _sub_sector_id, _category_id)`: confirms the licence exists, belongs to the given entity, the caller may act for that entity (reusing the existing access predicate), the licence is eligible under the existing status/grace logic, and the supplied sector/sub-sector/category match the licence exactly. Built on top of the existing entitlement resolver — no duplicated eligibility logic.
- `create_application_draft()` (targeted edit, same signature): when the request is a post-licence service, take the target entity from the selected `licensee_id`/`license_id` instead of the membership guess, run the new validator, and persist that entity in `applications.entity_id`. Pre-licence behaviour is unchanged.
- Apply the same validator to post-licence update/resubmit paths so the licence, entity or sector on an existing application cannot be swapped by a direct API call.
- Post-licence service listing: validate the resolved form template's regulator/sector/sub-sector/category scope before allowing creation, including the legacy name-match fallback.

## Phase 2 — Returns write-path audit (requirement 4)

Confirm `returns_entitlement_ok()` is enforced on every external write path (start, save, import, validate, submit, resubmit), not just creation, and add it where missing. Internal regulator actions and all read/history access stay untouched.

## Phase 3 — Public complaint journey (requirements 5-10, 22, 23)

- Mount the existing public tracking page on public `/complaints/track` and `/complaints/track/:reference`; move the signed-in screen to `/complaints/my-tracking` so internal use is preserved. Backend tracking stays reference + email verified and returns only publishable fields.
- Migration (additive columns only): `complainant_name`, `complainant_phone`, `preferred_contact_method`, `incident_date` on `complaints`, so structured data stops being appended to the description.
- Intake function rewrite of its handler only: CAPTCHA verification via the existing `manage-captcha` `verify` action (skipped cleanly when nothing is configured), honeypot retained, per-email **and** per-IP rate limiting, correct status codes (400 / 429 / 500), generic public error text with the real error logged server-side, canonical `intake_source` value aligned with the complaints model, attachments accepted through the existing complaint evidence pipeline.
- Respondent eligibility defined separately from new-activity entitlement: entities holding a licence that is or was validly issued (including recently suspended/revoked) may be complained against; never-licensed entities cannot.
- Public form gains: phone, preferred contact method, product/service, incident date, evidence upload, consent declaration, and the CAPTCHA widget from the active configuration.

## Phase 4 — Support desk completion (requirements 11-20)

- Migration: `support_ticket_attachments` (+ private storage prefix, RLS so a requester sees only their own ticket's files, signed-URL retrieval), context columns on `support_tickets` (`license_id`, `sector_id`, `reference_number`, `page_path`, `user_agent`), and `support_ticket_audit` entries written through the existing audit infrastructure.
- Replace `support_is_staff()` internals with a `support_management` module permission check (actions: view, assign, respond, update, resolve, close) plus super-admin override; register the module in the RBAC scope catalogue. Signature and all call sites stay the same.
- Requester portal: attachment upload, auto-captured context, applicant-facing categories (Login/Account, Registration, Pre-Licensing, Post-Licensing, Returns, Payments, Documents, Notifications, Technical Error, Other) mapped onto the existing stored values.
- Admin queue: assign owner or team, unassign, change priority, status transitions with correct `resolved_at`/`closed_at` handling and reopen clearing, internal note vs public reply, attachment preview.
- Notifications for ticket created, public staff reply, material status change, resolution/closure through the existing notification system. Internal notes are never notified or exposed.
- RLS test that `support_ticket_messages.is_internal = true` is unreadable by requesters through table, join, RPC and realtime paths.
- "Help & Support" added to applicant/licensee navigation through the existing navigation configuration; `/admin/support` stays internal-only. Public site gets a clearly labelled "Track a Complaint" link alongside "File a Complaint", with copy distinguishing regulatory complaints from portal support.

## Phase 5 — Entitlement UX safety (requirements 24, 25)

`useLicenseEntitlements` gains an explicit `error` state: on failure it fails closed for new regulated actions and shows "We could not verify your licence eligibility. Please try again." with a retry, instead of claiming no licence. Historical read access is unaffected.

## Phase 6 — Tests and report (requirements 27, 28)

pgTAP coverage for the PPOC/tampering matrix (Entity A→licence A, Entity B→licence B, Entity B + licence A, valid sector + wrong licence, tampered sub-sector/category, unauthorised entity), the licence scenarios (registration-only, single licence, two sectors, suspended licence with history still readable), public complaint intake and tracking (correct email, wrong email, internal notes hidden), and the support RBAC/internal-note cases. Plus a browser walkthrough of the anonymous complaint file-and-track journey and the support ticket flow. Final report lists bugs, root causes, files and migrations changed, what was left untouched, and anything outstanding.

## Technical notes

- All migrations are additive: new tables, new columns, function bodies replaced in place. No table is dropped or recreated and no existing value is renamed.
- No new eligibility, CAPTCHA, notification, storage or audit framework is introduced — each fix routes through the mechanism the platform already uses.
