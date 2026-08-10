# SLA Manager — replace "BOJ" wording with "St. Lucia"

The only "BOJ" reference in the SLA Manager is a helper hint under the Business Calendar card: `e.g. BOJ Calendar, FSC Calendar`. No calendar records exist in the database with that name, so this is a text-only change.

## Change

- In the Business Calendar tab of the SLA Manager, update the card description to read `e.g. St. Lucia Calendar, FSC Calendar`.

## Technical detail

- Edit `src/pages/admin/SlaManager.tsx` line 627 (the `CardDescription` under the business calendar card). No logic, data, or backend changes.

## Verification

- Open Admin > SLA Manager > Business Calendar and confirm the hint text shows "St. Lucia Calendar" and no other "BOJ" text remains in the module.
