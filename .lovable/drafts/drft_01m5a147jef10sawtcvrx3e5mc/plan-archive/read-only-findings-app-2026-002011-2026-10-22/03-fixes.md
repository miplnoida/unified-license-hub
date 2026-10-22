## Exact fixes I will make once you approve

1. **Receipt button.** Add "Issue receipt" to the payment detail page for staff. It calls the existing receipt action for TXN-1792648603-2B7B7D's payment, then I issue that one receipt through the browser. Impact: one receipt record. No new payment, and no other module touched.
2. **Nothing else changes automatically.** The form version, the typo and the registration all stay exactly as they are.

## Decisions only you can make
- **Form version:** keep v1.0, or approve the governed re-pin action (1b).
- **Typo:** rename "Credit Uniom" to "Credit Union" (affects labels on 2 existing records), or leave it.
- **Registration:** name the authorised officer who will ratify REG-2026-000204 through the review screen.

## Technical notes
- The receipt action already checks permissions and payment status, and never makes a duplicate. The new button needs no database changes.
- Option 1(b) would need a new database function with audit and guards, so it would be applied when this draft is accepted.
