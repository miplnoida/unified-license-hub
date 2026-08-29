#!/usr/bin/env bash
# F5-B4 source parity: proves supabase/migrations/*_f5b4_fp_linkage_source_parity.sql
# contains the EXACT live definition of every object in the B4 contract, so a
# repository reset + forward migration reproduces the live contract.
set -euo pipefail

FILE=$(ls supabase/migrations/*_f5b4_fp_linkage_source_parity.sql | tail -1)
FUNCS=(
  "public.ensure_post_license_fp_links(uuid)"
  "public.post_license_fp_subjects(uuid)"
  "public.post_license_fp_readiness(uuid)"
  "public.post_license_fp_overview(uuid)"
  "public.post_license_effect_plan(uuid)"
  "public.assert_post_license_fp_effect_alignment(uuid)"
  "public.apply_post_license_effect(uuid)"
  "public.submit_application(uuid,text)"
)

fail=0
for f in "${FUNCS[@]}"; do
  psql -At -c "select pg_get_functiondef('$f'::regprocedure)" > /tmp/f5b4-live.sql
  if grep -qF -f <(head -1 /tmp/f5b4-live.sql) "$FILE" && \
     python3 - "$FILE" /tmp/f5b4-live.sql <<'PY'
import sys
src=open(sys.argv[1]).read(); live=open(sys.argv[2]).read().strip()
sys.exit(0 if live in src else 1)
PY
  then
    echo "PASS | source parity | $f"
  else
    echo "FAIL | source parity | $f (live definition not present verbatim in $FILE)"
    fail=1
  fi
done

exit $fail
