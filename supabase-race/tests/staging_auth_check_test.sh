#!/usr/bin/env bash
# Tests step 8 of staging_setup.sh (ops/staging_auth_check.sh) with a STUBBED curl: no network, no Supabase, no database.
#   bash supabase-race/tests/staging_auth_check_test.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
export SUPABASE_ACCESS_TOKEN="not-a-real-token"
fail=0
# fake curl: writes $FAKE_BODY to the -o file and prints $FAKE_CODE
cat > "$T/curl" <<'STUB'
#!/usr/bin/env bash
while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2;; *) shift;; esac; done
printf '%s' "${FAKE_BODY:-{\}}" > "$out"; printf '%s' "${FAKE_CODE:-000}"
STUB
chmod +x "$T/curl"
# run auth_check in a subshell; echoes the exit status and the output
run() { ( export PATH="$T:$PATH"; die() { echo "STOP: $*" >&2; exit 1; }; . "$HERE/../ops/staging_auth_check.sh"; auth_check ykplahzgvpqrxzhlhczl ) 2>&1; }
expect() { # name, want-exit, want-text, got-exit, got-out
  if [ "$4" = "$2" ] && printf '%s' "$5" | grep -q -- "$3"; then echo "PASS  $1"; else echo "FAIL  $1 (exit $4, wanted $2 / '$3')"; printf '%s\n' "$5" | sed 's/^/        /'; fail=1; fi
}
GOOD='{"disable_signup":true,"mailer_autoconfirm":false,"jwt_exp":3600,"password_min_length":12,"site_url":"x"}'

export RACE_CONFIRM_FILE=/dev/null
FAKE_CODE=200 FAKE_BODY="$GOOD" out=$(FAKE_CODE=200 FAKE_BODY="$GOOD" run); expect "200 + correct settings -> VERIFIED by API" 0 "AUTH: VERIFIED by API" $? "$out"
for bad in '"disable_signup":false' '"mailer_autoconfirm":true' '"jwt_exp":7200' '"password_min_length":8'; do
  key="${bad%%:*}"; body=$(printf '%s' "$GOOD" | sed "s/${key}:[^,}]*/${bad}/")
  out=$(FAKE_CODE=200 FAKE_BODY="$body" run); expect "200 + wrong ${key} -> STOP" 1 "differs from the expected" $? "$out"
done
printf 'AUTH VERIFIED MANUALLY\n' > "$T/yes"; printf 'yes\n' > "$T/wrong"; printf 'AUTH VERIFIED MANUALLY\r\n' > "$T/yes_crlf"; : > "$T/empty"
for code in 403 401; do
  out=$(RACE_CONFIRM_FILE="$T/yes" FAKE_CODE=$code FAKE_BODY='{"message":"Missing required permission(s): auth_config_read"}' run); expect "$code + correct phrase -> UNVERIFIED, CONFIRMED MANUALLY" 0 "CONFIRMED MANUALLY" $? "$out"
  expect "$code shows the AUTH UNVERIFIED banner and the checklist" 0 "AUTH UNVERIFIED - the Management API answered HTTP $code" 0 "$out"
done
out=$(RACE_CONFIRM_FILE="$T/yes_crlf" FAKE_CODE=403 run); expect "403 + phrase typed with CRLF (Windows) -> accepted" 0 "CONFIRMED MANUALLY" $? "$out"
out=$(RACE_CONFIRM_FILE="$T/wrong" FAKE_CODE=403 run); expect "403 + wrong phrase -> STOP" 1 "not confirmed" $? "$out"
out=$(RACE_CONFIRM_FILE="$T/empty" FAKE_CODE=403 run); expect "403 + no answer / no terminal -> STOP" 1 "no terminal" $? "$out"
out=$(RACE_CONFIRM_FILE="$T/yes" FAKE_CODE=404 run); expect "404 (wrong ref) is NOT treated as unverified -> STOP" 1 "not a permission problem" $? "$out"
out=$(RACE_CONFIRM_FILE="$T/yes" FAKE_CODE=500 run); expect "500 -> STOP even with a phrase available" 1 "not a permission problem" $? "$out"
out=$(RACE_CONFIRM_FILE="$T/yes" FAKE_CODE=000 run); expect "no network (000) -> STOP" 1 "not a permission problem" $? "$out"
# the real script must call it, and keep its other mandatory checks
S="$HERE/../ops/staging_setup.sh"
for needle in 'auth_check "$REF"' 'verify/verify_deployment.sql' 'ops/staging_checks.sql' 'does not contain the expected ref' 'set -euo pipefail'; do
  if grep -qF -- "$needle" "$S"; then echo "PASS  staging_setup.sh still contains: $needle"; else echo "FAIL  staging_setup.sh lost: $needle"; fail=1; fi
done
[ "$fail" = 0 ] && echo "ALL STAGING AUTH-CHECK TESTS PASSED" || { echo "SOME TESTS FAILED"; exit 1; }
