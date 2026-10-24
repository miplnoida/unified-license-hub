## Why you see "Unknown entity type."

The page `/fpa/entity/...` is not a company page. It only redirects from Fit & Proper notification links. It accepts four kinds of record: condition, appeal, monitoring event and determination. It looks up the person behind that record and opens their profile. "licensee" is not one of the four, so the page stops and shows "Unknown entity type." Typing a different word into that address will not help.

## Why Rodney Bay doesn't appear in the lists

Rodney Bay Community Credit Union Ltd is still an applicant. Its application APP-2026-002011 is waiting at Final Approval, and no licence has been issued yet. The entity list and the Fit & Proper entity view only show licensed organisations, so Rodney Bay should appear in both once final approval issues the licence. I'll confirm this rule against the data before relying on it (step 1).

## Where to find it today

- Fit & Proper cases: Fit & Proper > Assessments, or open each case directly (for example `/fpa/assessments/cd540004-0000-4000-8000-000000000004` for Kendall).
- Application: `/applications/89603d2b-3c5c-4d87-bc5d-5851f2b2fbfb`.

## Proposed steps

1. Check, without changing anything, how the entity list and the Fit & Proper entity view choose which organisations to show. Confirm that "not yet licensed" is the only reason Rodney Bay is missing.
2. Optional small fix: make `/fpa/entity/licensee/:id` open the organisation's Fit & Proper summary instead of showing an error. This is display only, and access rules stay the same.
3. No data or permission changes. Rodney Bay will show up in the lists once the licence is issued through the normal approval steps.
