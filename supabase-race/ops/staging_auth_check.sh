#!/usr/bin/env bash
# Step 8 of staging_setup.sh (sourced; needs die() and SUPABASE_ACCESS_TOKEN). Kept in its own file so it can be tested with a stubbed curl.
#
#   HTTP 200      -> the four settings are checked; any difference STOPS the script.
#   HTTP 401/403  -> AUTH UNVERIFIED: the token cannot read Auth settings. The operator must type the confirmation phrase after checking the
#                    dashboard by hand. No phrase, a wrong phrase, or no terminal to ask on STOPS the script (nothing is skipped silently).
#   anything else -> STOP (wrong ref, outage, no network: we cannot tell what the settings are).
# The confirmation is read from /dev/tty (or from the file named by RACE_CONFIRM_FILE - a test hook).
AUTH_CONFIRM_PHRASE="AUTH VERIFIED MANUALLY"

auth_check() {
  local ref="$1" body code py answer
  body="$(mktemp)"
  code=$(curl -sS -o "$body" -w '%{http_code}' -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "https://api.supabase.com/v1/projects/$ref/config/auth" || true)
  if [ "$code" = "200" ]; then
    py="$(command -v python3 || command -v python || true)"; [ -n "$py" ] || { rm -f "$body"; die "python is needed for the Auth check (install Python 3)"; }
    "$py" -I -c '
import json,sys
c=json.load(open(sys.argv[1])); bad=[]
def chk(name,cond,detail):
    print(("OK   " if cond else "FAIL ")+name+" = "+str(detail))
    if not cond: bad.append(name)
chk("public sign-up disabled", c.get("disable_signup") is True, c.get("disable_signup"))
chk("email confirmation required", c.get("mailer_autoconfirm") is False, c.get("mailer_autoconfirm"))
chk("JWT expiry 3600 s", c.get("jwt_exp")==3600, c.get("jwt_exp"))
chk("password min length >= 12", (c.get("password_min_length") or 0)>=12, c.get("password_min_length"))
print("INFO site_url =", c.get("site_url"), "| uri_allow_list =", c.get("uri_allow_list"))
sys.exit(1 if bad else 0)' "$body" || { rm -f "$body"; die "Auth configuration differs from the expected settings (fix in the dashboard, then re-run)"; }
    rm -f "$body"
    echo "AUTH: VERIFIED by API"
    return 0
  fi
  rm -f "$body"
  case "$code" in
    401|403) ;;
    *) die "Auth settings could not be read (HTTP $code) - not a permission problem, so this is not treated as 'unverified'. Check the project ref, the network and Supabase status." ;;
  esac
  echo
  echo "################################################################"
  echo "AUTH UNVERIFIED - the Management API answered HTTP $code: this token cannot read Auth settings."
  echo "################################################################"
  echo "Open the dashboard for project $ref -> Authentication and check, by eye:"
  echo "  [ ] 'Allow new users to sign up' is OFF"
  echo "  [ ] 'Confirm email' is ON"
  echo "  [ ] 'Minimum password length' is 12 or more"
  echo "  [ ] 'Access token / JWT expiry' is 3600 seconds"
  echo
  echo "Only if ALL FOUR are exactly as listed, type this phrase and press Enter:   $AUTH_CONFIRM_PHRASE"
  answer=""
  if ! read -r -p "> " answer < "${RACE_CONFIRM_FILE:-/dev/tty}" 2>/dev/null; then
    die "AUTH UNVERIFIED and no terminal to ask on. Run this script from an interactive terminal. Database checks above passed; Auth was NOT confirmed - do not seed."
  fi
  answer="${answer%$'\r'}"
  if [ "$answer" != "$AUTH_CONFIRM_PHRASE" ]; then
    die "AUTH UNVERIFIED and not confirmed. Database checks above passed; fix or re-check the Auth settings and re-run. Do not seed."
  fi
  echo "AUTH: UNVERIFIED by API, CONFIRMED MANUALLY by the operator ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
}
