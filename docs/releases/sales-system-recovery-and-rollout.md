# Sales System — Recovery & Rollout (living document)

> **Superseded by `sales-release-candidate.md` (RC1, 2026-11-14)** on branch `release/sales-recovery-local`. Kept for the root-cause analysis.
> Corrections since this was written:
> * Conversion (§6) **is now built**: `register_membership` audit, `convert_lead`, `sold_by` = lead owner, idempotent.
> * The Release A "45/45" here was measured on the full working tree. On Production's own code (`527f705`), three checks show `can_manage_leads()` returning NULL rather than false for anonymous, deactivated and identity-less callers. That is equivalent to deny in every consumer, and the checks now assert "never grants": 45/45 on the release branch.
> * The team dashboard queries were rewritten for scale (overview 231 → 98 ms at 20,000 leads).


Last updated: 2026-11-14 · **Production status: NOTHING deployed, NO Production change made.** Production was only read (Vercel metadata/logs, Supabase logs, read-only SQL, `EXPLAIN` in rolled-back transactions). Everything below was built and tested locally; every Production step is waiting for your explicit approval (§8).

Earlier finding doc: `docs/releases/sales-system-production-release.md` (the "new Sales System" did not exist in code; root cause of the 500s).

## 1. Status

| Release | Content | Built | Locally tested | Production-shape rehearsal | Deployed |
|---|---|---|---|---|---|
| **A — Stability** | RLS performance fix (`can_manage_leads` + initPlan policies) · profile-load sign-out fix | yes | yes | yes | **no — awaiting approval** |
| **B — Sales Workspace MVP** | worklist, activity history, next-action enforcement, assignment history, manager assign/reassign, F4 closure | yes | yes | yes | **no — awaiting approval** |
| **C — Management & conversion** | manager dashboard (read-only) **built**; priority = hot/warm/cold **built (in B)**; conversion integration **NOT built** (blocked, §6) | part | part | part | **no** |

