# Pre-License Application Forms — Complete the Set of Nine

Goal: all nine pre-license applications exist, are published, carry the exact sections you listed, and resolve to the right sector/sub-sector/category so applicants see them.

## Current state (verified in the database)

Already present as pre-license form templates:

| Application | Status | Sections present |
| --- | --- | --- |
| Merchant Bank | Two templates with the same name — one published but holding only a 4-field placeholder version, one draft holding the correct 4 sections (22 fields) | Wholesale Banking Operations Plan, Correspondent Banking Arrangements, Capital Adequacy Evidence, Directors and Officers |
| General Insurance | Published, 36 fields | All 7 requested sections |
| Life Insurance | Published, 33 fields | All 5 requested sections |
| Securities Dealer | Published, 30 fields | QRR Evidence, Client Asset Segregation, Market Conduct Attestations, Trading Systems, "Capital" — **no Directors/Officers section** |
| Micro-Credit Institution | Published, 30 fields | All 5 requested sections |
| Financial Holding Company | Published, 30 fields | All 6 requested sections |

Missing entirely: Money Service Business, Payment Service Provider Registration, Pension Fund Administrator Registration.

Taxonomy master data has 10 sectors (each sector = sub-sector = category of the same name), including Money Service Business. There is no Payment Service Provider and no Pension Fund Administrator.

Taxonomy mismatches on existing templates: Financial Holding Company and Micro-Credit are tagged sector "Banking" / sub-sector "Commercial Banking", Securities Dealer as "Capital Markets" / "Securities", Life Insurance as "Insurance" / "Life Insurance" — none of which match the real master-data values, so these forms can fail to resolve for the correct applicant.

## What will be done

### 1. Master data
Add sector, sub-sector and category rows for **Payment Service Provider** and **Pension Fund Administrator**, following the existing one-name-per-level convention, under the same regulator.

### 2. Three new forms (published, v1)
- **Money Service Business License Application** — AML/CFT Programme; KYC Procedures; Correspondent Relationships; Agent Network Details; Directors / Officers
- **Payment Service Provider Registration** — Scheme Membership Evidence; Technical Security Assessment; Consumer Protection Arrangements; Settlement Arrangements; Directors / Officers
- **Pension Fund Administrator Registration** — Trust Deed; Actuarial Certification; Investment Policy; Board / Trustees List

Each section gets fields in the same style as the existing six: narrative text areas, dates, numeric/currency inputs, dropdowns, document upload fields for evidence (trust deed, actuarial certificate, scheme membership letter, security assessment report), and a repeatable directors/officers or trustees section capturing name, role, nationality, appointment date, F&P declaration and CV/ID uploads.

### 3. Patch gaps in the existing six
- **Securities Dealer**: add the missing **Directors / Officers** section and rename "Capital" to "Capital Adequacy" for consistency, published as a new version.
- **Merchant Bank**: consolidate the duplicate — keep one published template carrying the correct 4-section schema, and archive the placeholder template so applicants no longer get the 4-field stub.
- **Financial Holding Company, Micro-Credit, Securities Dealer, Life Insurance**: correct the sector / sub-sector / category tagging to the real master-data values.
- General Insurance and Life Insurance section content is otherwise left untouched.

Existing draft or submitted applications keep the version snapshot they were filled against, so no in-flight submission changes.

## Technical notes

- All work is done through database migrations: `sectors` / `sub_sectors` / `categories` inserts, then `form_templates` + `form_versions` (status `published`, `schema_snapshot` populated) + normalized `form_fields` rows, matching the shape used by the existing seeded applications.
- New versions are inserted rather than editing published versions in place, preserving historical rendering.
- No frontend changes are expected; the form builder, applicant picker and renderer already read these tables.

## Verification

- Query each of the nine templates and confirm one published version with the expected section titles and non-zero field counts.
- Confirm the Merchant Bank stub template is archived and only one Merchant Bank application is selectable.
- Open the applicant new-application flow for a Payment Service Provider and Pension Fund Administrator selection and confirm the form renders with all sections.
