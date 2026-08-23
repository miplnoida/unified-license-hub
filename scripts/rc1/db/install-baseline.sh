#!/usr/bin/env bash
# RC1 §1 — apply the install baseline to a disposable local database and verify
# structural parity with the certified schema.
#
#   install-baseline.sh [dbname] [--from <migration>]
#
# The baseline is the fresh-install path (platform bootstrap -> baseline ->
# forward migrations newer than the baseline marker). Nothing here touches the
# hosted project: PG* is re-pointed at the local cluster before any psql call.
set -uo pipefail

UNPRIV="${RC1_PG_USER:-lovable}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p /tmp/rc1-pg /tmp/rc1-migrations
  chown -R "$UNPRIV" /tmp/rc1-pg /tmp/rc1-migrations
  UID_N="$(id -u "$UNPRIV")"; GID_N="$(id -g "$UNPRIV")"
  exec setpriv --reuid "$UID_N" --regid "$GID_N" --clear-groups \
    env HOME=/tmp/rc1-pg USER="$UNPRIV" PATH="$PATH" bash "${BASH_SOURCE[0]}" "$@"
fi

DB="${1:-rc1_baseline}"
FROM_MIGRATION="${3:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BASE="$ROOT/supabase/baseline"
LOGDIR=/tmp/rc1-migrations
PORT=55432
mkdir -p "$LOGDIR"

unset PGHOST PGHOSTADDR PGPASSWORD PGSERVICE PGSSLMODE PGDATABASE PGUSER PGPORT
export PGHOST=/tmp PGPORT=$PORT PGUSER="$(id -un)" PGDATABASE=postgres

if ! pg_isready -q -h /tmp -p $PORT 2>/dev/null; then
  [ -d /tmp/rc1-pg/data ] || initdb -D /tmp/rc1-pg/data -U "$PGUSER" --no-locale --encoding=UTF8 >"$LOGDIR/initdb.log" 2>&1
  pg_ctl -D /tmp/rc1-pg/data -o "-k /tmp -p $PORT -c listen_addresses='' -c fsync=off \
    -c synchronous_commit=off -c full_page_writes=off -c max_locks_per_transaction=8192 \
    -c statement_timeout=0" -l "$LOGDIR/postgres.log" -w start >>"$LOGDIR/initdb.log" 2>&1
fi

dropdb --if-exists "$DB" >/dev/null 2>&1
createdb "$DB" || { echo "INSTALL=FAIL createdb"; exit 1; }

run() { # file -> appends errors to log, returns error count
  local f="$1" log="$2"
  psql -q -d "$DB" -f "$f" 2>&1 | grep -E "^psql:.*ERROR" >>"$log" || true
}

LOG="$LOGDIR/baseline-$DB.log"; : >"$LOG"
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/rc1/db/bootstrap.sql" >>"$LOG" 2>&1 \
  || { echo "INSTALL=FAIL bootstrap"; tail -20 "$LOG"; exit 1; }


# 40_functions is applied twice: table DDL can reference functions (generated
# columns / check constraints) while function bodies reference tables. Both
# passes run with check_function_bodies = off and every statement is
# CREATE OR REPLACE, so only the second pass is authoritative — the first
# pass logs to a scratch file so pre-table resolution noise is not counted.
run "$BASE/10_types.sql" "$LOG"
run "$BASE/20_sequences.sql" "$LOG"
run "$BASE/40_functions.sql" "$LOGDIR/baseline-functions-pass1-$DB.log"
for phase in 30_tables 40_functions 55_defaults \
             60_constraints_pk 62_indexes 64_constraints_check_fk; do
  run "$BASE/$phase.sql" "$LOG"
done



# Views depend on each other: apply repeatedly until no further progress.
VIEWLOG="$LOGDIR/baseline-views-$DB.log"
python3 - "$BASE/50_views.tsv" "$DB" "$VIEWLOG" <<'PY'
import subprocess, sys
tsv, db, log = sys.argv[1], sys.argv[2], sys.argv[3]
pending = []
for line in open(tsv):
    line = line.rstrip("\n")
    if not line.strip():
        continue
    name, ddl = line.split("\t", 1)
    pending.append((name, ddl))
for _ in range(12):
    remaining = []
    for name, ddl in pending:
        p = subprocess.run(["psql", "-q", "-d", db, "-v", "ON_ERROR_STOP=1", "-c", ddl],
                           capture_output=True, text=True)
        if p.returncode != 0:
            remaining.append((name, ddl))
            last = p.stderr
    if len(remaining) == len(pending):
        break
    pending = remaining
    if not pending:
        break
with open(log, "w") as fh:
    for name, _ in pending:
        fh.write(f"VIEW_FAILED {name}\n")
print(f"VIEWS_FAILED={len(pending)}")
PY

for phase in 70_triggers 80_rls 82_policies 90_grants_tables 92_grants_functions; do
  run "$BASE/$phase.sql" "$LOG"
done

( cd "$BASE" && psql -q -d "$DB" -f 95_seed.sql 2>&1 | grep -E "ERROR" >>"$LOG" || true )

# Forward migrations newer than the baseline marker (empty today; the mechanism
# is what is being certified).
if [ -n "$FROM_MIGRATION" ]; then
  cnt=0
  for f in "$ROOT"/supabase/migrations/*.sql; do
    [[ "$(basename "$f")" > "$FROM_MIGRATION" ]] || continue
    psql -q -d "$DB" --single-transaction -v ON_ERROR_STOP=1 -f "$f" >>"$LOG" 2>&1 \
      && cnt=$((cnt+1)) || echo "FORWARD_FAIL $(basename "$f")" >>"$LOG"
  done
  echo "FORWARD_MIGRATIONS_APPLIED=$cnt"
fi

echo "BASELINE_APPLY_ERRORS=$(grep -c ERROR "$LOG" || true)"
grep -E "ERROR" "$LOG" | sed -E 's/.*ERROR:  //' | sort | uniq -c | sort -rn | head -10
psql -q -d "$DB" -f "$ROOT/scripts/rc1/db/post-checks.sql"
