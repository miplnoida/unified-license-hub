## Fix "No published forms found" for Credit Union on New Application

**About the user's role:** `rbc_primary_user@yopmail.com` stays a Licensee Primary (Regulated Entity User). "Regulator" in this plan means the **authority the application goes to** (Saint Lucia FSRA). It does not mean the user's role. After the fix, this user picks the sector, fills in the Credit Union form and saves a draft. Final submission is a separate issue: it is still blocked because Credit Union has no fee and no approval workflow, so those need setting up first.

### What the checks show
- The Credit Union pre-licence form is set up correctly. When the form lookup runs with the **Saint Lucia FSRA** regulator, or with no regulator, it returns the form.
- When the same lookup runs with **Apex Commercial Bank Regulatory Authority**, it returns nothing. That is the exact message you see.
- Only two regulators are active. Neither is marked as the default, so for a user with no saved choice the page picks the first one alphabetically, which is **Apex**. Apex has no sectors and no forms.
- The Rodney Bay user has no registration record. That means the page's backup rule ("use the applicant's own regulator") never applies to them.
- Licensee users have no way to switch regulator.

**Most likely cause (to be confirmed in step 1):** the sector list and the form lookup don't use the same regulator. The form lookup always uses the page's active regulator (Apex), while Credit Unions belongs to FSRA. One thing I can't explain yet: a user whose active regulator is Apex shouldn't see Credit Unions in the sector list at all. Step 1 settles this before any change.
