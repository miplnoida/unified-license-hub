# Draft "Anisha" vs main: impact review

The main project has not changed since this draft started, so accepting it cannot overwrite anyone else's work. The draft changes 17 files (about 600 lines added, 50 removed). It contains no database structure changes and no permission changes.

## What changes when you accept it

| Area | Change | Effect on other users |
|---|---|---|
| Licensee dashboard (active licence count) | Also counts licences held by the selected organisation itself | Count can only go up. Database access rules still decide what each user sees. Duplicates are skipped. |
| New post-licence request | Forms come from the regulator that owns the chosen licence, not the regulator picked in the header. Matching logic moved into one shared, tested helper. | Fixes missing forms when the two regulators differ. The order of matching is unchanged. |
| Examination / finding pages | Inspection staff who can view examinations can open prudential examinations (the database already allowed this) | Opens access only where the database already allows it. AML and Conduct pages are unchanged. |
| Finding page | If a finding is not in the new register, it falls back to a read-only historical view instead of an error | Read-only. Only affects links that used to fail. |
| Supervisory plans | New read-only plan detail page plus a link from the list | Adds a page. No editing. |
| Findings panel, page path labels, page list | Small links and one new page entry | No effect on existing pages. |
| Tests, notes | 2 new test files, plus updates to project notes and the to-do list | None |

## Not part of the draft (already live)

The demo data for Rodney Bay was entered through the shared live database, so it is already in the main project. This includes the applications, licence, F&P votes, complaints, the enforcement case and the three enabled credit-union services (these also apply to Piton CU). One permission is also already live: committee voting for the F&P Supervisor and F&P Officer roles. Deleting or accepting this draft does not undo any of it.

## Risk

Low. Every change is either read-only, a fallback for something that used to fail, or a page gate that matches what the database already allows.

## Verification to run on approval (read-only)

1. Run the full app test suite and confirm it passes.
2. Check the latest preview build has no errors.
3. In the browser, as a licensee, open New Post-Licence Request with the header regulator set to a different regulator and confirm the forms still appear.
4. Confirm the existing finding and examination pages still open for Prudential Supervisor.

No code changes, publishing or data changes are part of this step.
