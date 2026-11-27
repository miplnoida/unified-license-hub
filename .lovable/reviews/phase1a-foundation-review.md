# Foundation stability and permission review

Read-only static review; no project files changed. No builds, tests, or live DB checks run. No AML/CFT or supervisory_assessment review. CONFIRMED is source-proven control flow, not a claim that a particular production request failed. Severity concerns the observed UI/contract issue unless stated otherwise.

## Module/page inventory and route integrity

| Module | Pages/routes inspected | Route conclusion |
|---|---|---|
| Master Configuration | MasterConfiguration; /admin/masters/{sectors,sub-sectors,categories,services}; MasterDataManagement | settings.view module route; action gaps below |
| Regulatory Management | RegulatorManagement; /admin/regulators; RegulatoryDataModel | settings.view route; regulator writes use GuardedButton/useCan and governed writer |
| User & Employee Management | UserManagement, ManageWebUsers, OperatingStructure; /admin/users, /admin/web-users, /admin/operating-structure | user_management.view route; web-user load defect below |
| Roles & Permissions | RoleManagement; /admin/roles; PermissionCoverageReport and DecisionAuthorityManager | roles view guard; coverage has exact view_coverage and authority has manage_config guard |
| Organisation/Institution Management | ManageLicensees, LicenseeDetailPage, EntityMemberships, OperatingStructure, MyInstitution | license_management/entity_membership/user_management guards; MyInstitution has P + approved membership/RPC |
| Workflow Designer | src/pages/workflows/WorkflowList.tsx at /workflows | workflow_management.view; WorkflowConfig.tsx is an unused sample page, not a confirmed broken live route |
| Form Builder | FormManagement, FormBuilder, FormTemplateView; /admin/forms, /admin/forms/create, /admin/forms/:templateId/view | form_management.view route; builder action guard gap below |
| Package Configuration | SubscriptionPackageSettings; /settings/package | static SettingsRoute and package contract gap below |
| Audit & Security Events | AuditLogs, ComplianceAuditLogs, AuditExport; /admin/audit-logs, /admin/compliance-audit-logs, /admin/audit-export | settings.view module routes; read-error defects below |

A static scan of `import('...')` targets in src/routes found **no missing target files**. No confirmed route-to-missing-component/import defect in reviewed modules. This does not certify default exports or every database-driven navigation link; no build was run. The nonexistent filename WorkflowDesigner.tsx is not evidence of a broken route: /workflows imports WorkflowList.

## Confirmed defects and precise minimal fixes

### F01 — Settings pages bypass dynamic module permission (Medium)
- Location: `src/components/auth/RouteGuards.tsx:187–194`, used by `src/routes/settingsRoutes.tsx:23–46`.
- Static admin is admitted even if canonical settings.view is absent; authorized non-static-admin staff are excluded. This differs from M/module guards elsewhere.
- Exact minimal replacement of SettingsRoute return: `return <ModuleRoute module="settings">{children}</ModuleRoute>;` (ModuleRoute is already in the same file). Preserve P in S. Confirm any stricter package-management authority separately; do not grant it implicitly.

### F02 — Master Configuration exposes writes to view-only users (Medium)
- Location: `src/pages/admin/MasterConfiguration.tsx:253–260` and the adjacent Add/edit/retire actions; route `src/routes/adminRoutes.tsx:161–164` requires only view.
- Plain Button with data-rbac="settings.edit" does not check permission; `src/components/ui/button.tsx:43–47` simply spreads props. No global data-rbac enforcement found.
- Minimal change: import GuardedButton and useCan; replace mutation-triggering plain buttons with `<GuardedButton module="settings" action="edit" ...>`. Hide edit/retire row actions when `!canEdit`; at start of save/import/delete handlers return if `!useCan('settings','edit')` (call hook at component top, not inside handlers). Sample-download can remain available to viewers. Backend config_save/config_retire remains authoritative.

### F03 — Workflow mutation controls are metadata-only (Medium)
- Location: `src/pages/workflows/WorkflowList.tsx:803,848,988,992–997,1406,1439`; /workflows guarded only by view (`src/routes/dashboardRoutes.tsx:316`).
- New Workflow/Save as Template/Edit/Add Step controls use plain Button data-rbac, not authorization.
- Minimal replacement: GuardedButton with module="workflow_management" and existing data-rbac action (create for create/template; edit for edit/step actions). Add top-level useCan flags and handler early returns for the corresponding mutations, including dialog confirmation controls. Pass canEdit to nested step editors. Do not change read access.

