# Plan — New Registration Form (backend-configured) + Sector Dropdown Fix

## Part A — New Registration Form

### Approach
Do **not** hardcode the new form. Reuse the existing dynamic form engine (`registration_form_configs.form_schema` + `DynamicRegistrationStepper` + `RegistrationStepRenderer`). Legacy config stays in the table but is flipped **inactive** so historical submissions still resolve while all new registrations pick up the new active config.

No Middle Name field anywhere.

### Data change (single migration, no schema DDL)

- `UPDATE registration_form_configs SET is_active=false, is_default=false WHERE id='22a5fcb8-cc1c-4e07-b6e7-c9989226ee5b';`
- `INSERT` a new row `Standard Registration (v2)` — `is_active=true`, `is_default=true`, `require_otp=true`, `require_captcha=true`, `require_documents=true`, and a `form_schema` JSON with steps that mirror the screenshots:

  1. **Applicant & Address**
     - Applicant Information — Applicant Name*, Applicant Email (optional)
     - Mailing Address — Street, City*, State*, Post Code*, Country*
     - Physical Address — "Same as Mailing" toggle, then Street, City, State, Post Code, Country (required only when toggle off)
  2. **Principal Point of Contact**
     - First Name*, Last Name*, Email*, Telephone*, Password*, Confirm Password*
  3. **Sector Information** — Sector*, Sub Sector*, Category*
  4. **Supporting Documents** — as configured on the row (`document_types`)
  5. **Declarations** — Terms*, Privacy*, Data Protection*, Captcha, Email OTP

- `declarations`, `document_types`, `terms_url`, `privacy_url`, `data_protection_url` copied over from the legacy row so wording matches current policy.
- No `ALTER TABLE`, no new columns, no RLS/GRANT changes. All new field values persist via the existing JSONB path (`entity_specific_data` for extras like `applicant_email`, `mailing_postcode`, `physical_postcode`), which the current dynamic renderer already supports.

### Frontend changes
Minimal — the dynamic renderer already handles arbitrary fields defined in `form_schema`. Only touch what's needed for the new field types shown in the screenshots:

- `src/components/registration/AddressSection.tsx` — dynamic renderer already drives per-field rendering; verify Post Code renders when included as a schema field. If AddressSection is a hardcoded block, extend it to accept an optional `postCode` prop wired from the schema. No behavior change for legacy config (post code stays hidden when the schema omits it).
- `src/types/registrationForm.ts` — extend allowed field keys enum only if a runtime whitelist blocks unknown keys. Otherwise no change.
- **No** edits to `useRegistrationForm.ts` hardcoded state model beyond what's required to persist arbitrary extras through `entity_specific_data`.
- Admin UI (`/admin/registration-forms`) already shows Active/Inactive badges and lets an admin edit the new config through the existing builder — no code change.

### Explicitly out of scope
- No Middle Name field.
- No changes to auth, OTP, captcha, document upload pipeline, approval workflow, RLS, or GRANTs.
- No deletion or edit of the legacy config row's content — only its `is_active`/`is_default` flags.

---

## Part B — Sector Dropdown Empty on New Application

### Root cause
`NewApplication.tsx` calls `useSectors(activeRegulator?.id)` which strictly filters `sectors.regulator_id = activeRegulator.id`. Only `Regulator 1` has sectors seeded; the other three regulators have zero. If the applicant's `activeRegulator` resolves to one of the empty regulators (header switcher or stored preference), the dropdown is silently empty.

### Fix
1. In `src/pages/NewApplication.tsx`, when the regulator-scoped sector list comes back empty, fall back to the regulator derived from the applicant's approved registration (`registrations.sector_id → sectors.regulator_id`) — the same source already used at line 728 to pre-fill selections.
2. If the fallback is also empty, render an inline empty-state under the Sector select: *"No sectors are configured for your assigned regulator. Please contact the administrator."*
3. `useSectors` itself is unchanged so admin master-data screens stay correctly scoped.

### Explicitly out of scope
- Not changing regulator assignment logic, `RegulatorSwitcher`, or seeding data.

---

## Verification
- `bunx vitest run` for existing registration and sector tests.
- Playwright: open `/register`, walk through the new dynamic form end-to-end, confirm a `registrations` row is inserted with expected values in `entity_specific_data`.
- Playwright: as a licensee whose regulator has zero sectors, open New Application and confirm the fallback list or the empty-state message appears.
- `/admin/registration-forms` shows legacy row as *Inactive* and new row as *Active / Default*.

## Rollback
- Single UPDATE flipping `is_active`/`is_default` back to the legacy row and off on the new one — fully reversible, no data migration, no schema change.
