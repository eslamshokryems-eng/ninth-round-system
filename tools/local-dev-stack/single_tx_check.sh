#!/usr/bin/env bash
# LOCAL ONLY. Applies every migration the way Supabase does — each file as ONE transaction
# (psql --single-transaction) — against a throwaway database. The normal apply.sh runs
# statement-by-statement and therefore cannot see transaction-only failures such as
# "unsafe use of new enum value" (55P04). Never touches any remote database.
set -u
cd "$(dirname "${BASH_SOURCE[0]}")"; HERE="$(pwd)"; DB=ninth_single_tx
SU="su postgres -c"; [ "$(id -u)" = 0 ] || SU=""
ex(){ if [ -n "$SU" ]; then $SU "$1"; else bash -c "$1"; fi; }
ex "psql -q -d postgres -c 'drop database if exists $DB'" ; ex "psql -q -d postgres -c 'create database $DB'"
ex "psql -q -v ON_ERROR_STOP=1 -d $DB -f $HERE/00_supabase_shim.sql" >/dev/null 2>&1 || { echo "shim failed"; exit 1; }
n=0
for f in "$HERE"/../../supabase/migrations/*.sql; do
  name="$(basename "$f")"; n=$((n+1))
  if [ "$name" = "20260809000001_bootstrap_super_admin.sql" ]; then
    id="$(grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$f" | head -1)"
    ex "psql -q -d $DB -c \"insert into auth.users(id,email,encrypted_password,raw_user_meta_data) values ('$id','b@x.local','x','{}') on conflict do nothing\"" >/dev/null 2>&1
  fi
  out="$(ex "psql -q -v ON_ERROR_STOP=1 --single-transaction -d $DB -f $f" 2>&1)" || { echo "FAIL (single transaction) $name"; echo "$out" | grep -i error | head -3; exit 1; }
done
echo "OK: all $n migrations apply as single transactions"
