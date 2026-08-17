# Fix State / City showing IDs in Registration Review

## Confirmed cause
State and City fields store Master Data item IDs (`STATE`, `CITY` types, `optionSource: master_data`) in the published registration config. The review screen resolves those IDs to names by downloading every item of each type — but the backend caps a single fetch at 1000 rows, and there are 5,276 states and 15,424 cities. So almost every state/city ID falls outside the fetched slice and is printed raw. Country (250 items) resolves fine, which matches what you see.

## Fix
Resolve only the IDs actually present in the submission, instead of trying to download whole lists.

1. In the review value resolver, collect the distinct ID-looking values from the submitted registration data for every master-data field, then fetch just those rows by ID (`id in (...)`, chunked) and build the label map from them. This makes lookup size independent of how big `STATE`/`CITY` are.
2. Keep the existing behaviour for sector / sub-sector / category / legacy country-state fields.
3. Same resolver is used by the applicant-side review step in the registration wizard, so both screens get the fix.

## Verification
- Open a registration in Registration Review that has mailing and physical addresses filled: Country, State and City must all show names.
- Check a submission with a large-country city (e.g. India) to confirm the previously-broken range now resolves.
- Confirm the applicant wizard review step still shows names, and no other fields changed.

## Technical notes
- File: `src/components/registration/useReviewValueResolver.ts` (per-type "fetch all items" queries replaced by ID-targeted queries).
- No database or schema changes; no change to what is stored in submissions.
