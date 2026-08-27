#!/usr/bin/env bash
# Runs pgTAP suites and reports per-file pass/fail counts plus failing assertions.
set -uo pipefail
total_ok=0; total_fail=0
for f in "$@"; do
  out=$(psql "$SUPABASE_DB_URL" -X -q -f "$f" 2>&1)
  ok=$(printf '%s\n' "$out" | grep -cE '^[[:space:]]*ok [0-9]+')
  bad=$(printf '%s\n' "$out" | grep -cE '^[[:space:]]*not ok [0-9]+')
  # Only real failures count: psql NOTICE/WARNING lines are informational.
  err=$(printf '%s\n' "$out" | grep -cE '^(psql:.*(ERROR|FATAL)|ERROR)')
  echo "=== $f : ok=$ok not_ok=$bad errors=$err"
  printf '%s\n' "$out" | grep -E '^[[:space:]]*not ok [0-9]+' | cut -c1-200
  printf '%s\n' "$out" | grep -E '^(psql:.*(ERROR|FATAL)|ERROR)' | cut -c1-200 | head -5
  total_ok=$((total_ok+ok)); total_fail=$((total_fail+bad+err))
done
echo "TOTAL ok=$total_ok failures=$total_fail"
