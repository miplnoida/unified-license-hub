## Goal
Replace the active **Pre-Licensee Registration Form** schema with the 10 sections (A–J) from the screenshots, render them on the public `/register` flow, and add a minimal repeatable-group mechanism for sections that take multiple entries (Qualifications, Employment, Directorships, etc.).

No changes to other registration features (OTP, captcha, approval workflow, submissions tables, admin builder for other templates).

## Sections to seed (A–J)

For each section: title, description (the "Configuration Options" note), and field list. Conditional-evidence and screening-trigger fields use the existing `conditionalLogic` engine.

- **A. Personal Identification** — `full_legal_name` (text, req), `date_of_birth` (date, req), `nationality` (select, req, countries), `tax_registration_number` (text, req), `national_insurance_number` (text), `id_document_type` (select: Passport/National ID/Driver License), `id_document_number` (text, req), `id_document_upload` (file, req), `current_address` (textarea, req), `previous_addresses_10y` (textarea), `contact_phone` (phone, req), `contact_email` (email, req).
- **B. Professional Qualifications & Education** *(repeatable: `qualifications[]`)* — per entry: `degree` (text, req), `institution` (text, req), `year` (number, req), `country` (select), `qualification_document` (file, req). Plus single fields: `professional_certifications` (multi_select: AML, Accounting, Legal, Banking, Other), `certifications_other` (text, shown when "Other"), `professional_memberships` (textarea), `awards` (textarea).
- **C. Employment History** *(repeatable: `employment_history[]`, min 1 covering last 10 years)* — per entry: `employer_name` (text, req), `role` (text, req), `start_date` (date, req), `end_date` (date), `responsibilities` (textarea, req), `reason_for_leaving` (textarea), `supervisor_contact` (text), `employment_contract_upload` (file), `employment_gap_explanation` (textarea, shown when gap flag = true). Plus `employment_period_years` (number, default 10) and `has_employment_gaps` (checkbox) → triggers gap field.
- **D. Financial Disclosures** — each yes/no triggers a mandatory `*_details` (textarea) + `*_evidence` (file) via conditional logic:
  `personal_insolvency` (radio Y/N), `court_judgements` (Y/N), `unpaid_tax_liabilities` (Y/N), `guarantees_given` (Y/N), `loan_defaults` (Y/N), and `credit_history_consent` (checkbox, req).
- **E. Criminal History** — `convictions` (Y/N) + details/evidence, `pending_charges` (Y/N) + details/evidence, `cautions` (Y/N) + details, `police_investigations` (Y/N) + details/evidence, `arrest_without_charge` (Y/N) + details.
- **F. Regulatory History** — `regulatory_sanctions` (Y/N) + details/evidence, `license_refusals_revocations` (Y/N) + details, `compliance_breaches` (Y/N) + details, `enforcement_actions` (Y/N) + details, `regulatory_investigations` (Y/N) + details, `regulatory_sources_checked` (multi_select).
- **G. Directorships & Significant Shareholdings** *(repeatable `directorships[]`)*: `entity_name`, `jurisdiction`, `role`, `date_appointed`, `still_active` (checkbox). *(repeatable `shareholdings[]`, threshold ≥5% — threshold field `shareholding_threshold_pct` number default 5)*: `entity_name`, `percentage_held`, `family_member_held` (checkbox), `nominee_arrangement` (checkbox), `nominee_details` (textarea, conditional).
- **H. Related Party & Conflict of Interest** *(repeatable `related_parties[]`)*: `party_name`, `relationship_type` (select: Family/Business/Counterparty/Other), `regulated_entity` (text), `nature_of_conflict` (textarea), `mitigation_plan` (textarea).
- **I. AML/CFT Self-Assessment** — `is_pep` (radio Y/N), `pep_details` (textarea, conditional), `family_member_pep` (Y/N) + details, `on_sanctions_list` (Y/N) + details, `source_of_wealth` (textarea, req when substantial shareholder = true), `source_of_funds` (textarea, req), `substantial_shareholder` (checkbox).
- **J. Declarations & Consent** — `truthfulness_declaration` (checkbox, req), `consent_adverse_media` (checkbox), `consent_criminal_screening` (checkbox), `consent_financial_screening` (checkbox), `consent_regulatory_screening` (checkbox), `consent_share_with_regulators` (checkbox, req), `authorised_signatory_name` (text, req), `digital_signature` (text, req, used as signature capture), `signature_date` (date, req, default today).

## Repeatable groups — minimal implementation

Add an optional `isRepeatable?: boolean` and `repeatLabel?: string` on `RegStep` (type-only addition, default false → existing steps unaffected). In `RegistrationStepRenderer`:

- When `isRepeatable`, read `data[step.id] as any[]` (default `[{}]`), render the row/column grid once per entry under a sub-card titled "`repeatLabel` 1/2/…", with **Add another** and **Remove** buttons.
- `onChange` writes back to `data[step.id][index][fieldName]`. Validation errors keyed by `${step.id}.${index}.${fieldName}`.
- Submission payload stores the array at `step.id` (e.g., `qualifications`, `employment_history`, `directorships`, `shareholdings`, `related_parties`); existing non-repeatable steps keep flat keys.
- Admin builder gets a single checkbox on the Step editor ("Repeatable section") + label input. No other builder UI changes.

## Migration

Single `UPDATE registration_form_configs SET form_schema = '<new JSON>' WHERE id = '22a5fcb8-…'`. Old schema backed up to `form_schema_backup jsonb` column (added via migration) before the update so we can restore via SQL if needed.

## Technical notes
- Files: edit `src/types/registrationForm.ts` (+isRepeatable/repeatLabel), `src/components/registration/RegistrationStepRenderer.tsx` (+ repeat wrapper), `src/components/registration/DynamicRegistrationStepper.tsx` (validation key handling, submission shape), `src/components/registration-builder/StepEditor.tsx` (toggle).
- Schema delivery: one data UPDATE to `registration_form_configs` (the 10-section JSON), plus one migration adding `form_schema_backup jsonb` and copying current value.
- Conditional logic uses existing `RegConditionalRule` (operator `equals`, value `"Yes"`).
- Review/ack page (`ReviewAcknowledgement`) already iterates sections+fields; arrays render as JSON for now — acceptable, can be polished later.

## Out of scope
- Auto-screening hooks (regulatory databases, sanctions API, BOJ/FSC entity registry lookups).
- "Adverse finding workflow" routing — only the disclosure fields/uploads are captured.
- Country-specific ID format validation (free-text for now; per-country regex can be configured later via the existing `validation.pattern`).
- Polishing array-of-objects rendering in the read-only review screen.

## Verification
- `tsgo` typecheck.
- Open `/admin/forms` → registration template editor shows the 10 steps with their fields; toggle "Repeatable" works.
- Sign out, open `/register`, walk through all 10 steps; conditional evidence fields appear when Yes selected; "Add another" produces a second qualification entry; submit succeeds and row appears in `registration_form_submissions` with arrays under `qualifications`, `employment_history`, etc.
