## Credit Union demo data for Sessions 2–4 (live backend, tagged)

You confirmed that new demo records may be added to the live backend. That overrides the brief's stop condition.

Every record will carry the tag `CU-DEMO-2026` in its name or reference, so it is easy to find and filter.

### Guardrails
- **Only new records are added.** Nothing existing is changed or deleted. That covers Rodney Bay's details, Piton, Marigot, Dennery and the other historical entities, `rbc_primary_user` and its membership, and all fees, workflows, forms and security settings.
- **Nothing is forged:**
  - no approvals, licences or payment confirmations
  - no authoritative risk ratings or audit entries
  - no AML/CFT records (the freeze stays)
- **No code, schema, migration or rule changes.**
- **Re-runnable.** Every insert is keyed on a fixed ID or reference and skips rows that already exist.
- **Before/after fingerprint.** I take row counts and update timestamps for existing entities, protected assessments and configuration. Any change on the "after" side means I stop and report.

### Entities
| Session | Entity | Action |
|---|---|---|
| 2 Licensing | Rodney Bay Community Credit Union Ltd (`cc331…`) | Reuse only |
| 3 Prudential | Castries Teachers' Co-operative Credit Union Ltd (CU-DEMO-2026) | New |
| 4 Conduct | Gros Islet Fishermen's Credit Union Ltd (CU-DEMO-2026) | New |

### Important limitation for Sessions 3 and 4
- Valid licences can only come from the governed approval path, and the Credit Union approval workflow is missing.
- So the two new entities are **unlicensed supervised entities**. They get a sector and category, contacts and people, but **no licence**.
- I'll check each Prudential and Conduct screen to see whether it needs a licence. Where one does, I report that screen as a blocker and do not fake a licence.