## 2. Root cause of the Sales failures (Production evidence)
* HTTP 500 on `/rest/v1/leads` (85 of ~700) and `/rest/v1/lead_followups` (18 of ~370) in 24 h = Postgres `canceling statement due to statement timeout` (role `authenticated`: 8 s). Tables are tiny (829 leads, 373 follow-ups). Measured on Production (rolled-back, read-only): `select id from leads` as a sales employee = **1,036 ms** at idle.
* Cause: per-row RLS. `can_manage_leads()` is SECURITY INVOKER ⇒ inlined into a correlated sub-select that re-reads `profiles` **through profiles' own RLS** for every row; policies call `auth_role()`/`auth.uid()` per row; the follow-up policies repeat it through `EXISTS (select … from leads)`.
* **Your proposed one-line fix is not enough on its own.** Benchmark (local, 8 concurrent sales employees each running the dashboard's queries):

| Leads / follow-ups | Original (as Production) | Only `ALTER FUNCTION … SECURITY DEFINER` | `ALTER` + initPlan policies (Release A) |
|---|---|---|---|
| 815 / 385, 1 client | 1,913 ms per page load | 556 ms | **8.7 ms** |
| 815 / 385, 8 clients | 4,070 ms | 1,333 ms | **15.9 ms** (503 page-loads/s) |
| 5,815 / 3,385, 1 client | 13,768 ms | 3,584 ms | **18 ms** |
| 5,815 / 3,385, 8 clients | 30,581 ms | 7,378 ms | **37 ms** |

  (one "page load" = 6 dashboard counts + lead list + overdue list; local machine, absolute numbers differ on Supabase, the ratio is the point.) The function change alone would still time out at ~6k leads; the policy rewrite is what removes the per-row cost.
* Second, code-level fragility (remote users): `use-auth-bootstrap.ts` signed the user out on **any** failure while loading the profile (slow mobile data, a 5xx, a timeout). Fixed in Release A (`resolveSessionProfile`: retry, never sign out on a transient failure; only a definitively missing profile ends the session). Not shown to be the cause in Production logs; it is a robustness fix.
* Remote-access checks (config only, nothing changed): Vercel `trustedIps` disabled; no password protection; SSO protection is `all_except_custom_domains` ⇒ **`app.9throundegypt.com` is NOT behind Vercel login; the `*.vercel.app` URLs are** (employees must use the official domain); no `middleware.ts`; auth is client-side Supabase session in the browser (auto-refresh on); Supabase `statement_timeout` 8 s; device-verification gate (new device ⇒ 6-digit code sent to an administrator; by design, rate-limited). **Not verified:** Supabase Auth Site URL / redirect allow-list (not readable with the tools available) and an actual login from an outside network — this sandbox's proxy returns 403 for `app.9throundegypt.com` and creating a Vercel share link (the only other external probe) would have altered the deployment configuration, so I did not.

## 3. Release A — Stability
Files: `supabase/migrations/20261123000001_sales_rls_performance.sql` (+ `supabase/rollback/sales_rls_performance_rollback.sql`), `packages/identity/application/resolve-session-profile.ts` (+test) + export in `packages/identity/index.ts`, `apps/web/src/features/auth/use-auth-bootstrap.ts`.

**Exact Production operation (needs your approval):** the migration file, summarised:
```sql
alter function public.can_manage_leads(uuid) security definer set search_path = '';
create function public.my_sales_branch() … security definer set search_path = '' …;   -- caller's branch if active branch_manager/sales_employee, else NULL
drop policy "sales staff read leads" / "update leads" / "read followups" / "update followups";   -- and re-create the same four with (select …) initPlans
```
Objects affected: function `can_manage_leads(uuid)`; new function `my_sales_branch()`; policies "sales staff read leads", "sales staff update leads" on `leads`, "sales staff read followups", "sales staff update followups" on `lead_followups`. No table, column, row, grant or other policy is touched. Policies are swapped inside one transaction (no moment without a policy). Insert policies are unchanged.
Security review of the definer function: identity = `auth.uid()` only; the argument is a branch id (never a user), so a caller can only learn whether *they themselves* manage a branch; fully schema-qualified, no dynamic SQL, owner `postgres`, `search_path` empty; EXECUTE grants intentionally unchanged (revoking from anon would turn an empty result into a permission error). The helper calls `is_super_admin()`/`auth_role()` which Production defines as SQL/definer functions reading only the caller's own profile.
Rollback: `supabase/rollback/sales_rls_performance_rollback.sql` (restores the six original definitions verbatim; no data involved; instantaneous).
Evidence: `supabase/tests/sales_crm/release_a_run.sh` — **45 behaviour checks, 45/45 before, after, after rollback and after re-apply; before/after output byte-identical** (including the exact set of lead and follow-up ids visible to 10 personas, as md5 of the sorted id lists). Personas: sales A, sales A2, manager A, manager B, sales B, Super Admin, reception, coach, deactivated employee, anon, plus NULL/random branch arguments and no-identity calls. Mutation test: replacing `my_sales_branch()` with `select null` ⇒ **11 failures** (the suite does detect a wrong implementation). Built from a schema **without** the refund/financial migrations.

## 4. Release B — Sales Workspace MVP
Files: `supabase/migrations/20261124000001_sales_workspace.sql` (+ rollback), `packages/sales/{domain/workspace.ts, domain/team.ts, domain/lead-workspace-repository.ts, application/workspace.ts(+test), infrastructure/supabase-lead-workspace-repository.ts, index.ts}`, `packages/database-types/src/index.ts` (sales RPC types only), `apps/web/app/(reception)/sales/{page.tsx, workspace.tsx, leads/[leadId]/page.tsx}`, `apps/web/src/components/sales/{interaction-form.tsx, lead-workspace-panel.tsx}`.
What an employee gets: **My Sales Workspace** (first Sales screen for `sales_employee`): own active leads only, one explainable bucket each (overdue → due today → new/never contacted → ready to convert → hot → awaiting a reply → no next action → scheduled), with the reason shown ("Overdue by 2 day(s)"); counters (overdue, today, new, hot, no next action, contacted in 7 days, awaiting reply, ready to convert, converted in 30 days); each card shows name, phone, source, status, priority, owner, last contact + days since, next action, next follow-up; actions: open lead, **Call** (`tel:`), **Open WhatsApp** (`wa.me`, new tab — the system never sends messages and says so), **Record contact** (call / WhatsApp contact / visit + outcome + notes + **mandatory next action**, or close the lead with a lost reason), **Schedule follow-up**, **Add note**, **Mark as hot**, **Convert** (link to the existing conversion screen). Lead page: full activity history (append-only, cannot be edited/deleted) and ownership history.
Database: `lead_followups.kind/outcome`; `leads.interest_level` (hot/warm/cold, separate from status) and `leads.last_contacted_at` (only the RPCs may set it); append-only `lead_activities` and `lead_assignments` (RLS select-only; no INSERT/UPDATE/DELETE grant; guard triggers also stop the owner role and `TRUNCATE`); assignment trigger records **every** change of `assigned_to` (even the old direct UPDATE path) with previous owner, new owner, performer, reason; RPCs (SECURITY DEFINER, empty `search_path`, `auth.uid()` only, no actor id parameter, EXECUTE only for authenticated): `get_my_worklist`, `get_worklist_summary`, `log_lead_interaction`, `set_lead_next_action`, `add_lead_note`, `set_lead_interest`, `assign_leads`; invoker readers `get_lead_activities`, `get_lead_assignments`, `get_lead_workspace_state`.
Policy alignment (**behaviour change — please confirm**): a sales employee now sees/updates **only leads assigned to them**; the unassigned pool is the manager's inbox. Production has **0 unassigned leads**, so no employee loses sight of anything today. F4 closed: a non-manager can no longer INSERT a lead assigned to someone else or to another branch (the 69-check scenario recorded the old behaviour `sales insert lead assigned to a colleague | OK rows=1`; it is now `ERR 42501 SALES_GUARD…` — this is the **only** intended difference in that scenario's output, plus two counts that follow from it; see §7).
Production data facts that shaped the design (aggregates only): 829 leads (824 `new`, 4 lost, 1 converted), all assigned, **693 active leads without a pending follow-up** (they appear in a dedicated bucket, ordered after the actionable ones, and are counted — never auto-dated), **8 leads with several pending follow-ups** (so no unique "one pending" index is added; the RPC completes all pending ones and leaves exactly one), 1 branch, 3 sales employees.
Rollback: `supabase/rollback/sales_workspace_rollback.sql` — **refuses** while history rows or workspace data exist (to avoid destroying history); otherwise restores the Release A policies and removes the objects.
NULL-open bug found and fixed by the suite before it could ship: `can_work_lead()`/worklist authorisation returned NULL (not false) for an unassigned lead or an unknown owner, letting an employee log on a pool lead and read a colleague's worklist. Now fail-closed (`coalesce(…, false)`), covered by tests W03, W04, I10.

