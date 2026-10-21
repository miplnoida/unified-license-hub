## Why "No published forms found" appears for Credit Union

### What is already confirmed (read-only checks)
- The Credit Union pre-licence form ("Credit Union Pre-License Application FormM") is **published**, version 2, effective since 19 Aug 2026.
- It is tagged with exactly the Sector / Sub-sector / Category you selected (Credit Unions → Credit Union → "Credit Uniom" — the category name has a typo, but the link is correct).
- It belongs to the Saint Lucia FSRA regulator.
- When the form lookup is run directly in the database for this selection, it **returns the form**. Signed-in users are allowed to run that lookup.

So the form setup is correct. The cause is something specific to the Rodney Bay user's session, and is **not yet confirmed**. Most likely candidates:
1. The user's active regulator is a different one (there are 4 regulators), so the lookup filters the form out.
2. The lookup returns an error for this user's account, and the page shows the "no forms" message instead of the error.

