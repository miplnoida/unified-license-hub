# 10 · Findings & Remediation Queue

Every finding below has severity, file/table evidence, impact, recommendation, and fix status.
Fix status is `PENDING` for the entire report because the user asked for an audit only —
no functional changes were made this turn.

## Legend

| Severity | Meaning |
|----------|---------|
| Critical | Direct data exposure or privilege escalation is reachable today |
| High     | Reachable with a plausible attack path or insider misuse |
| Medium   | Defence-in-depth gap; low individual likelihood |
| Low      | Hygiene / consistency |
| Info     | Design note, no action needed |

## Findings

| # | Sev | Area | File / Object | Reason | Impact | Recommendation | Fix status |
|---|-----|------|---------------|--------|--------|----------------|-----------|
| 1 | Critical | RLS | 248 / 249 public tables | Policies compose with legacy `has_role(_, 'admin')` and ownership, not the `has_permission` catalog | Any dynamic role that maps to legacy admin inherits full CRUD without a catalog check | Migration wave — replace with `has_permission(auth.uid(), '<module>', '<action>')` (see `05_backend_authorization.md`) | PENDING |
| 2 | Critical | RPC | 290 / 294 `SECURITY DEFINER` functions | Do not call `has_permission`; run bypassing RLS | Anyone with `EXECUTE` can bypass row-level protection | Add guard at function top + revoke `EXECUTE FROM PUBLIC` (see `08_rpc_security.md`) | PENDING |
| 3 | Critical | RPC | 6 `SECURITY DEFINER` functions | Missing `SET search_path` | Schema-hijack risk | Add `SET search_path = public` (linter also flags this) | PENDING |
| 4 | Critical | Storage | 7 private buckets (`documents`, `secure-documents`, `fp-evidence`, `return-uploads`, `payment-documents`, `license-certificates`, `certificate-assets`) | Only 1 policy references `has_permission` | Signed-URL minting via ownership only; any owner-bypass or shared-owner rows leak | Rewrite each policy per template in `07_storage_policies.md` | PENDING |
| 5 | Critical | Storage | `audit-exports` bucket | Private with 0 policies; exports written by service role are unreadable via app role — either broken or bypassed via signed URL | Verify current dispatch path and add explicit SELECT policy | Investigate + add policy | PENDING |
| 6 | High | Route | `/admin` (`AdminHub`) | Wrapped in `<A>` only; hub itself is not guarded per-module and leaks KPI data | Non-admin roles with any admin-adjacent bit see module names / counts | Wrap in `<M module="admin_dashboard">`, gate KPIs by `has_permission` | PENDING |
| 7 | High | Route | `/preview/:versionId`, `/notifications` | Missing module guard | Direct-URL access to form versions or others' notifications | Wrap in `<M>` | PENDING |
| 8 | High | Buttons | Approve / Reject / Reopen surfaces across Returns, Applications, Complaints | Ungated on the client, RPC only checks legacy admin | Reviewer with any dynamic role can call the RPC via network tab | Wrap + add RPC guard | PENDING |
| 9 | High | Buttons | Export / Download / Print in Reports and Compliance | No `<PermissionGate>`; edge functions do not verify caller's `has_permission` | Data exfiltration by anyone with `view` | Introduce `report_management.export`, gate UI + edge fn | PENDING |
| 10 | High | Buttons | Bulk assign / bulk update toolbars | UI-only gating | Insider mass-mutation | Gate toolbar + RPC | PENDING |
| 11 | High | Edge Fn | Deno functions using `service_role` | Do not verify invoking JWT for `has_permission` | Any authenticated user can hit the URL and bypass RLS | Add JWT decode + `has_permission` at top of every function | PENDING |
| 12 | High | Audit / Notifications | `audit_logs`, `security_event_logs`, `notification_outbox` | Read policies open to `authenticated` in some rows | PII exposure (recipient emails, security events) | Gate on `has_permission(_, 'audit_management', 'view')`; restrict `notification_outbox` to `service_role` | PENDING |
| 13 | Medium | Master data | Reference-table writes (`sectors`, `categories`, `return_types`) | UI hides; RLS only checks legacy admin | Insider mis-configuration | Migrate to `has_permission(_, 'master_data_management', 'edit')` | PENDING |
| 14 | Medium | Reports engine | `report_source_columns` / `report_sources` | No per-source permission required to run a report | Report becomes a covert read path around table RLS | Add `required_permission_module` / `_action` and enforce in runner | PENDING |
| 15 | Medium | Settings | `Save` buttons on all `/settings/*` pages | Ungated | Configuration drift by non-admins | Wrap with `<GuardedButton module="settings" action="configure">` | PENDING |
| 16 | Medium | Notifications | Manual `Send email` and correspondence dispatch | Ungated | Insider phishing | `notification_management.dispatch` | PENDING |
| 17 | Medium | AI / Consolidated | FPA / Prudential heavy edge fn triggers | Ungated | Cost & data-exfiltration | `ai_management.execute` | PENDING |
| 18 | Medium | Views | Sensitive views inherit policy from base tables | After RLS wave, re-audit | Cascading gap | Deferred until finding #1 lands | DEFERRED |
| 19 | Low | Menu | Nav parents / children | Verified correct via 10-persona test | None | Keep; add CI check that module keys exist in DB | PENDING |
| 20 | Low | External portal | `<EP capability="…">` capabilities not in catalog | External surface hidden from coverage scanner | Register in `permissions` catalog | Migrate | PENDING |
| 21 | Info | Breakglass | `is_super_admin_by_email` | Intentional | Log every hit | Add trigger to `security_event_logs` | PENDING |

