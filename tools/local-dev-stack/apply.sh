#!/usr/bin/env bash
# LOCAL DEV ONLY. Builds (or rebuilds) a local PostgreSQL database that holds
# the REAL schema — the Supabase shim in 00_supabase_shim.sql, then every
# migration in supabase/migrations/ in filename order, unmodified and by
# relative path — and then the demo seed. Drops and recreates the database
# every time, so it is always reproducible and never accumulates state.
#
# Never connects to Supabase or any remote database.
#
#   bash apply.sh            # rebuild + seed
#   SKIP_SEED=1 bash apply.sh
set -u
cd "$(dirname "${BASH_SOURCE[0]}")"
HERE="$(pwd)"
MIGRATIONS_DIR="$HERE/../../supabase/migrations"
DB="${LOCAL_DB:-ninth_round_local}"
LOG_DIR="$HERE/.apply-logs"
mkdir -p "$LOG_DIR"

if [ -z "${PSQL_SUPERUSER+x}" ]; then
  if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
    PSQL_SUPERUSER="su postgres -c"
  else
    PSQL_SUPERUSER=""
  fi
fi

run_file() {
  local file="$1" log="$2"
  if [ -n "$PSQL_SUPERUSER" ]; then
    eval "$PSQL_SUPERUSER \"psql -v ON_ERROR_STOP=1 -d $DB -f $file\"" > "$log" 2>&1
  else
    psql -v ON_ERROR_STOP=1 -d "$DB" -f "$file" > "$log" 2>&1
  fi
}
run_sql() {
  local sql="$1"
  if [ -n "$PSQL_SUPERUSER" ]; then
    eval "$PSQL_SUPERUSER \"psql -v ON_ERROR_STOP=1 -d postgres -c \\\"$sql\\\"\"" >/dev/null 2>&1
  else
    psql -v ON_ERROR_STOP=1 -d postgres -c "$sql" >/dev/null 2>&1
  fi
}

if command -v pg_lsclusters >/dev/null 2>&1; then
  pg_lsclusters 2>/dev/null | grep -q "online" || pg_ctlcluster 16 main start || true
fi

echo "=== Rebuilding $DB ==="
run_sql "drop database if exists $DB"
run_sql "create database $DB"

echo "=== Supabase shim ==="
run_file "$HERE/00_supabase_shim.sql" "$LOG_DIR/00_shim.log"
grep -qi "ERROR:" "$LOG_DIR/00_shim.log" && { echo "FAILED — see $LOG_DIR/00_shim.log"; grep -i "ERROR:" "$LOG_DIR/00_shim.log" | head -5; exit 1; }
echo "  ok"

echo "=== Migrations (real files, in order) ==="
i=0
for f in "$MIGRATIONS_DIR"/*.sql; do
  i=$((i+1))
  name="$(basename "$f")"
  log="$LOG_DIR/$(printf '%03d' "$i")_$name.log"
  # 20260809000001 promotes ONE existing profile to super_admin by exact id
  # and raises if that profile is absent. On a real project that account was
  # created out of band through Supabase Auth before the migration ran. Here
  # the equivalent account is created immediately before it, with the id read
  # out of the migration itself so there is no second copy of that uuid to
  # keep in sync.
  if [ "$name" = "20260809000001_bootstrap_super_admin.sql" ]; then
    BOOTSTRAP_ID="$(grep -oE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" "$f" | head -1)"
    if [ -z "$BOOTSTRAP_ID" ]; then
      echo "  FAIL could not read the bootstrap profile id out of $name"; exit 1
    fi
    printf "%s\n" \
      "insert into auth.users (id, email, encrypted_password, raw_user_meta_data)" \
      "values ('$BOOTSTRAP_ID', 'founder@9thround.local', 'seeded-by-apply-sh'," \
      "        jsonb_build_object('full_name', 'Founder (bootstrap super admin)'))" \
      "on conflict (id) do nothing;" \
      > "$LOG_DIR/bootstrap_user.sql"
    run_file "$LOG_DIR/bootstrap_user.sql" "$LOG_DIR/bootstrap_user.log"
    if grep -qi "ERROR:" "$LOG_DIR/bootstrap_user.log"; then
      echo "  FAIL could not create the bootstrap auth user"
      grep -i "ERROR:" "$LOG_DIR/bootstrap_user.log" | head -3 | sed 's/^/        /'; exit 1
    fi
    echo "  ..   created the bootstrap account $BOOTSTRAP_ID"
  fi

  run_file "$f" "$log"
  if grep -qi "ERROR:" "$log"; then
    echo "  FAIL $name"
    grep -i "ERROR:" "$log" | head -5 | sed 's/^/        /'
    exit 1
  fi
  echo "  ok   $name"
done

if [ "${SKIP_SEED:-0}" != "1" ]; then
  echo "=== Demo seed ==="
  run_file "$HERE/10_seed_demo.sql" "$LOG_DIR/900_seed.log"
  grep -qi "ERROR:" "$LOG_DIR/900_seed.log" && { echo "FAILED — see $LOG_DIR/900_seed.log"; grep -i "ERROR:" "$LOG_DIR/900_seed.log" | head -10; exit 1; }
  echo "  ok"
fi

echo
echo "Database $DB is ready."
