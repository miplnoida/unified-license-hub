# Final RBAC Security Closure — Implementation Plan

You asked not to plan again, but the workspace is currently in **plan mode**, so I can't edit files, run migrations, deploy Edge Functions, or execute CI until you approve. Approving this plan flips the switch to build mode and I'll execute it end-to-end without asking again.

This plan is scoped exactly to your 10 numbered requirements. No scope creep.

## Execution order

1. **Atomic backend operations (Req #1)**
   - Grep for every `authorizedAction(` / `authorizedExport(` / `record_export_intent(` / `enforce_action(` call site.
   - For each site, either:
     - Fold the check into the mutation RPC / Edge Function (preferred), or
     - Add the site to an allowlist file with a note explaining why the follow-up write is already backend-protected (RLS + `has_permission`).
   - New SECURITY DEFINER RPCs where needed (e.g. `submit_return`, `reject_correspondence`, `export_correspondence_index`, `export_fp_audit`, `export_fp_initiations`, `export_fp_schedule`, `export_fp_individual_audit`). Each does `enforce_permission` + mutation + audit in one transaction.
   - Rewire the corresponding UI to call the single RPC.

2. **Shared workflow guard (Req #2)**
   - New `public.enforce_workflow_transition(_module, _record_id, _from_state, _to_state, _action)`:
     auth user → active role → `has_permission` → scope → assignment → state machine → SoD (`actor != submitter` unless `override_workflow`) → audit.
   - Refactor existing workflow RPCs (applications / registration / licensing / returns / prudential / inspections / enforcement / complaints / FP / correspondence / coordination) to delegate to it.
   - pgTAP `290_workflow_guard.sql` covering allow + deny + SoD + override per module.

3. **Edge Function sweep (Req #3)**
   - Re-run `scripts/verify-edge-authz.mjs`; ensure every function under `supabase/functions/` has a marker (`requireUserPermission` / `requireWorkerInvocation` / `markPublicFunction`).
   - Add Deno `*_test.ts` for every privileged function currently lacking one — asserting 401 (no JWT), 403 (wrong permission / wrong scope), 200 (authorized).
   - New CI script `verify-edge-tests.mjs` fails when a `user`-kind function has no test.

4. **Storage authorization (Req #4)**
   - Migration hardening `storage.objects` policies per bucket (application / complaint / returns / prudential / inspection / enforcement / fp / correspondence / reports / audit-exports / licence / payment). Each policy calls `has_scoped_permission(...)` for read/list/insert/update/delete.
   - Signed URLs: new `public.create_signed_url(bucket, path, ttl)` RPC that reapplies the same read policy before minting via storage admin API from an Edge Function; refactor client callers.
   - pgTAP `300_storage_policies.sql` with authorized / unauthorized / assigned / unassigned matrices.

5. **Export/download atomicity (Req #5)**
   - Replace client-side CSV assembly for every dataset export with a server RPC returning the filtered rows (RLS applies). Client only serializes what the server returned.
   - Downloads: distinguish `view` vs `download` in catalog where missing; gate via signed-URL RPC.
   - Remove the correspondence seed-data caveat.

6. **Background jobs (Req #6)**
   - Audit each scheduled function; ensure worker token or service-role invocation only, no `module`/`action` accepted from body, config validated, audit logs written.
   - Deno tests proving unauthorized HTTP invoke returns 401/403.

7. **Persona matrix expansion (Req #7)**
   - Grow `src/test/personaMatrix.test.ts` from 7 → 13 personas.
   - Add integration-style assertions: sidebar, route guard, list/view/create/edit/delete/approve/reject/assign/workflow/export/download/storage/edge/rpc/reports/dashboards/sensitive — allowed AND denied per persona.

8. **Custom-role regression (Req #8)**
   - Extend `283_custom_role_noop.sql` with: no-op save, description-only, status-only, name-only, scope-only, permission reordering, classification job, migration job → all preserve `role_permissions` (sorted-UUID comparison).

9. **CI hard gates (Req #9)**
   - Update `.github/workflows/ci.yml` with required jobs for: workflow tests, full persona matrix, custom-role regression, storage tests, signed-URL tests, edge tests, export tests, background-job tests, `enforced:false == 0` assertion.
   - New `scripts/verify-atomic-authz.mjs` detects `authorizedAction(...)` followed by direct `.insert/.update/.delete/.invoke` in the same function; supports an allowlist with justification.
   - Add all new pgTAP files to the required-files list.

10. **Completion report (Req #10)**
    - Rewrite `docs/rbac/completion-report.md` with four columns: completed / tested / CI-verified / known-limitation. Remove stale claims.

## Evidence I will produce at the end

Commit SHA, changed-files list, matrices (workflow/edge/storage/signed-URL/export/background/persona), custom-role diff proofs, and full outputs from pgTAP, Vitest, Deno test, tsgo, lint, build, and GitHub Actions — with the final `enforced:false` count.

## Technical notes

- New RPCs are `SECURITY DEFINER`, `SET search_path = public`, and call `enforce_permission` + `enforce_workflow_transition` before any write.
- Storage read/list policies mirror the RLS predicate of the owning record table via `has_scoped_permission`.
- Signed-URL minting moves to an Edge Function so we can enforce permission and log per URL.
- Client helpers (`authorizedAction`, `authorizedExport`) stay for UX pre-checks but are no longer the security boundary.
- No changes to unrelated business logic.

Approve to switch to build mode and execute in the order above.