### F04 — Form Builder save has no action permission check (Medium)
- Location: `src/routes/adminRoutes.tsx:113`; `src/pages/admin/FormBuilder.tsx:422,677–678`.
- ModuleRoute requires only form_management.view. Save Form is a plain Button disabled only by save progress; URL /admin/forms/create?id=... can enter editing UI with view permission.
- Minimal change: derive `const canSave = useCan('form_management', editId ? 'edit' : 'create');`; change Save disabled to `isSaving || !canSave`; begin handleSave with `if (!canSave) return;`. Apply the same action check to Excel import writes and their confirmation controls. For read-only rendering, retain view access rather than requiring create for all builder URLs.

### F05 — Taxonomy queries show empty tables while loading or failed (Medium)
- Location: `src/pages/admin/MasterConfiguration.tsx:40–43,244–254`; hooks throw in `src/hooks/useMasterConfig.ts:25–62`.
- Loading flags are read but not passed/rendered; error state is not read. Query failure leaves default [] and ordinary empty table.
- Minimal change: retain each query result object; include `loading: q.isLoading`, `error: q.error`, `retry: q.refetch` in per-tab cfg. Before DataTableShell render loading text/skeleton when cfg.loading, an alert + retry when cfg.error, otherwise the table. Do not invent an unsupported loading prop on DataTableShell.

### F06 — Regulator list and statistics hide load failures (Medium)
- Location: `src/pages/admin/RegulatorManagement.tsx:27–50,87,210–224` (DataTableShell block).
- List reads isLoading but does not render it or an error. Stats queryFns discard Supabase errors and return [] (zero counts), including while initial data is loading.
- Minimal change: list query destructures error/refetch and renders loading/error before table. In each stats query use `const { data, error } = await q; if (error) throw error; return data || [];`; propagate loading/error from all four stats queries and render “Loading…”/“Unavailable” instead of 0 until successful. Existing real write gates should remain unchanged.

### F07 — Web-user read errors silently become empty/stale data (Medium)
- Location: `src/pages/admin/ManageWebUsers.tsx:50–71`.
- functions.invoke resolves with `{error}` for HTTP/function failures; Promise.all does not throw that automatically. usersRes.error and licensee query error are discarded; catch therefore does not cover common failures. No profiles leaves old/empty users.
- Minimal replacement of the Promise.all destructuring with `[usersRes, licenseesRes]`; immediately `if (usersRes.error) throw usersRes.error; if (usersRes.data?.error) throw new Error(usersRes.data.error); if (licenseesRes.error) throw licenseesRes.error;`. Read licenseesRes.data after checks. Add persistent fetchError and render alert/retry rather than a normal empty list; clear fetching in finally.

### F08 — Role list failures look like no roles (Medium)
- Location: `src/pages/admin/RoleManagement.tsx:256–260,769`; `src/hooks/useRoles.ts:60–80`.
- useRoles throws query errors, but page only consumes data/isLoading; failed initial load reaches “No roles found”. Permission catalogue queries also default to [] without error UI.
- Minimal change: destructure `error: rolesError, refetch: refetchRoles` and render error/retry before empty row. Track permissions/allRolePerms/catalogue loading/error and withhold permission editor/save until all required reads succeed. In useRoles check legacy mirror response error too before treating scope_config as {} (failure is not empty authority).

### F09 — Workflow failures are shown as no workflows (Medium)
- Location: `src/pages/workflows/WorkflowList.tsx:149–150,842–847`.
- Primary useWorkflows result only consumes data/isLoading. Its failure renders “No workflows for …”. Separate workflow-types error handling does not handle this query.
- Minimal change: destructure primary `error: workflowsError, refetch: retryWorkflows`, add error/retry branch before workflows.length empty branch, and prevent recovery/create suggestions while either primary/recovery query failed. Handle steps and role catalogue errors separately before allowing edits.

### F10 — Audit logs discard query failures (Medium)
- Location: `src/pages/admin/AuditLogs.tsx:48–78,226`.
- `const { data, count } = await q` discards error and replaces records/count with empty/zero; UI says “No audit logs found”.
- Minimal change: destructure error, throw on error, wrap fetchPage in try/catch/finally; store loadError and show persistent alert/retry. Only replace logs/total on success; finally clear both loading flags. Mark retained data as stale if a refresh fails.

