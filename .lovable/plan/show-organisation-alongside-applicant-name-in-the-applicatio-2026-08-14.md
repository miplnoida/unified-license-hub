# Show organisation alongside applicant name in the Application Queue

## Problem

The Application Queue's "Applicant" column shows only the person's name (e.g. "User Three"). The organisation the application belongs to is stored separately, so reviewers can't tell which entity a case relates to.

Confirmed in the data: the applicant behind APP-2026-000138 is `User Three` with entity name `Entity Three`. Applications submitted by internal/staff profiles instead carry a licensee reference in their form data (e.g. APP-2026-000120), whose organisation name lives in the licensees record.

## Change (UI only)

In the Application Queue page:

- Display the applicant as `Applicant Name (Organisation)` — e.g. `User Three (Entity Three)`.
- When no organisation is known, fall back to just the applicant name (no empty parentheses).
- Search and the "Applicant (A→Z)" sort use the combined label, so typing an organisation name finds the case.

## Technical notes

- File: `src/pages/applications/ApplicationQueue.tsx`.
- The applicant lookup already batches `profiles` and `pre_license_users`; extend the `pre_license_users` select to include `entity_name`, and additionally resolve organisation names for applications whose `data.licensee_id` is set by batching a `licensees` (`id, name`) lookup.
- Replace the `applicants: Record<string, string>` map with a map holding `{ name, org }` (or store a prebuilt display label) and render the label in the table cell; reuse the same label in the search filter and applicant sort comparator.
- No schema, RPC, or permission changes; no other columns or behaviour touched.
