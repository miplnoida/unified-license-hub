# Registration Form Address Field Reorder

## Goal
Reorder the address fields in the active registration form so the cascading location fields follow their dependency chain: **Country → State → City**.

## Current state
The published "Standard Registration (v2)" config renders the mailing / physical address blocks as:
- Street (full width)
- City | Country
- State | Postcode

This places City before the Country and State values that filter it.

## Changes

### 1. Reorder the active registration form config
Update the `form_schema` JSON in `registration_form_configs` for the default published config so each address block becomes:
- Street (full width)
- Country | State
- City | Postcode

The existing `masterDataParentField` links stay unchanged:
- `mailing_state` / `physical_state` depend on `mailing_country` / `physical_country`
- `mailing_city` / `physical_city` depend on `mailing_state` / `physical_state`

### 2. Align the legacy fallback component
`src/components/registration/AddressSection.tsx` is still used by the static fallback (`EntityDetailsStep`). Reorder its fields to Country → State → City so any fallback path matches the dynamic form.

## Verification
- Load `/register` and reach the address step.
- Confirm the visible order is Street, then Country, State, City, Postcode.
- Pick a Country and verify its States load.
- Pick a State and verify its Cities load.
- Confirm no other registration functionality changes.