## 5. Release C (part 1) — Manager Dashboard (read-only)
Files: `supabase/migrations/20261125000001_sales_manager_dashboard.sql` (+ rollback), `packages/sales/domain/team.ts`, `apps/web/app/(reception)/sales/team/page.tsx`, "Team dashboard" button on the manager's Sales page.
`get_sales_team_summary`, `get_sales_team_overview`, `get_attention_leads` — SECURITY DEFINER, STABLE (read-only), empty `search_path`, authorise inside: active **branch manager of that branch** or Super Admin (NULL = all branches); everyone else refused. Shows: active leads, unassigned, new in period, due today, overdue leads (distinct), hot, no next action, no contact 7+ days, contacts recorded, converted, lost, **conversion rate with its denominator printed on screen** (decided = converted ÷ (converted + lost) decided in the period; cohort = converted ÷ created in the period; NULL, not 0, when undefined); per-employee table with explainable "needs support" flags (≥30 % overdue, ≥50 % without next action, no contact recorded); neglected lists (overdue, no next action, no recent contact, unassigned inbox) with filters by employee, status, source; bulk **assign/reassign** (specific employee + reason) through `assign_leads`; per-employee worklist inspection. Dates are Africa/Cairo.
**Not built (Release C remainder):** conversion integration, performance/activity exports. See §6.

## 6. Conversion (3.7) — stopped on purpose, with the exact reason
Production evidence: `rpc/convert_lead_to_member` returned **HTTP 400 twice in 24 h**, and Production holds **two overloads of `register_membership`** (20- and 21-argument), which makes the unnamed internal call ambiguous (audit finding F1). Fixing conversion requires (a) removing/reconciling the leftover overload in Production (a function DROP — destructive, needs your separate approval) and (b) deciding what `memberships.sold_by` must be set to when a lead is converted (the lead owner? the employee who closes the sale?). (b) is an **attribution decision affecting commission and revenue reports**, so I did not guess. Until both are decided, conversion stays as it is; the workspace only links to the existing screen and never marks a lead converted itself (the database still lets a direct `status='converted'` update through — audit finding F3, to be closed together with conversion).

