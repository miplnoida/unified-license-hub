# Fix: audit-log call fails with "log_compliance_audit(... ) does not exist"

## What's happening

The shared compliance audit-logging routine expects the record identifier as text, but eleven configuration routines pass the raw record id without converting it. Postgres finds no matching function and aborts the whole action, so publishing, rolling back, archiving and cloning fail at the final audit step even though the change itself was valid.

Confirmed by inspection: the audit routine's third parameter is text, and the call sites listed below pass an unconverted id.

## Affected actions

- Prudential thresholds: publish, rollback, archive
- Prudential ratios: publish, rollback, archive
- Return validation rules: publish, rollback, archive, clone
- Validation run logging

## Technical changes

One migration, no frontend changes:

1. Recreate each of the eleven routines with the identifier argument explicitly converted to text (`_id::text`) in the `log_compliance_audit` call. This is the same pattern already used by the conduct, thematic and integration routines, which work correctly.
2. No signature, permission, or behaviour change otherwise — bodies stay byte-identical apart from the cast.
3. Verify afterwards that a threshold archive → publish → rollback cycle succeeds and writes a `compliance_audit_logs` row, and spot-check a validation-rule publish.

## Out of scope

No change to the audit function's signature, to grants/RLS, or to the admin UI.
