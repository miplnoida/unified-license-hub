# Fix: "Identifier type requires a jurisdiction" when adding an identifier

## What is actually happening (confirmed)

The "Add identifier" dialog only collects **type**, **value** and **primary**. But the identifier catalogue governs each type with a uniqueness scope, and the database validation trigger rejects rows that are missing the scope's required context:

- Company Registration Number — scope `JURISDICTION` → jurisdiction required
- Taxpayer Registration Number — scope `JURISDICTION` → jurisdiction required
- Legal Entity Identifier (LEI) — scope `GLOBAL` → nothing extra needed
- Regulatory Entity Number — scope `REGULATOR` → filled in automatically from the entity's lead regulator

So Apex Commercial Bank succeeds for LEI and the Regulatory Entity Number, and fails for the two registry numbers with exactly the error shown. The register function already accepts a jurisdiction and an issuer — the dialog simply never asks for them.

## Fix

Make the dialog scope-aware (UI only; no backend or validation changes):

1. Load the full governed type metadata (scope, issuer hint, format hint, validation pattern) instead of just id/key/label.
2. When the selected type's scope is `JURISDICTION`, show a required **Jurisdiction** select (countries list) and pass it to the register call.
3. When the scope is `ISSUER`, show a required **Issuer** field and pass it through.
4. For `GLOBAL` and `REGULATOR` scopes, show nothing extra — the regulator is derived server-side.
5. Keep the Register button disabled until the scope's required fields are filled, and show the type's format/issuer hint under the value field so officers know what is expected.
6. Map the remaining server errors to plain-English messages (duplicate active identifier, value normalises to empty, format mismatch) instead of raw SQL text.

## Technical notes

- `src/components/entity-detail/RegisterIdentifierDialog.tsx`: extend the type query, add jurisdiction/issuer state and inputs, pass `_jurisdiction_id` / `_issuer_key` to the existing `entity_identifier_register` RPC.
- Jurisdiction options come from `countries` (readable by authenticated users, 31 rows).
- No migration required: the RPC signature and the validation trigger already support this and stay untouched.

## Verification

Register a Company Registration Number for Apex Commercial Bank with a jurisdiction selected and confirm it appears in the Identity section; re-check that LEI and Regulatory Entity Number still register without extra fields.