## Prioritised remediation queue (next 3 sprints)

**Sprint 1 — kill schema-hijack + storage exfil (Critical 3, 4, 5, 11).**
- Fix `search_path` on the 6 flagged functions.
- Rewrite storage policies on private buckets.
- Add JWT + `has_permission` guard at the top of every Deno function.
- Add `security_event_logs` trigger for breakglass hits (Info 21).

**Sprint 2 — RPC & RLS catalog wave, Part 1 (Critical 1 & 2 for the top 5 modules by risk):**
`applications`, `complaints`, `returns_filed`, `licensees`, `licenses`. Includes matching RPC guards.

**Sprint 3 — RPC & RLS catalog wave, Part 2 + button coverage push:**
- Remaining modules.
- Wire `<PermissionGate>` around Approve/Reject/Export/Bulk in the top 5 modules; raise
  `MIN_PROTECTED_RATIO` in `actionCoverage.test.ts` to 25 %.
- Introduce `report_management.export`, `notification_management.dispatch`, `ai_management.execute`.

Post-Sprint 3 target: Overall RBAC posture score in `README.md` moves from **D+** to **B**.

## Re-runnable evidence

All raw evidence in this folder is fully regenerable — nothing is a manual copy.

```bash
# RLS matrix
psql -c "..." > docs/rbac/audit-2026-07-21/rls-tables.tsv       # see 06 for the exact query
# RPC matrix
psql -c "..." > docs/rbac/audit-2026-07-21/rpc-functions.tsv    # see 08
# Storage policy matrix
psql -c "..." > docs/rbac/audit-2026-07-21/storage-policies.tsv # see 07
# Unguarded routes
rg -n "<Route\s+path=" src/routes/ src/App.tsx \
  | rg -v "<M>|<S>|<A>|<ModuleRoute|<AdminRoute|<PortalRoute|<S\s|<A\s|<M\s|Navigate\s+to|<LandingRedirect" \
  > docs/rbac/audit-2026-07-21/routes-unguarded.txt
# Permission coverage matrix
bunx tsx scripts/generate-permission-coverage.ts
# Button coverage
bunx vitest run src/test/rbac/actionCoverage.test.ts
```
