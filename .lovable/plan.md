In `src/pages/admin/RegistrationReviewDetail.tsx`:

1. **Hide password fields** — extend `SKIP_KEYS` logic so any `entity_specific_data` key whose lowercased name contains `password` is skipped (covers `primary_user_password`, `confirm_primary_user_password`, and existing `password`/`confirm_password`). Apply this in both the Application Details loop and the address builder.

2. **Resolve lookup values for older submissions** — when a schema field isn't in `fieldByName` (older registration whose form config has since changed), fall back to resolving UUID-looking values:
   - Fetch countries via a small `useQuery` in this component (id → name).
   - If the key name (lowercased) contains `nationality`, `country`, or `citizenship` and the raw value is a UUID string, look it up in the countries map and render the name (fallback to raw if not found).
   - Same treatment inside `buildAddress` for any prefixed key.

No changes to workflow, schema, DB, or other pages.