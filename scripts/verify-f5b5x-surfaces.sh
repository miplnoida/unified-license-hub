#!/usr/bin/env bash
# ============================================================================
# verify:f5b5x — surface half of the gate.
#
# Proves the client no longer reproduces regulatory algorithms and that the
# repaired Quick Action routes resolve to real, registered routes.
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

pass=0; fail=0
check() { # name, condition_result
  if [ "$2" = "0" ]; then echo "PASS  S-$1"; pass=$((pass+1));
  else echo "FAIL  S-$1"; fail=$((fail+1)); fi
}

# S-01..S-03: no client regulatory heuristics for F5 classification
! rg -n "type === 'post_license'|\\.type === 'post_license'" src --glob '!src/test/**' --glob '!*.test.*' \
  | rg -qv "form_type === 'post_license'" 
check "01 no client data.type classification heuristic" $?

rg -q "request_kind" src/lib/applicationCategory.ts
check "02 classification helper reads server request_kind" $?

rg -q "application_workflow_view" src/lib/workflowApprovalResolver.ts
check "03 workflow resolution delegates to the server resolver" $?

rg -q "post_license_service_form_set" src/pages/NewPostLicenseApplication.tsx
check "04 post-license intake uses the server form resolver" $?

# S-10..S-16: resolver must contain NO browser workflow algorithm (absence proofs)
R=src/lib/workflowApprovalResolver.ts

rg -q "application_workflow_view" "$R"
check "10 resolver calls application_workflow_view" $?

! rg -q "supabase\\.from\\(|from\\('(services|approval_workflows|approval_steps|workflow_instances|categories|sectors|site_settings)'" "$R"
check "11 resolver performs no direct table queries" $?

! rg -q "workflow_id'\\)|select\\('workflow_id" "$R"
check "12 resolver no longer reads services.workflow_id" $?

! rg -q "matchWorkflowForApplication|resolveEffectiveRegulator|resolveAttachedActiveWorkflow|matchesLegacyLicenseType|entityTypesForApplication" "$R"
check "13 hierarchical browser workflow algorithm removed" $?

rg -q "server_unresolved" "$R" && rg -q "unresolved_unsaved" "$R"
check "14 resolver fails closed on RPC failure and on unsaved applications" $?

! rg -q "getGlobalReviewEnabled" src --glob '!*.test.*'
check "15 client global-review duplication retired" $?

rg -q "request_kind" src/hooks/useOpenPostLicenseRequests.ts
check "16 persisted classification uses request_kind" $?

# S-05..S-08: Quick Action routes must exist
for route in "/post-license/new" "/payments" "/entity/returns"; do
  rg -q "path=\"${route}\"" src/routes
  check "route ${route} is registered" $?
done

# S-09: no dead Quick Action targets remain
! rg -q "href: '/(returns|upload-returns|billing/post-licensee|post-license)'," src/components/dashboard/QuickActions.tsx
check "09 no unreachable Quick Action targets" $?

echo "----"
echo "verify:f5b5x surfaces — passed=${pass} failed=${fail}"
[ "$fail" = "0" ] || exit 1
