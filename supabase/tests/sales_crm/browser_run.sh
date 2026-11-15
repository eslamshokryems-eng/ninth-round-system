#!/usr/bin/env bash
# LOCAL ONLY. Rebuilds a throw-away demo DB WITHOUT the refund/financial migrations (Sales must not depend on them), adds the Sales fixtures,
# applies the Production-only assignment trigger (prodshape_lead_assignment_trigger.sql) so the browser runs on Production's real shape,
# starts mail sink + gateway + web app, runs the Sales Workspace (Release B) browser verification, stops everything.
# PostgreSQL server = PGPORT (5432 = PG16, 5433 = PG17 in this sandbox); the gateway inherits it.
set -u; ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"; DB="${LOCAL_DB:-ninth_sales_browser}"; RUN="${RUN_DIR:-/tmp/sales-browser-run}"; mkdir -p "$RUN"
SUBSET="$RUN/migrations"; rm -rf "$SUBSET"; mkdir -p "$SUBSET"
for f in "$ROOT"/supabase/migrations/*.sql; do b=$(basename "$f"); case "$b" in 20261118*|20261119*|20261120*|20261121*|20261122*) ;; *) ln -sf "$f" "$SUBSET/$b";; esac; done
pkill -f gateway.mjs 2>/dev/null; pkill -f mail-sink.mjs 2>/dev/null; pkill -f "next dev" 2>/dev/null; sleep 1
su postgres -c "psql -q -d postgres -c 'drop database if exists $DB'"
MIGRATIONS_DIR="$SUBSET" LOCAL_DB="$DB" bash "$ROOT/tools/local-dev-stack/apply.sh" > "$RUN/apply.log" 2>&1 || { echo "database build failed — see $RUN/apply.log"; tail -5 "$RUN/apply.log"; exit 1; }
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB" < "$ROOT/supabase/tests/sales_crm/prodshape_lead_assignment_trigger.sql" || { echo "prodshape fixture failed"; exit 1; }
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d $DB" < "$ROOT/supabase/tests/sales_crm/browser_setup.sql" | grep -E "ERROR"
(setsid nohup node "$ROOT/tools/local-dev-stack/mail-sink.mjs" > "$RUN/sink.log" 2>&1 < /dev/null &)
(LOCAL_DB="$DB" setsid nohup node "$ROOT/tools/local-dev-stack/gateway.mjs" > "$RUN/gw.log" 2>&1 < /dev/null &)
(cd "$ROOT/apps/web" && setsid nohup npx next dev -p 3000 > "$RUN/web.log" 2>&1 < /dev/null &)
for i in $(seq 1 90); do curl -s -o /dev/null http://127.0.0.1:3000/login && break; sleep 1; done
SHOTS_DIR="${SHOTS_DIR:-$RUN/shots}"; mkdir -p "$SHOTS_DIR"
SHOTS_DIR="$SHOTS_DIR" LOCAL_DB="$DB" node "$ROOT/tools/local-dev-stack/browser/sales-workspace.mjs"; RC=$?
pkill -f gateway.mjs 2>/dev/null; pkill -f mail-sink.mjs 2>/dev/null; pkill -f "next dev" 2>/dev/null
su postgres -c "psql -q -d postgres -c 'drop database if exists $DB'" 2>/dev/null
exit $RC
