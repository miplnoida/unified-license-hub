# Delete six form templates

Remove the following form templates from the backend, matched in the database:

| Form | Type | Status | Existing submissions |
| --- | --- | --- | --- |
| General Insurance License Application | Pre-license | Published | none |
| Pre License Form 2 | Pre-license | Published | 7 (5 submitted, 2 draft) |
| Dummy Form | Pre-license | Published | 7 (5 submitted, 2 draft) |
| Test Form | Pre-license | Archived | none |
| MLRO | Pre-license | Archived | none |
| Credit Union Form 1 | Pre-license | Archived | 2 drafts |

Not touched (similar names, kept): "General Insurance - Change of Registered Address", "General Insurance License Renewal", and the post-license "Approval of MLRO" form.

## How the deletion works

For each template, remove in dependency order: response rows, then field rows and version rows, then the template itself — the same order the admin Forms screen already uses when deleting a form. No return configuration references any of these forms, so nothing in returns scheduling breaks.

Note: deleting Pre License Form 2, Dummy Form, and Credit Union Form 1 also deletes the test application data captured against them (11 response records in total). If any of that data must be kept, say so and those three can be archived instead of deleted.

## Verification

Re-query `form_templates` for the six names and confirm zero rows, and confirm the three similarly named forms above still exist. Then reload /admin/forms and confirm the pre-license list no longer shows them.
