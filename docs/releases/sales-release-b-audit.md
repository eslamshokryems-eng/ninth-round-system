# Sales Release B — Planning & Engineering Audit (B only)

Status: **local only. Nothing applied to Production, nothing pushed, nothing deployed.**
Branch: `release/sales-b-local` (worktree `ninth-round-system-sales-b`), based on `release/sales-recovery-local` (Release A as applied to Production).
Scope: Release B only. C1 (team dashboard) and C2 (conversion + integrity) are removed from this branch and stay unreviewed until B is closed.

## 1. What Release B contains
| Item | File |
|---|---|
| Migration | `supabase/migrations/20261124000001_sales_workspace.sql` (SHA-256 `1e4010ec…27eb`) |
| Behavioural rollback (preferred, non-destructive) | `supabase/rollback/sales_workspace_rollback_behavioral.sql` (`e4a2c308…2328`) |
| Re-enable after behavioural rollback | `supabase/rollback/sales_workspace_reenable.sql` (`15be83c1…ea8f`) |
| Full removal (destructive, refuses if any history exists) | `supabase/rollback/sales_workspace_rollback.sql` (`d7611018…0697`) |
| Production-shape fixture (local tests only) | `supabase/tests/sales_crm/prodshape_lead_assignment_trigger.sql` |
| Test runner | `supabase/tests/sales_crm/release_b_run.sh` (+ `release_b_tests.sql`, `release_b_prodshape_tests.sql`, `release_b_rollback_tests.sql`, `release_b_fp.sql`) |

Database objects added: columns `lead_followups.kind/outcome` and `leads.interest_level/last_contacted_at` (constant defaults, metadata-only), two indexes, append-only tables `lead_activities` and `lead_assignments` (RLS on, SELECT only, guard triggers block UPDATE/DELETE/TRUNCATE even for the owner), triggers `trg_enforce_lead_insert_rules`, `trg_guard_lead_last_contacted`, `trg_record_lead_assignment_ins/upd`, and 11 RPCs (`can_work_lead`, `log_lead_interaction`, `set_lead_next_action`, `add_lead_note`, `set_lead_interest`, `assign_leads`, `get_my_worklist`, `get_worklist_summary`, `get_lead_activities`, `get_lead_assignments`, `get_lead_workspace_state`). Two existing policies on `leads` are changed.

## 2. DROP POLICY → ALTER POLICY
The two `drop policy` + `create policy` pairs ("sales staff read leads", "sales staff update leads") are now `alter policy … using (…) [with check (…)]`. The predicates are unchanged. The policy name, command, roles and permissive flag stay the same, and the policy exists at every moment. The migration has **no DROP, DELETE or TRUNCATE statement** (the only matches are the words in the guard-trigger names and in a comment). The full-removal rollback now restores the policies with ALTER POLICY too. Its other DROPs are kept because removal is what it is for. It refuses to run while any history row or workspace data exists.

## 3. The Production trigger `trg_enforce_lead_assignment_rules`
Production has this trigger and its function, but no migration at 527f705 creates them (they came from the development branch). A read-only inspection on 2026-11-15 found them to be the **only** Sales drift. They are recreated byte for byte in local tests (function md5 `ab01bbd9…`, trigger definition md5 `53b66bc8…`), and every B test now runs against them.

Production rule (BEFORE UPDATE, SECURITY INVOKER): when `assigned_to` changes, a non-manager may only move it from NULL to themselves (a claim). Any change must target a staff member of the same branch.

| Path | Production trigger | Release B | Result (tested) |
|---|---|---|---|
| Employee gives own lead to a colleague (direct UPDATE) | refuses | no change | refused, Production message (P03) |
| Employee unassigns own lead | refuses | — | refused (P04) |
| Employee claims an unassigned lead | allows | lead not visible (policy) | 0 rows: path unreachable, as decided (P05) |
| Employee calls `assign_leads` | not reached | refuses (42501) | refused (P06) |
| Manager `assign_leads` to an active same-branch employee | passes (role read from the JWT inside the DEFINER RPC) | checks role, branch, active sales employee, reason | allowed, one history row with the reason (P09, P16) |
| Manager to another branch (RPC / direct) | refuses | RPC refuses first | refused by both, same rule (P10, P11) |
| INSERT a lead assigned to someone else | not covered (UPDATE only) | `trg_enforce_lead_insert_rules` refuses for employees; managers limited to their branch | refused (O04, O11) |
| Concurrent assignments of one lead | — | row lock in `assign_leads` | serialised, 2 chained history rows (C2) |

**No conflict and no inconsistent duplication.** Release B adds no second UPDATE assignment rule (P02). The branch check is in both `assign_leads` and the trigger, and both give the same answer. The INSERT rule fills the gap the Production trigger leaves (INSERT). BEFORE UPDATE triggers fire in a fixed order: Production rules first, then the B `last_contacted_at` guard (P01).

**Known pre-existing gaps of the direct UPDATE path.** Release B does not open them and the Release B UI never uses that path. They are listed for C2, whose guard closes them:
- A manager can set `assigned_to` by direct UPDATE to a non-sales user of the same branch (for example reception) or to NULL. The Production trigger checks only the branch (P12, P13).
- Such a change is still recorded in `lead_assignments`, with an empty reason (P17).

