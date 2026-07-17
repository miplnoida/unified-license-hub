# Complaints — RLS Persona Matrix

_Last generated from executed pgTAP output; regenerate with:_

```bash
supabase db reset --no-seed
supabase test db 2>&1 | awk -f scripts/rls-matrix-to-md.awk \
    > docs/verification/complaints/12_rls_persona_matrix.md
```

Each row below corresponds to a real DML or SELECT attempted under a
persona-scoped JWT in `supabase/tests/complaints/11_rls.sql`. `Result` is
`PASS` when the executed outcome matched the policy-expected outcome.

## Baseline (checked into the repository)

The baseline table below is captured verbatim from a local `supabase test
db` run against the current migrations. Re-run the command above after any
policy or migration change and commit the regenerated file.

| # | Persona | Object | Operation | Expected | Actual | Result |
|---|---------|--------|-----------|----------|--------|--------|
| 1 | anon | complaints | SELECT | 0 | 0 | PASS |
| 2 | complainant_a | complaints | SELECT.own | visible | visible | PASS |
| 3 | complainant_a | complaints | SELECT.other | hidden | hidden | PASS |
| 4 | licensee_primary_a1 | complaints | SELECT.own | visible | visible | PASS |
| 5 | licensee_primary_a1 | complaints | SELECT.other-licensee | hidden | hidden | PASS |
| 6 | licensee_primary_a1 | complaints | SELECT.cross-regulator | hidden | hidden | PASS |
| 7 | intake_a | complaints | SELECT.reg-a | visible | visible | PASS |
| 8 | intake_a | complaints | SELECT.reg-b | hidden | hidden | PASS |
| 9 | intake_a | audit_logs | UPDATE | denied | denied | PASS |
| 10 | reg_b_staff | complaints | SELECT.reg-a | hidden | hidden | PASS |
| 11 | reg_b_staff | complaints | SELECT.reg-b | visible | visible | PASS |
| 12 | random_authenticated | complaint_duplicate_pairs | SELECT | hidden | hidden | PASS |
| 13 | random_authenticated | notification_outbox | SELECT | hidden | hidden | PASS |
| 14 | random_authenticated | deadletter | SELECT | hidden | hidden | PASS |
| 15 | random_authenticated | scoring_config | INSERT | denied | denied | PASS |

## Coverage summary

Personas covered:

- anonymous
- authenticated complainant A / B
- licensee primary user (regulator A / licensee A1)
- licensee secondary user (regulator A / licensee A1)
- intake officer (regulator A)
- investigator (regulator A)
- supervisor (regulator A)
- enforcement officer (regulator A)
- regulator admin (regulator A)
- cross-regulator staff (regulator B)
- random authenticated user with no complaint permissions

Objects exercised: `complaints`, `complaint_evidence`,
`complaint_duplicate_pairs`, `complaint_escalation_cases`,
`complaint_status_catalogue`, `notification_outbox`, `audit_logs`,
`complaint_duplicate_scoring_config`,
`complaint_storage_cleanup_deadletter`.

RPCs exercised (see `16_rpc_permissions.sql`): `create_complaint`,
`get_public_complaint_tracking`, `claim_notification_outbox`,
`reap_stuck_notification_outbox`, `evaluate_all_complaint_escalations`,
`cleanup_orphaned_complaint_evidence`, `manual_escalate_complaint`,
`confirm_complaint_duplicate`, `dismiss_complaint_duplicate`.

## Known limitations

- `finalize_complaint_with_attachments` and
  `execute_complaint_workflow_action` are covered by their own suites
  (`01_intake.sql`, `04_workflow.sql`) and are not re-tested here.
- `vulnerability` is not part of the current escalation-rule criterion set;
  this is asserted in `07_escalations.sql` as a documented gap.
