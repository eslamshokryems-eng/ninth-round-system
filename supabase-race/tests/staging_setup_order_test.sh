#!/usr/bin/env bash
# Runs the REAL ops/staging_setup.sh against STUBBED supabase / psql / curl in a throw-away copy of the tree. No network, no Supabase project, no database.
# Proves the ORDER: ref + connection + migration history + Auth are all accepted BEFORE `supabase db push`, and that a failed / unconfirmed Auth
# check leaves the (fake) database exactly as it was.
#   bash supabase-race/tests/staging_setup_order_test.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; SRC="$(cd "$HERE/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
REF=abcdefghijklmnopqrst
fail=0
mkdir -p "$T/repo/supabase-race" "$T/bin"
cp -r "$SRC/ops" "$SRC/supabase" "$SRC/verify" "$T/repo/supabase-race/"
ALL=$(ls "$T/repo/supabase-race/supabase/migrations/"*.sql | sed -E 's#.*/([0-9]{14})_.*#\1#' | sort)
N_ALL=$(printf '%s\n' "$ALL" | wc -l)
LOG="$T/calls.log"; STATE="$T/state"

cat > "$T/bin/supabase" <<'STUB'
#!/usr/bin/env bash
echo "supabase $*" >> "$LOG"
case "$1 $2" in
  "link --project-ref") mkdir -p supabase/.temp; printf '%s' "$3" > supabase/.temp/project-ref ;;
  "db push") echo "DB_PUSH_APPLIED" >> "$LOG"; ls supabase/migrations/*.sql | sed -E 's#.*/([0-9]{14})_.*#\1#' | sort > "$STATE" ;;
esac
STUB
cat > "$T/bin/psql" <<'STUB'
#!/usr/bin/env bash
echo "psql $*" >> "$LOG"
args="$*"
case "$args" in
  *"select 'connected to'"*) echo "connected to postgres as postgres on PostgreSQL 17.11" ;;
  *"select version from supabase_migrations"*) cat "$STATE" ;;
  *"to_regclass"*) [ -s "$STATE" ] && echo t || echo f ;;
  *"select count(*) from supabase_migrations"*) wc -l < "$STATE" | tr -d ' ' ;;
  *"relkind = 'r'"*) [ -s "$STATE" ] && echo 35 || echo 0 ;;
  *" -f "*) echo "psql file ok" ;;
esac
exit 0
STUB
cat > "$T/bin/curl" <<'STUB'
#!/usr/bin/env bash
echo "CURL_AUTH_CHECK" >> "$LOG"
while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2;; *) shift;; esac; done
printf '%s' "${FAKE_BODY:-{\}}" > "$out"; printf '%s' "${FAKE_CODE:-000}"
STUB
chmod +x "$T/bin/"*
GOOD='{"disable_signup":true,"mailer_autoconfirm":false,"jwt_exp":3600,"password_min_length":12,"site_url":"x"}'
printf 'AUTH VERIFIED MANUALLY\n' > "$T/yes"; printf 'no thanks\n' > "$T/wrong"; : > "$T/empty"

# scenario <name> <initial-state: first|none|all|diverged> <auth code> <body> <confirm file> <expect: applied|untouched> <expect exit: 0|1> <expect curl called: yes|no>
scenario() {
  local name="$1" init="$2" code="$3" body="$4" conf="$5" want="$6" wexit="$7" wcurl="$8"
  : > "$LOG"
  case "$init" in
    first) printf '%s\n' "$ALL" | head -n $((N_ALL - 2)) > "$STATE" ;;
    none) : > "$STATE" ;;
    all) printf '%s\n' "$ALL" > "$STATE" ;;
    diverged) { printf '%s\n' "$ALL" | head -n 3; echo 20200101000000; } > "$STATE" ;;
  esac
  cp "$STATE" "$T/state.before"
  ( cd "$T/repo" && PATH="$T/bin:$PATH" LOG="$LOG" STATE="$STATE" FAKE_CODE="$code" FAKE_BODY="$body" RACE_CONFIRM_FILE="$conf" \
      SUPABASE_ACCESS_TOKEN=x SUPABASE_DB_PASSWORD=x RACE_DATABASE_URL="postgresql://u:p@host.$REF.example:5432/postgres" \
      bash supabase-race/ops/staging_setup.sh "$REF" --through=checks > "$T/out" 2>&1 ); local rc=$?
  local pushes curls ok=1
  pushes=$(grep -c '^DB_PUSH_APPLIED' "$LOG"); curls=$(grep -c '^CURL_AUTH_CHECK' "$LOG")
  [ "$rc" = "$wexit" ] || ok=0
  if [ "$want" = applied ]; then [ "$pushes" = 1 ] || ok=0; else [ "$pushes" = 0 ] && cmp -s "$STATE" "$T/state.before" || ok=0; fi
  if [ "$wcurl" = yes ]; then [ "$curls" -ge 1 ] || ok=0; else [ "$curls" = 0 ] || ok=0; fi
  if [ "$want" = applied ]; then  # the Auth check must have run BEFORE the push
    local lc lp; lc=$(grep -n '^CURL_AUTH_CHECK' "$LOG" | head -1 | cut -d: -f1); lp=$(grep -n '^DB_PUSH_APPLIED' "$LOG" | head -1 | cut -d: -f1)
    [ -n "$lc" ] && [ -n "$lp" ] && [ "$lc" -lt "$lp" ] || ok=0
  fi
  if [ "$ok" = 1 ]; then echo "PASS  $name"; else echo "FAIL  $name (exit $rc, pushes $pushes, auth calls $curls)"; sed 's/^/        /' "$T/out" | tail -12; fail=1; fi
}

