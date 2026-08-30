#!/usr/bin/env bash
# Continue a `migration-chain.sh fresh` replay past its 200-failure abort cap.
#
# migration-chain.sh deliberately stops after 200 failures so that a broken
# early migration cannot burn the whole run. That cap means the tail of the
# history is never reached, so a per-segment replay proof (e.g. "does the F8A-B3
# segment reproduce the live function definitions?") is impossible from `fresh`
# alone. This resumes the same disposable cluster/database from a given
# migration filename with no failure cap, then prints the definitions requested
# on the command line.
#
#   replay-continue.sh <from-migration-filename> [proname ...]
set -uo pipefail

UNPRIV="${RC1_PG_USER:-lovable}"
if [ "$(id -u)" = "0" ]; then
  UID_N="$(id -u "$UNPRIV")"; GID_N="$(id -g "$UNPRIV")"
  exec setpriv --reuid "$UID_N" --regid "$GID_N" --clear-groups \
    env HOME="/tmp/rc1-pg" USER="$UNPRIV" PATH="$PATH" \
    bash "${BASH_SOURCE[0]}" "$@"
fi

FROM="${1:?usage: replay-continue.sh <from-migration-filename> [proname ...]}"
shift || true
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MIGRATIONS="$ROOT/supabase/migrations"
LOGDIR=/tmp/rc1-migrations
LOG="$LOGDIR/continue-failures.log"
mkdir -p "$LOGDIR"

unset PGHOST PGHOSTADDR PGPASSWORD PGSERVICE PGSSLMODE PGDATABASE PGUSER PGPORT PGAPPNAME
export PGHOST=/tmp PGPORT=55432 PGUSER="$(id -un)" PGDATABASE=rc1_fresh

applied=0; failed=0
: >"$LOG"
for f in "$MIGRATIONS"/*.sql; do
  name="$(basename "$f")"
  [[ "$name" < "$FROM" ]] && continue
  tmp="$LOGDIR/continue-current.sql"
  sed -E 's/CREATE +EXTENSION +(IF +NOT +EXISTS +)?"?(pg_cron|pg_net|pgtap|pgjwt|pgsodium)"?[^;]*;/SELECT 1;/Ig' "$f" >"$tmp"
  args=(-v ON_ERROR_STOP=1 -q -d rc1_fresh -f "$tmp")
  grep -qi "CONCURRENTLY" "$f" || args=(--single-transaction "${args[@]}")
  if ! out=$(psql "${args[@]}" 2>&1); then
    failed=$((failed + 1))
    { echo "=== FAIL $name"; echo "$out" | grep -E "ERROR|DETAIL" | head -4; } >>"$LOG"
  else
    applied=$((applied + 1))
  fi
done
echo "CONTINUE_FROM=$FROM APPLIED=$applied FAILED=$failed"

for pn in "$@"; do
  echo "=== DEF $pn"
  psql -At -d rc1_fresh -c \
    "SELECT coalesce(string_agg(pg_get_functiondef(oid), E'\n'), 'ABSENT')
       FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace AND proname = '$pn';"
done