### F11 — Compliance/security history errors masquerade as empty audit history (Medium)
- Location: `src/pages/admin/ComplianceAuditLogs.tsx:185–189,200–209,212–225,240–250`; empty rows at `:372,541`.
- loadAll only console.warn's errors and clears rows; loadCase/loadInitiations/loadSec discard error entirely. Initial loading state also starts false, briefly presenting an empty result before effect runs.
- Minimal change: each loader checks error before replacing data, uses try/catch/finally to clear its own pending flag, stores a per-tab error and renders alert/retry before the empty branch. Initialize the initially active tab as loading, or track successful-load flag; use “No entries” only after a successful read. Preserve previous results on refresh failure and label them stale.

### F12 — Audit export job query errors render “No exports yet” (Medium)
- Location: `src/pages/admin/AuditExport.tsx:42–48,169,217`.
- queryFn throws but query result only exposes data/isLoading. No isError/error branch precedes empty table.
- Minimal change: destructure `error: jobsError, refetch: refetchJobs`; change rendering order to loading, error alert/retry, then table. No mutation contract change needed.

### F13 — Package configuration has no checked-in backend contract (High conditional deployment impact)
- Location: `src/hooks/useSubscriptionPackage.ts:21–25`; `src/pages/settings/SubscriptionPackageSettings.tsx:60`.
- Repository search under supabase finds neither system_subscription_package nor system_subscription_package_set. Their absence in repository is CONFIRMED; absence in deployed DB is NOT confirmed. If deployed from these migrations alone, package reads fail and all non-core modules are withheld. This is deliberately fail-closed, not a frontend bug to “fix” by enabling everything.
- Minimal fix: verify deployed table/RPC first; if absent add a versioned DB migration for table, initialized singleton, read RLS, permission-checked setter RPC and audit trail. Cannot safely repair missing DB contract in frontend alone. Existing hook error/retry behavior is correct.

### F14 — Operating Structure reports “not configured” on pending/failed query (Low)
- Location: `src/pages/admin/OperatingStructure.tsx:34–35,52`.
- `(regulators.data || [])[0]?.name || 'Regulator not configured'` conflates pending/error with a successfully empty register.
- Minimal replacement: `const regulatorName = regulators.isLoading ? 'Loading regulator…' : regulators.error ? 'Regulator unavailable' : (regulators.data?.[0]?.name || 'Regulator not configured');`; show retry when error. Multiple-regulator selection semantics require separate product confirmation.

## Suspected / not established

- **SUSPECTED — audit permission mismatch:** audit/security pages use settings.view although audit_management/security_management modules exist. Confirm the intended canonical policy before changing guards. Source proves the mismatch, not that settings administrators should be excluded.
- **SUSPECTED — scope editing after mirror load failure:** useRoles ignores the roles scope mirror error and supplies {}. This is a confirmed error-masking behavior; loss of scope restrictions on save depends on the server save contract and was not established.
- **SUSPECTED — async filter races:** AuditLogs/ComplianceAuditLogs have no visible request sequencing/cancellation; older filter responses can overwrite newer ones. Add request-generation token if reproduced. Not reported as a confirmed observed race.
- **Runtime exception risks:** no unconditional runtime crash was confirmed in reviewed foundation paths. FormBuilder validates snapshot structure; treating every JSON cast as a proven crash would overstate evidence. Invalid/manual dates passed to toISOString remain a boundary-test candidate, not a confirmed normal input failure.
- **Entity isolation / regulator-sector scope:** approved membership reads and RPC contracts exist, but this was not a complete final-policy census or two-user penetration test. Do not infer a server leak merely from optional client filters or licensed-role route admission.

## Suggested verification for the applying agent

Add targeted tests for denied settings.view direct URLs; view-only master/workflow/form mutation controls; rejected queries rendering errors rather than no-records; primary/secondary/revoked memberships; package missing-table/RPC behavior. Run existing related tests (e.g. RouteGuards, adminNavGates, accessLevels, ComplianceAuditLogs) after implementing changes. No tests were run here because the checkout was kept strictly read-only and no implementation was made.