## 7. Tests executed (all local; none against Production)
| Suite | Result |
|---|---|
| Release A SQL (45 behaviour checks × before/after/rollback/re-apply, parity diff) | 45/45 each, identical |
| Release A benchmarks (pgbench, 1 and 8 clients, 815 and 5,815 leads) | table in §2 |
| Release B + C(part 1) SQL (`release_b_run.sh`: personas, interactions, assignment history, append-only history, forged writes, catalog, concurrency ×2, migration over existing leads, rollback/re-apply fingerprints, dashboard vs independent SQL, Cairo boundaries) | **105/105** (also on a Production-shape schema = the Production code's own migrations + A/B/C: 105/105) |
| Browser, Sales Workspace (`sales-workspace.mjs`, real app + local DB, 4 roles + mobile 390 px) | **37/37** in the full tree · **37/37 on the Sales-only release branch** (527f705 + sales files) |
| Unit tests (all packages, uncached) | identity 44 (+5), sales 46 (+14), reception 101, challenges 119, hr 14, i18n 3, shared-kernel 6, training 5, audit 2 — all pass; typecheck + lint green |
| Existing SQL suites with A/B/C applied on the full schema | Phase 1: 64/64 · Phase 1.1: 80/80 · Phase 1.2: 125/125 · Phase 1.3: 154/154 · Phase 1.3.1: 90/90 · Challenges 282 · identity 22 · audit-log 31 · device verification 70 · HTTP (gateway stand-in) 38/38 · acceptance 59/59 · all 71 migrations apply as single transactions |
| 69-check Reception/Sales scenario | differs from the saved baseline in exactly the F4 closure above (one `OK` → `ERR 42501 SALES_GUARD…`, audit count 19 → 18, leads 2 → 1, one `create_lead` audit action fewer). Nothing weakened; the old line asserted the exploit. |
| **Sales-only release branch** (production code `527f705` + only the sales files), `release/sales-recovery-local` (local, not pushed) | typecheck + lint + all unit tests green; **`next build` succeeds**; reception tests 82 (no refund code present) |
| Real PostgREST / real Supabase | **not run** (same limitation as before); the gateway stand-in is not PostgREST |
| Outside-network login, Scenario C (remote employee) | **not run** — no external vantage point and no Production credentials |

## 8. Approvals requested (nothing is applied until you answer)
1. **Release A** — apply `20261123000001_sales_rls_performance.sql` to Production (`yjuzjvlmyszutuqpwenn`) and deploy the identity/auth fix. Recovery plan: run the rollback file (instant) / redeploy deployment `dpl_BwV81XgrS4besrhpKbcyAtB35DBA` (current Production, rollback candidate). Backup: no data is modified, so no data backup is needed; Supabase's own daily backup/PITR applies. Validation after applying: re-measure `select id from leads` as a sales employee (was 1,036 ms), watch `edge_logs` for 500s on `leads`/`lead_followups` for 24 h, employees open Sales.
2. **Release B** — apply `20261124000001_sales_workspace.sql` and deploy the workspace UI. Confirm the **policy change** (employees see only their own leads; Production has no unassigned leads) and the F4 closure. Recovery: rollback file (refuses once history exists — then forward-recovery: drop the new RPCs/UI via redeploy; history tables can stay unused), redeploy the previous deployment.
3. **Release C part 1** — apply `20261125000001_sales_manager_dashboard.sql` and deploy the team dashboard (read-only functions).
4. **Decision** for conversion: reconcile the duplicate `register_membership` overload in Production, and decide the `sold_by` rule on conversion.
5. **How to deploy**: the safe route is to push the local branch `release/sales-recovery-local` (production code + sales files only) and promote that deployment. I have not committed or pushed anything; tell me if I may create the commit and push that branch, or whether you prefer to do it yourself.

## 9. Rollout log
* 2026-11-14 — investigation, Releases A/B/C(part 1) built and tested locally; Production untouched.
* 2026-11-14 — browser verification on the Sales-only release branch: 37/37. To run it locally at 527f705 three **test-environment** adjustments were needed and then reverted (none is part of the release): (1) the 527f705 demo seed calls a Challenges function/table absent from 527f705's migrations — seed guarded for the run; (2) local `.env.local` used `NEXT_PUBLIC_SUPABASE_URL=same-origin`, a local mode added after 527f705 — set to the local gateway URL; (3) 527f705's device-verification mailer is hard-wired to `api.resend.com` (no local override), so no code reached the local mail sink — the newer dev-only override file was swapped in for the run. No email was sent externally.
