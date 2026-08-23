#!/usr/bin/env bash
# RC1 §1 / §2 — migration certification harness.
#
#   migration-chain.sh fresh              -> empty DB, full history in repo order
#   migration-chain.sh upgrade <cutover>  -> history up to <cutover>, seed data,
#                                            then the remaining migrations
#
# Uses a disposable local PostgreSQL cluster under /tmp/rc1-pg. The remote
# certification project is never touched (all PG* env vars are overridden).
set -uo pipefail

# PostgreSQL refuses to run as root: re-exec the whole harness as the sandbox's
# unprivileged user so initdb/pg_ctl and psql share one owner.
UNPRIV="${RC1_PG_USER:-lovable}"
if [ "$(id -u)" = "0" ]; then
  chmod 1777 /tmp 2>/dev/null || true
  mkdir -p /tmp/rc1-pg /tmp/rc1-migrations
  chown -R "$UNPRIV" /tmp/rc1-pg /tmp/rc1-migrations
  UID_N="$(id -u "$UNPRIV")"; GID_N="$(id -g "$UNPRIV")"
  exec setpriv --reuid "$UID_N" --regid "$GID_N" --clear-groups \
    env HOME="/tmp/rc1-pg" USER="$UNPRIV" PATH="$PATH" \
    bash "${BASH_SOURCE[0]}" "$@"

fi


MODE="${1:-fresh}"
CUTOFF="${2:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MIGRATIONS="$ROOT/supabase/migrations"
PGDIR=/tmp/rc1-pg
PORT=55432
LOGDIR=/tmp/rc1-migrations
mkdir -p "$LOGDIR"

# Hard-isolate from the hosted project's connection env.
unset PGHOST PGHOSTADDR PGPASSWORD PGSERVICE PGSSLMODE PGDATABASE PGUSER PGPORT PGAPPNAME
export PGHOST=/tmp PGPORT=$PORT PGUSER="$(id -un)" PGDATABASE=postgres

start_cluster() {
  if pg_isready -q -h /tmp -p $PORT 2>/dev/null; then return 0; fi
  if [ ! -d "$PGDIR/data" ]; then
    mkdir -p "$PGDIR"
    initdb -D "$PGDIR/data" -U "$PGUSER" --no-locale --encoding=UTF8 >"$LOGDIR/initdb.log" 2>&1 || return 1
  fi
  pg_ctl -D "$PGDIR/data" -o "-k /tmp -p $PORT -c listen_addresses='' -c fsync=off \
    -c synchronous_commit=off -c full_page_writes=off -c max_locks_per_transaction=4096 \
    -c statement_timeout=0" -l "$LOGDIR/postgres.log" -w start >>"$LOGDIR/initdb.log" 2>&1
}

apply_history() {
  local db="$1" from_after="$2" up_to="$3" log="$4"
  local applied=0 failed=0
  : >"$log"
  for f in "$MIGRATIONS"/*.sql; do
    local name; name="$(basename "$f")"
    if [ -n "$from_after" ] && [[ "$name" < "$from_after" || "$name" == "$from_after" ]]; then continue; fi
    if [ -n "$up_to" ] && [[ "$name" > "$up_to" ]]; then continue; fi
    # Local stand-ins exist for pg_cron/pg_net (not installable in the sandbox),
    # so their CREATE EXTENSION statements are neutralised. Nothing else is rewritten.
    local tmp="/tmp/rc1-migrations/current.sql"
    sed -E 's/CREATE +EXTENSION +(IF +NOT +EXISTS +)?"?(pg_cron|pg_net|pgtap|pgjwt|pgsodium)"?[^;]*;/SELECT 1;/Ig' "$f" >"$tmp"
    local args=(-v ON_ERROR_STOP=1 -q -d "$db" -f "$tmp")
    grep -qi "CONCURRENTLY" "$f" || args=(--single-transaction "${args[@]}")
    if ! out=$(psql "${args[@]}" 2>&1); then
      failed=$((failed + 1))
      { echo "=== FAIL $name"; echo "$out" | grep -E "ERROR|DETAIL" | head -4; } >>"$log"
      [ "$failed" -ge 200 ] && break
    else
      applied=$((applied + 1))
    fi
  done
  echo "APPLIED=$applied FAILED=$failed"
}

post_checks() {
  local db="$1"
  psql -q -d "$db" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/rc1/db/post-checks.sql" 2>&1
}

start_cluster || { echo "HARNESS=FAIL cluster did not start"; cat "$LOGDIR/initdb.log"; exit 1; }

case "$MODE" in
fresh)
  DB=rc1_fresh
  dropdb --if-exists "$DB" >/dev/null 2>&1
  createdb "$DB" || { echo "HARNESS=FAIL createdb"; exit 1; }
  psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/rc1/db/bootstrap.sql" >"$LOGDIR/fresh-bootstrap.log" 2>&1 \
    || { echo "HARNESS=FAIL bootstrap"; tail -30 "$LOGDIR/fresh-bootstrap.log"; exit 1; }
  echo "MODE=fresh DB=$DB"
  apply_history "$DB" "" "" "$LOGDIR/fresh-failures.log"
  post_checks "$DB"
  ;;
upgrade)
  [ -n "$CUTOFF" ] || { echo "HARNESS=FAIL upgrade needs a cutover migration filename"; exit 1; }
  DB=rc1_upgrade
  dropdb --if-exists "$DB" >/dev/null 2>&1
  createdb "$DB" || { echo "HARNESS=FAIL createdb"; exit 1; }
  psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/rc1/db/bootstrap.sql" >"$LOGDIR/upgrade-bootstrap.log" 2>&1 \
    || { echo "HARNESS=FAIL bootstrap"; tail -30 "$LOGDIR/upgrade-bootstrap.log"; exit 1; }
  echo "MODE=upgrade DB=$DB CUTOVER=$CUTOFF"
  echo "PRE $(apply_history "$DB" "" "$CUTOFF" "$LOGDIR/upgrade-pre-failures.log")"
  psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/rc1/db/upgrade-seed.sql" >"$LOGDIR/upgrade-seed.log" 2>&1 \
    || { echo "SEED=FAIL"; tail -30 "$LOGDIR/upgrade-seed.log"; exit 1; }
  echo "SEED=OK"
  echo "POST $(apply_history "$DB" "$CUTOFF" "" "$LOGDIR/upgrade-post-failures.log")"
  psql -q -d "$DB" -f "$ROOT/scripts/rc1/db/upgrade-verify.sql" 2>&1
  post_checks "$DB"
  ;;
*)
  echo "usage: migration-chain.sh {fresh|upgrade <cutover-migration>}"
  exit 2
  ;;
esac
