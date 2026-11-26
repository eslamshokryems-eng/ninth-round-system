#!/usr/bin/env bash
# LOCAL ONLY. Smart Reminders P1 suite on Production's shape: migrations up to Release A + the Production assignment trigger + fixtures,
# then Release B, then the reminders migration in ONE transaction (lock_timeout 5s, statement_timeout 30s) over existing data.
# Checks: existing lead / follow-up rows byte-identical, behaviour (reminders_tests.sql), rollback removes only reminder objects and
# keeps data, re-apply rebuilds the same reminders. Never touches a remote database. Usage: PGPORT=5433 bash reminders_run.sh
set -u
cd "$(dirname "${BASH_SOURCE[0]}")"; HERE="$(pwd)"; ROOT="$HERE/../../.."
DB="${SCRATCH_DB:-ninth_reminders}"; LOG="${RUN_DIR:-/tmp/reminders-run}"; rm -rf "$LOG"; mkdir -p "$LOG/migrations"; chmod -R 755 "$LOG"
SU="su postgres -c"; [ "$(id -u)" = "0" ] || SU="bash -c"
for f in "$ROOT"/supabase/migrations/*.sql; do ln -sf "$f" "$LOG/migrations/$(basename "$f")"; done
MIGB="$ROOT/supabase/migrations/20261124000001_sales_workspace.sql"; MIGR="$ROOT/supabase/migrations/20261126000001_sales_reminders.sql"; RBK="$ROOT/supabase/rollback/sales_reminders_rollback.sql"
MIGP="$ROOT/supabase/migrations/20261127000001_sales_reminders_push.sql"; RBKP="$ROOT/supabase/rollback/sales_reminders_push_rollback.sql"
PSQL() { $SU "psql -v ON_ERROR_STOP=1 -q -d $DB $*"; }
VAL() { $SU "psql -At -d $DB -c \"$1\""; }
apply1() { $SU "psql -v ON_ERROR_STOP=1 -1 -q -d $DB -c \"set local lock_timeout = '5s'\" -c \"set local statement_timeout = '30s'\" -f $1"; }
cleanup() { $SU "psql -q -d postgres -c 'drop database if exists $DB'" >/dev/null 2>&1; }
[ "${KEEP_DB:-0}" = "1" ] || trap cleanup EXIT
echo "server: PostgreSQL $($SU "psql -At -d postgres -c 'show server_version'") (port ${PGPORT:-5432})"
cleanup
MIGRATIONS_DIR="$LOG/migrations" LOCAL_DB="$DB" SKIP_SEED=1 STOP_BEFORE=20261124000001 bash "$ROOT/tools/local-dev-stack/apply.sh" > "$LOG/apply.log" 2>&1 || { echo "build failed"; tail -5 "$LOG/apply.log"; exit 1; }
for f in "$ROOT/tools/local-dev-stack/regression/00_seed.sql" "$HERE/prodshape_lead_assignment_trigger.sql" "$HERE/release_a_setup.sql"; do PSQL "-f $f" > "$LOG/setup.log" 2>&1 || { echo "setup failed: $f"; tail -5 "$LOG/setup.log"; exit 1; }; done
apply1 "$MIGB" > "$LOG/migB.log" 2>&1 || { echo "Release B failed"; tail -5 "$LOG/migB.log"; exit 1; }
# extra fixtures: future follow-ups (owned, colleague's, unassigned pool) and a completed future one
PSQL "-c \"insert into lead_followups (lead_id, branch_id, due_at, status, created_by) select id, branch_id, now() + interval '2 days', 'pending', created_by from leads where full_name in ('own1','other1','pool1'); insert into lead_followups (lead_id, branch_id, due_at, status, created_by, completed_at) select id, branch_id, now() + interval '2 days', 'completed', created_by, now() from leads where full_name='own2'\""
ROWS="select md5(coalesce((select string_agg(to_jsonb(l)::text, '|' order by l.id) from leads l),'')) || '/' || md5(coalesce((select string_agg(to_jsonb(f)::text, '|' order by f.id) from lead_followups f),''))"
BEFORE="$(VAL "$ROWS")"
apply1 "$MIGR" > "$LOG/migR.log" 2>&1; MX=$?
AFTER="$(VAL "$ROWS")"
echo "migration exit=$MX; lead + follow-up rows identical=$([ "$BEFORE" = "$AFTER" ] && echo yes || echo NO); reminders after backfill=$(VAL 'select count(*) from sales_reminders')"
[ "$MX" = 0 ] || { cat "$LOG/migR.log"; exit 1; }
apply1 "$MIGP" > "$LOG/migP.log" 2>&1; PX=$?; AFTERP="$(VAL "$ROWS")"
echo "P3 migration exit=$PX; rows still identical=$([ "$BEFORE" = "$AFTERP" ] && echo yes || echo NO)"
[ "$PX" = 0 ] || { cat "$LOG/migP.log"; exit 1; }
PSQL "-f $HERE/reminders_tests.sql" > "$LOG/tests.log" 2>&1; TX=$?; [ "$TX" = 0 ] || { echo "test script error"; tail -8 "$LOG/tests.log"; }
PSQL "-f $HERE/push_tests_a.sql" > "$LOG/push_a.log" 2>&1 || { TX=1; echo "push part A error"; tail -8 "$LOG/push_a.log"; }
# concurrent dispatchers: 6 sessions claim at the same moment -> every due reminder claimed exactly once
for i in 1 2 3 4 5 6; do ( VAL "select coalesce(string_agg(reminder_id::text, ','), '') from claim_due_reminders(4)" > "$LOG/claim$i.txt" ) & done; wait
IDS="$(cat "$LOG"/claim*.txt | tr ',' '\n' | grep -v '^$')"; TOT=$(printf '%s\n' "$IDS" | grep -c .); UNI=$(printf '%s\n' "$IDS" | sort -u | grep -c .)
PSQL "-c \"insert into scr.res(id,who,what,expected,actual,pass) values ('C01','6 sessions','concurrent claim: 12 due reminders claimed exactly once across 6 parallel dispatchers (claimed/distinct)','12/12','$TOT/$UNI',$([ "$TOT" = 12 ] && [ "$UNI" = 12 ] && echo true || echo false))\"" >/dev/null
PSQL "-f $HERE/push_tests_b.sql" > "$LOG/push_b.log" 2>&1 || { TX=1; echo "push part B error"; tail -8 "$LOG/push_b.log"; }
# rollback: only reminder objects go, data stays; re-apply rebuilds the same reminders
R1="$(VAL "select count(*)||':'||md5(string_agg(followup_id||status||remind_at, ',' order by followup_id)) from sales_reminders")"
D1="$(VAL "$ROWS")"
$SU "psql -v ON_ERROR_STOP=1 -q -d $DB -f $RBKP" > "$LOG/rbkP.log" 2>&1; RXP=$?
$SU "psql -v ON_ERROR_STOP=1 -q -d $DB -f $RBK" > "$LOG/rbk.log" 2>&1; RX=$((RX0=$?, RXP + RX0))
LEFT="$(VAL "select count(*) from pg_class where relname in ('sales_reminders','sales_reminder_settings','push_subscriptions')")+$(VAL "select count(*) from pg_proc where proname in ('refresh_sales_reminder','set_my_reminder_settings','get_my_reminder_settings','trg_sync_reminder_from_followup','trg_sync_reminders_from_lead','trg_sync_reminders_from_settings','claim_due_reminders','confirm_reminder_claim','complete_reminder_delivery','register_push_subscription','unregister_push_subscription','push_endpoint_allowed','reminders_due_count','trg_reminder_void_claim')")+$(VAL "select count(*) from pg_trigger where tgname like 'trg_sales_reminder%'")"
D2="$(VAL "$ROWS")"
apply1 "$MIGR" > "$LOG/migR2.log" 2>&1; AX=$?; apply1 "$MIGP" > "$LOG/migP2.log" 2>&1; AX=$((AX + $?))
PSQL "-c \"insert into scr.res(id,who,what,expected,actual,pass) values
 ('M01','postgres','migration over existing data: every lead and follow-up row byte-identical','identical','$([ "$BEFORE" = "$AFTER" ] && echo identical || echo CHANGED)',$([ "$BEFORE" = "$AFTER" ] && echo true || echo false)),
 ('M02','postgres','rollback P3 then P1: exit 0, every reminder / push object removed (tables+functions+triggers)','0 / 0+0+0','$RX / $LEFT',$([ "$RX" = 0 ] && [ "$LEFT" = "0+0+0" ] && echo true || echo false)),
 ('M03','postgres','rollback keeps every lead and follow-up row byte-identical','identical','$([ "$D1" = "$D2" ] && echo identical || echo CHANGED)',$([ "$D1" = "$D2" ] && echo true || echo false)),
 ('M04','postgres','re-apply P1 + P3 after rollback succeeds and backfill rebuilds reminders for every active pending follow-up','0 / true','$AX / '||(select (select count(*) from sales_reminders where status in ('scheduled','expired')) = (select count(*) from lead_followups f join leads l on l.id=f.lead_id where f.status='pending' and l.assigned_to is not null and l.status not in ('converted','lost')))::text, $AX = 0 and (select (select count(*) from sales_reminders where status in ('scheduled','expired')) = (select count(*) from lead_followups f join leads l on l.id=f.lead_id where f.status='pending' and l.assigned_to is not null and l.status not in ('converted','lost'))))\"" >/dev/null 2>&1
$SU "psql -q -d $DB -c \"select rpad(id,4)||' '||case when pass then 'PASS' else 'FAIL' end||' | '||rpad(who,12)||' | '||what||case when pass then '' else '  [exp '||expected||' | got '||actual||']' end from scr.res order by ord\" -At"
F="$(VAL "select count(*) from scr.res where not pass")"; T="$(VAL "select count(*) from scr.res")"
echo "REMINDERS P1+P3: $((T - F))/$T passed"
[ "$F" = "0" ] && [ "$TX" = 0 ]
