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
