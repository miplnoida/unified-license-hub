# Seed World Location Data into Master Data (Country → State → City)

## Goal
Replace the small/static country list on the registration page with the Master Data location hierarchy, seeded with every country in the world, their states/provinces, and their major cities.

## Scope decisions (confirmed)
- Cities: major cities only (capital + largest, roughly 5-10 per state/province).
- Storage: Master Data only. The registration form's country/state/city fields will read from Master Data types `COUNTRY`, `STATE`, `CITY`. The legacy `countries` / `states` tables stay untouched so existing saved records keep resolving.

## What will be built

### 1. Seed the Master Data hierarchy
- Load a public ISO-based country/state/city dataset, filter it down to major cities per subdivision.
- Insert into `master_data_items` in batches:
  - `COUNTRY` items (~250): name, ISO2 code, no parent.
  - `STATE` items: name, subdivision code, parent = its country item.
  - `CITY` items: name, parent = its state item; countries without subdivisions get cities parented to a single default subdivision entry.
- Seeding is idempotent (matched on type + parent + name), so re-running does not duplicate. The 4 existing `COUNTRY` items are reused, not duplicated.

### 2. Point the registration form at Master Data
In the active "Standard Registration (v2)" configuration, switch the six location fields:
- `mailing_country`, `physical_country` → Master Data dropdown on `COUNTRY`.
- `mailing_state`, `physical_state` → Master Data dropdown on `STATE`, cascading from the matching country field.
- `mailing_city`, `physical_city` → Master Data dropdown on `CITY`, cascading from the matching state field (currently free-text).

### 3. Keep display and review correct
- The registration review / admin registration detail resolver already maps Master Data ids to names; verify it labels the new city field too.
- Older submissions that stored legacy country/state ids keep their existing label lookup path, so nothing already submitted changes appearance.

### 4. Admin usability with large lists
The Master Data admin screen currently loads every item for a selected type at once; with thousands of states and cities that list becomes unwieldy. Add name search plus capped/paged loading to the item list so admins can still find and edit a city.

## Technical notes
- Data changes go through batched insert statements (no schema change needed; `master_data_items` already supports `parent_item_id`, `code`, `metadata`).
- Cascading dropdowns use the existing `useActiveMasterItems(typeCode, parentItemId)` hook, which filters by parent server-side — so only one country's states and one state's cities are fetched at a time.
- Metadata stores ISO codes (`iso2`, `iso3`, subdivision code) for future integrations.
- No changes to sectors, workflow, validation rules, submission logic, or any other module.

## Verification
- Confirm item counts per type in the database after seeding.
- Load `/register` in a browser: pick a country, confirm its states appear, pick a state, confirm cities appear.
- Submit-path check: confirm a saved registration renders country/state/city as names (not ids) in the admin registration review.
