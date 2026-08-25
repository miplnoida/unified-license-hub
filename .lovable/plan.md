# Entitlement Programme — Phases 4 to 7

Phases 1-3 are live: the licence entitlement resolver, post-licence services gating, and returns gating (UI plus database enforcement). This plan covers the remaining phases.

## Phase 4 — Navigation and applicant UX

Goal: the menu reflects what the entity may actually do, without hiding history.

- Add an optional `requiresLicenceEntitlement` flag to the navigation item definition.
- Flag the licensee-only entries that represent new regulated activity: "Post Licensing Applications", "Returns Dashboard", "My Returns".
- Sidebar visibility: when an external (non-internal) user has no eligible licence, flagged items are shown in a disabled state with a short tooltip ("Available once your licence is issued") instead of vanishing — pre-licensing, My Licenses, Appeals, Complaints and Correspondence stay untouched.
- Pre-Licensing entries stay visible for applicants, pre-licensees and licensees exactly as today.
- Once any licence becomes approved/issued (or is inside its grace window), flagged items become active automatically because they read the same resolver.

## Phase 5 — Public market conduct complaint intake

Goal: a consumer with no account can lodge a complaint against a regulated entity.

- New public route `/complaints/file` (the existing redirects to login for `/complaints/submit`, `/complaints/new`, `/submit-complaint` are re-pointed here).
- Form sections: complainant contact details, entity complained against (searchable list built only from eligible regulated/licensed entities), complaint type from the existing catalogue, description, date of incident, outcome sought, optional attachments.
- Anti-abuse: the existing CAPTCHA configuration is required before submit, plus per-email/IP rate limiting.
- Submission goes through a single database function that inserts the complaint into the existing complaints workflow (status catalogue, intake rules, triage, SLA, notifications untouched) and returns a reference number.
- The consumer sees the reference number and a link to the existing `/complaints/track` page; an acknowledgement email is sent through the existing template engine.
- Regulator side: publicly lodged complaints appear in the existing complaints queue, tagged with their intake channel, so no new administration screen is needed.

## Phase 6 — Applicant / licensee technical support desk

Goal: a support channel separate from regulatory correspondence.

- New tables: `support_tickets` (subject, category, priority, status, description, contact details, entity reference, assigned staff, resolution) and `support_ticket_messages` (threaded replies with attachments).
- Access rules: an external user sees only their own tickets; regulator support staff see all tickets. All writes go through security-definer functions with grants, matching the existing pattern.
- External portal: "Help & Support" entry (always visible, never entitlement-gated) with a ticket list, a create form, and a thread view for replies.
- Admin side: support queue with filters by status, category, priority and age; assignment, reply, status change and closure, with audit logging and notification on reply.

## Phase 7 — Verification

- Database tests covering scenarios A-H: registration-only user blocked from post-licence and returns; single approved licence allowed only within its own sector; multiple licences each scoped correctly; suspended/revoked/expired licence blocked; licence inside grace period allowed; PPOC acting for a mapped entity following the same rule; regulator staff unaffected; public complaint intake succeeds without a session.
- Browser walkthrough of the applicant, licensee and regulator journeys, plus a check that direct API calls bypassing the UI are refused.
- Confirm no regression in existing workflows, approvals, payments, notifications and audit logs.

## Technical notes

- All new gating reads the single canonical resolver (`entity_license_entitlements` / `can_act_on_license` / `returns_entitlement_ok`); no new eligibility logic is introduced.
- Public complaint intake is the only unauthenticated write, and it is confined to one function with CAPTCHA and rate limiting; the entity list exposes only names already public in the register.
- No existing table, policy, workflow or edge function is removed or loosened.
