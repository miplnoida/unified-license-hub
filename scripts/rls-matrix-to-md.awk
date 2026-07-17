#!/usr/bin/awk -f
# Convert the NOTICE-emitted MATRIX rows from supabase test db output into a
# markdown table for docs/verification/complaints/12_rls_persona_matrix.md.
#
# Input lines look like:
#   psql:.../11_rls.sql:NNN: NOTICE:  MATRIX|persona|object|op|expected|actual
#
# Usage:
#   supabase test db 2>&1 | awk -f scripts/rls-matrix-to-md.awk \
#       > docs/verification/complaints/12_rls_persona_matrix.md

BEGIN {
  print "# Complaints — RLS Persona Matrix (generated)"
  print ""
  print "Generated from executed pgTAP tests in `supabase/tests/complaints/11_rls.sql`."
  print "Each row records a real DML/SELECT attempt under a persona-scoped JWT."
  print ""
  print "| # | Persona | Object | Operation | Expected | Actual | Result |"
  print "|---|---------|--------|-----------|----------|--------|--------|"
  n = 0
}
/MATRIX\|/ {
  # Strip everything up to and including MATRIX|
  sub(/^.*MATRIX\|/, "")
  gsub(/\r/, "")
  split($0, f, "|")
  persona = f[1]; object = f[2]; op = f[3]; expected = f[4]; actual = f[5]
  n++
  result = (expected == actual) ? "PASS" : "FAIL"
  printf("| %d | %s | %s | %s | %s | %s | %s |\n",
         n, persona, object, op, expected, actual, result)
}
END {
  print ""
  print "_" n " persona/object/operation assertions recorded._"
}
