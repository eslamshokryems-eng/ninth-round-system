#!/usr/bin/env bash
# THE NINTH ↔ gym-management independence, checked against the repository itself (no database needed).
#   1. the gym system is byte-identical to its pre-race state (GYM_BASE)
#   2. no gym file mentions the race system; no race file mentions a gym object, gym package or gym env
#   3. THE NINTH never imports a gym package and never touches the gym Supabase directory
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
GYM_BASE="${GYM_BASE:-527f705}"
fail() { echo "FAIL  $1"; exit 1; }
pass() { echo "PASS  $1"; }

git cat-file -e "$GYM_BASE^{commit}" 2>/dev/null || { echo "SKIP  gym base commit $GYM_BASE not available in this clone (shallow?) — content checks only"; GYM_BASE=""; }

GYM_PATHS=(apps/web apps/mobile supabase packages/database-types packages/supabase-client packages/identity packages/reception packages/sales packages/hr packages/audit packages/billing packages/training packages/nutrition packages/tracking packages/notifications packages/ai packages/ui packages/i18n packages/config packages/shared-kernel .github/workflows/ci.yml)
if [ -n "$GYM_BASE" ]; then
  changed=$(git diff --name-only "$GYM_BASE" HEAD -- "${GYM_PATHS[@]}" || true)
  [ -z "$changed" ] && pass "gym system files are identical to $GYM_BASE (no file changed, added or removed)" || { echo "$changed"; fail "gym files differ from $GYM_BASE"; }
fi

hits=$(grep -rIl --exclude-dir=node_modules --exclude-dir=.next --exclude='*.tsbuildinfo' -E "@9thround/race|race_events|race_profiles|race_audit_log|THE NINTH" "${GYM_PATHS[@]}" 2>/dev/null | grep -v "^apps/web/.next" || true)
[ -z "$hits" ] && pass "no gym file mentions the race system" || { echo "$hits"; fail "gym files mention the race system"; }

RACE_PATHS=(supabase-race apps/race packages/race)
hits=$(grep -rIn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=harness --exclude='*.tsbuildinfo' --exclude=README.md --exclude=check-isolation.sh -E "admin_audit_log|(^|[^_a-z])log_audit_event|is_branch_staff|public\.profiles|references profiles|from profiles|branches \(|@9thround/(database-types|supabase-client|identity|reception|sales|hr|audit|billing|training|nutrition|tracking|notifications|ui|i18n)" "${RACE_PATHS[@]}" 2>/dev/null || true)
[ -z "$hits" ] && pass "no race source file references a gym object or a gym package" || { echo "$hits"; fail "race sources reference gym objects/packages"; }

deps=$(node -e 'for (const p of ["apps/race","packages/race"]) { const j=require("./"+p+"/package.json"); for (const d of Object.keys({...j.dependencies,...j.devDependencies})) if (/^@9thround\//.test(d) && !["@9thround/race","@9thround/config","@9thround/race-web"].includes(d)) console.log(p+" -> "+d); }')
[ -z "$deps" ] && pass "THE NINTH depends on no other workspace package than its own (and the shared tsconfig)" || { echo "$deps"; fail "unexpected workspace dependency"; }

grep -rIn --exclude-dir=node_modules --exclude-dir=.next -E "SUPABASE_URL|SUPABASE_ANON_KEY|SERVICE_ROLE" apps/race/src apps/race/app packages/race 2>/dev/null | grep -vE "NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)|env\.ts|composition-root|race-client|\.md" | grep -q . && fail "unexpected Supabase credential usage" || pass "the only credentials THE NINTH reads are its own NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
! grep -rIln --exclude-dir=node_modules --exclude-dir=.next -E "SERVICE_ROLE_KEY|service_role" apps/race/app apps/race/src packages/race >/dev/null 2>&1 && pass "the service-role key is never referenced by browser code" || fail "service-role key referenced in browser code"
! git ls-files | grep -Eq '(^|/)\.env($|\.local|\.production)' && pass "no .env file is committed" || fail ".env file committed"
! git grep -IlE 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.' -- . ':!pnpm-lock.yaml' >/dev/null 2>&1 && pass "no JWT-shaped secret is committed anywhere" || fail "a JWT-shaped string is committed"