scenario "UPGRADE, Auth API 200 + correct values -> Auth checked, THEN the 2 pending migrations applied" first 200 "$GOOD" "$T/empty" applied 0 yes
scenario "UPGRADE, Auth 403 + phrase typed -> UNVERIFIED confirmed, THEN applied"                       first 403 '{"message":"Missing required permission(s): auth_config_read"}' "$T/yes" applied 0 yes
scenario "UPGRADE, Auth 403 + WRONG phrase -> STOP, nothing applied"                                      first 403 '{}' "$T/wrong" untouched 1 yes
scenario "UPGRADE, Auth 403 + no terminal / no answer -> STOP, nothing applied"                           first 403 '{}' "$T/empty" untouched 1 yes
scenario "UPGRADE, Auth 401 + WRONG phrase -> STOP, nothing applied"                                      first 401 '{}' "$T/wrong" untouched 1 yes
scenario "UPGRADE, Auth 200 but JWT expiry 7200 -> STOP, nothing applied"                                 first 200 "${GOOD/3600/7200}" "$T/yes" untouched 1 yes
scenario "UPGRADE, Auth 200 but sign-up enabled -> STOP, nothing applied"                                 first 200 "${GOOD/\"disable_signup\":true/\"disable_signup\":false}" "$T/yes" untouched 1 yes
scenario "UPGRADE, Auth 404 (wrong ref) -> STOP even with the phrase available, nothing applied"          first 404 '{}' "$T/yes" untouched 1 yes
scenario "UPGRADE, Auth 500 -> STOP, nothing applied"                                                     first 500 '{}' "$T/yes" untouched 1 yes
scenario "UPGRADE, no network for the Auth call (000) -> STOP, nothing applied"                           first 000 '{}' "$T/yes" untouched 1 yes
scenario "FRESH project, Auth unconfirmed -> STOP, no migration applied (history stays empty)"            none 403 '{}' "$T/wrong" untouched 1 yes
scenario "FRESH project, Auth 200 ok -> all migrations applied after the check"                           none 200 "$GOOD" "$T/empty" applied 0 yes
scenario "history diverged from the repository -> STOP BEFORE the Auth call and before any push"          diverged 200 "$GOOD" "$T/yes" untouched 1 no
scenario "RESUME (all migrations already applied), Auth unconfirmed -> STOP; nothing to push anyway"      all 403 '{}' "$T/wrong" untouched 1 yes
scenario "RESUME (all applied), Auth ok -> passes, no push"                                               all 200 "$GOOD" "$T/empty" untouched 0 yes

# the seed is never reached by --through=checks
if grep -q 'seed/staging' "$T/calls.log"; then echo "FAIL  --through=checks ran a seed file"; fail=1; else echo "PASS  --through=checks never touches the seed files"; fi
# the wrong-ref guard still fires before everything
( cd "$T/repo" && PATH="$T/bin:$PATH" LOG="$LOG" STATE="$STATE" SUPABASE_ACCESS_TOKEN=x SUPABASE_DB_PASSWORD=x RACE_DATABASE_URL="postgresql://u:p@other.zzzzzzzzzzzzzzzzzzzz.example/postgres" bash supabase-race/ops/staging_setup.sh "$REF" > "$T/out" 2>&1 ); rc=$?
if [ "$rc" != 0 ] && grep -q "does not contain the expected ref" "$T/out"; then echo "PASS  a database URL for another project is refused before anything runs"; else echo "FAIL  wrong-ref guard"; fail=1; fi
[ "$fail" = 0 ] && echo "ALL STAGING ORDER TESTS PASSED" || { echo "SOME TESTS FAILED"; exit 1; }