## 4. Visibility and branch isolation (tested on PG16 and PG17)
- **Sales employee:** sees and updates only leads assigned to them (O01, O09, P20). No unassigned leads, no colleague's leads, no other branch's leads. History is visible only for leads they currently own (I20, A12).
- **Branch Manager:** the whole branch, including unassigned leads (O10, P22). Nothing from another branch (I23, I24, P14, P15).
- **Super Admin:** every branch (P23). Reception, coach and anon: refused (W07–W09, H10).
- Production has 0 unassigned leads today (monitoring 14:27 UTC), so no employee loses visibility of an existing lead when B is applied.

## 5. Activity log and ownership history
- Every interaction, note, next action, interest change and status change made through the RPCs writes `lead_activities`, with an actor-name snapshot.
- Every change of `leads.assigned_to`, by any path (RPC, direct UPDATE, INSERT with an owner), writes **exactly one** `lead_assignments` row: from, to, who did it, the reason when one is given (A08–A15, P16–P19). Refused or rolled-back attempts write nothing (P18).
- History is append-only for every role, including `postgres` (H01–H09, R11, R13).

## 6. Rollback plan when real activity has been recorded
1. **Behavioural rollback (preferred):** `sales_workspace_rollback_behavioral.sql`, together with redeploying the previous frontend. It has no DROP and changes no data. It ALTERs the two policies back to the exact Release A text, disables the B insert rule and the `last_contacted_at` guard, and revokes EXECUTE on the 11 RPCs.
   - It deliberately keeps the history recorder and the history guards on, so owner changes made after the rollback are still audited (R12).
   - Tested on a database where Release B had been used: all history rows kept (R01), objects kept (R02), Release A visibility back (R04), the A-era claim and follow-up flows work (R07, R10), branch isolation kept (R16).
   - Catalog check: the rollback changes **only** policies, trigger enable flags and function grants (M05). The leads policies equal Release A exactly (M03).
2. **Re-enable:** `sales_workspace_reenable.sql` brings the catalog back to Release B exactly (M04, M05).
3. **Full removal:** `sales_workspace_rollback.sql` refuses while history exists (M02, catalog unchanged). On an unused database it restores the Release A catalog exactly in every section, and a re-apply reproduces B exactly (M06).

## 7. Applying (when approved)
Apply in one transaction with `lock_timeout = 5s` and `statement_timeout = 30s`, as for Release A. The runner applies it exactly that way, and every existing lead and follow-up row stays byte-identical (M01). Recommended pre-flight, read-only: the drift fingerprint, 0 unassigned leads, P8 per persona. Afterwards: P8, the catalog fingerprint, and edge/postgres logs.

## 8. Frontend (B only)
- **Employee:** `/sales` opens the **My Sales Workspace**. It shows the ordered worklist, Call / WhatsApp links, the record-contact form (next action required), next action, notes and interest.
- **Lead page:** history panel (activities and ownership). Managers assign or reassign through `assign_leads`, and the reason is required.
- **Removed from this branch:**
  - the team dashboard page and link, the team use cases and repository methods, and the C1 RPC types;
  - `convert_lead`, `get_lead_conversion`, `mark_lead_lost` and `reopen_lead`. Conversion, lost and restore use the existing Production paths (`convert_lead_to_member` and direct updates), as before.
- Included and not B-specific: the login session-profile resilience fix (`use-auth-bootstrap.ts`, `resolve-session-profile.ts`) from the remote-access investigation.
- Checks: typecheck pass, all unit tests pass (sales 43/43), eslint clean on every changed file. The repo-wide lint has pre-existing errors in untouched files.

## 9. Preview — blocker found (read-only check of the Vercel project settings)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are set once, for **both** Production and Preview. A Preview deployment therefore talks to the **Production database**:
- Without the B migration, the B screens fail, because the RPCs do not exist.
- Anything a tester does in Preview writes real Production data.
- `RESEND_*` is Production-only, so a new device in Preview cannot receive its verification code by email.

Testing B on Preview needs a separate database first. That decision needs approval. Options:
- (a) a Supabase branch or a separate project, seeded with test data, with Preview-scoped env vars for the B git branch;
- (b) keep testing on the local stack only.

Values were not read (no decryption).

## 10. Local verification results (2026-11-15)
| Check | PostgreSQL 16.15 | PostgreSQL 17.12 (Production is 17.6, same major) |
|---|---|---|
| `release_b_run.sh` — migration, behaviour, Production-trigger interplay, concurrency, rollbacks (123 checks) | 123 / 123 pass | 123 / 123 pass |
| Browser, `sales-workspace.mjs` (employee, manager, other branch, mobile 390 px, console errors), with the Production trigger | — | 37 / 37 pass |
| Performance at 20,015 leads / 80,009 history rows (Production has ≈830 leads) | — | worklist 17 ms, summary 13 ms, own leads 4.6 ms, manager page 7.8 ms, interaction write 16 ms; 8 parallel clients: 157 tps, 51 ms average, 0 failures |
| typecheck / unit tests / `next build` | pass / all pass / pass | |

Not covered locally: the hosted Supabase Auth/PostgREST stack. The local gateway emulates PostgREST and Auth. This is the reason for the Preview database prerequisite in §9.
