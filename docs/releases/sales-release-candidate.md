# Sales System — Release Candidate (RC1)

Date: 2026-11-14 · Branch: `release/sales-recovery-local` (**local only, not pushed**), based on Production's commit `527f705`.
**Production status: nothing applied, nothing deployed.** Production was only read: catalog queries, aggregate counts, logs, and one `EXPLAIN` that resolves a function without running it.

Related documents:
* `sales-register-membership-audit.md`: the duplicate overload and the conversion fix.
* `sales-employee-guide.md`: operating guide, English and Arabic.
* `sales-system-recovery-and-rollout.md`: the earlier analysis and the root cause of the timeouts.

## 1. Verdict
**Ready for release review.**
* All approved business rules are implemented and enforced in the database.
* Employee and manager journeys pass end to end in a real browser against a real database.
* Conversion is idempotent and safe under concurrency.
* No known critical or high-severity defect remains.
* All automated suites pass and the production build succeeds.

**Not production-verified** (see §9): real PostgREST/Supabase, the Supabase Auth URL settings, and access from an outside network have not been tested. These are covered by the post-deployment checks in §11.

## 2. Scope: what the release contains
| Area | Delivered |
|---|---|
| Stability (Release A) | RLS performance fix (definer `can_manage_leads`, `my_sales_branch()`, initPlan policies); no sign-out on a transient profile-load failure |
| Employee workspace (B) | prioritised worklist with reasons, counters, card details, Call / WhatsApp links, **Record contact** (outcome + mandatory next action), schedule/reschedule, notes, hot/warm/cold, follow-ups page (Record contact / Reschedule), lead page with immutable history |
| Ownership (B) | an employee sees and works only **their** leads; unassigned leads are visible to the branch manager only; audited assign/reassign with a required reason |
| Manager (C1) | team dashboard: summary, per-employee table with "needs support" flags, neglected lists with filters, bulk assign, worklist inspection, conversion rates with numerator and denominator shown |
| Conversion (C2) | `convert_lead()`: validated, transactional, idempotent, `sold_by` = lead owner, works with Production's duplicate overload; lead page shows who was credited and who registered; lost / reopen with a mandatory next action |
| Integrity (C2) | API users can no longer bypass the rules through direct table writes (status, priority, owner, conversion fields, follow-ups) |

**Excluded on purpose:** Refunds / accounting migrations `20261118`–`20261122`, THE NINTH, Challenges and every other unrelated change. The branch is Production's code plus Sales files only (§12).

## 3. Approved business rules — where each is enforced
| Rule | Enforced by | Tests |
|---|---|---|
| Unassigned leads visible only to the branch manager | `sales staff read/update leads` policies (B) | B SQL suite, browser A2, B1, C1 |
| Manager assigns / reassigns, recorded in an audit trail | `assign_leads()` (role, branch, active sales employee, reason required); `lead_assignments` written by trigger on **every** owner change; direct owner changes refused | B suite, W05/W15, browser B2–B5 |
| `memberships.sold_by` = lead owner | `convert_lead()` passes `p_sold_by := leads.assigned_to`; `finalize_lead_conversion()` refuses otherwise | V02, V05, V24, G11, H3, mutation M4 |
| `created_by` / `received_by` keep their meaning (the employee who registers) | unchanged `register_membership()` (sets both from `auth.uid()`) | V02, V05, G11, H3 |
| `leads.assigned_to` meaning unchanged | no change | — |
| `register_membership` overloads: no Production DROP | named-argument call resolves uniquely; old entry point delegates | V00, V00b, V24 |

## 4. Database changes (all additive; four migrations, each in one transaction)
| File (sha256 prefix) | Content |
|---|---|
| `20261123000001_sales_rls_performance.sql` (`c834c13d5481e9c1`) | `can_manage_leads` → SECURITY DEFINER, `search_path=''`; new `my_sales_branch()`; the four leads/follow-up read/update policies re-created with initPlans. **Behaviour identical** (45 checks before = after) |
| `20261124000001_sales_workspace.sql` (`15061e0b19f9aab8`) | columns `lead_followups.kind/outcome` and `leads.interest_level/last_contacted_at`; append-only `lead_activities`, `lead_assignments`; insert rules (F4); workspace RPCs; owner-only employee policies |
| `20261125000001_sales_manager_dashboard.sql` (`caad59e73cd9dba1`) | read-only `get_sales_team_summary`, `get_sales_team_overview`, `get_attention_leads` |
| `20261126000001_sales_conversion_and_integrity.sql` (`33848c3331a2c35e`) | `lead_conversions` (append-only link, no amounts); `convert_lead`, `finalize_lead_conversion`, `mark_lead_lost`, `reopen_lead`, `get_lead_conversion`; `convert_lead_to_member` delegates; direct-write guards on `leads` and `lead_followups` |

Rollbacks (`supabase/rollback/sales_*_rollback.sql`):

| Rollback | Restores | Refuses when |
|---|---|---|
| A | the original definitions | — |
| B | the A shape | history or workspace data exists |
| C1 | removes the three functions | — |
| C2 | the C1 shape, plus the **byte-identical original `convert_lead_to_member` and its original ACL** | conversions recorded through `convert_lead` exist |

Every rollback is verified by fingerprints (§7).

**Tables touched:** `leads`, `lead_followups` (new columns, policies, triggers); new `lead_activities`, `lead_assignments`, `lead_conversions`. `members`, `memberships`, `membership_payments` and receipts get **no** schema, policy or data change. They are written only by the existing `register_membership()` during a conversion, exactly as reception writes them.

## 5. Security report
* **Authorization lives in the database.** Every write RPC checks `auth.uid()` and role/branch/ownership through `can_work_lead()`, which is fail-closed (`coalesce(…, false)`). No RPC accepts an actor id. RLS covers every Sales table.
* **Definer functions:** `search_path=''`, fully qualified names, no dynamic SQL, owner `postgres`, EXECUTE revoked from PUBLIC and anon, granted to authenticated only (G01, G02).
* **`convert_lead` is deliberately INVOKER,** so member/membership/payment inserts pass the same RLS as reception and nobody gains a new right to create memberships. Its `search_path` is `public, pg_temp`, because the existing `register_membership` uses unqualified table names.
* **IDOR:** employees acting on a colleague's lead, another branch's lead or an unknown id are refused (V06–V11, A17–A19, B7–B8, C2, G16). Reception and anonymous callers are refused (V10, V11, R1, R2).
* **Fake conversions are impossible (finding F3 closed).** Direct `status='converted'` or `converted_member_id` updates are refused for every role (W01, W02, W14, W17). `finalize_lead_conversion` accepts only a membership created **in the same transaction by the caller for the lead owner**, not linked to another lead (W12, W12b).
* **Follow-up integrity:** follow-ups cannot be inserted, updated or deleted directly (W09–W11, G17). Every change goes through functions that keep exactly one next action and write history.
* **History is append-only:** `lead_activities`, `lead_assignments` and `lead_conversions` cannot be updated, deleted or truncated, not even by the owner role. They are read through RLS scoped to the lead (W16, W18, X01–X05).
* **NULL-open bug found and fixed** before release in `can_work_lead` and the worklist owner check (B suite W03, W04, I10).
* **Production-shape note:** on Production's code `can_manage_leads()` returns NULL instead of false for anonymous, deactivated or identity-less callers. Every consumer treats NULL as deny: in RLS policies and inside `EXISTS (… WHERE …)`, none in a PL/pgSQL `IF`. Release A keeps it byte-for-byte equivalent. U05b, U06b and U07 assert "never grants".
* **Delete paths reviewed:** only `delete_member` deletes members. Deleting a converted member was already blocked in Production by `leads.converted_member_id`. No screen deletes memberships directly. A direct API delete of a *converted* membership is now refused by `lead_conversions`, which keeps the sale's link.
* **Mutation testing (do the tests catch broken code?):**

  | Mutation | Failures caught |
  |---|---|
  | Release A: `my_sales_branch` → NULL | 11 |
  | C2 M1: no row lock | CV1, CV2 |
  | C2 M2: no same-transaction check | W12b (a gap was found here, and the test added) |
  | C2 M3: no direct-write guard | 9 |
  | C2 M4: wrong `sold_by` | 4 |

## 6. Performance report (local hardware; ratios and scale, not Production latency)
Production root cause: per-row RLS (see the rollout doc). Release A, 8 concurrent dashboard sessions:

| Dataset | Original | Release A |
|---|---|---|
| 815 leads | 2,772 ms | 14 ms |
| 5,815 leads | 17,562 ms | 32 ms |

The original timings at 5,815 leads exceed the Production 8 s limit; Release A is far below it.

Full RC at **20,015 leads / 11,982 follow-ups / 80,009 history rows** (`supabase/tests/sales_crm/perf_run.sh`, median of 7 runs):

| Screen / query | ms |
|---|---|
| employee: own leads (RLS) / worklist(100) / summary | 2.6 / 13.5 / 10.3 |
| employee: follow-ups today / overdue / one lead's history / search | 5.6 / 4.8 / 0.9 / 2.6 |
| manager: branch leads page (50) / employee worklist | 6.7 / 7.2 |
| manager: team summary / team overview (10 employees) | 81 / 98 (overview was 231 before the grouped rewrite) |
| manager: attention lists (overdue / no recent contact) | 11 / 18 (overdue was 43 before) |
| write: record contact / convert lead | 11 / 15 |
| 8 concurrent employees (worklist + summary) | 44 ms average, 181 tx/s, 0 failures |

Lists are paginated (`limit` capped at 500) and nothing loads all leads into the browser. Production has 830 leads today.

## 7. Test results (all executed locally on the release branch)
| Suite | Result |
|---|---|
| Release A SQL: 45 behaviour checks × before / after / rollback / re-apply, parity diff | **45/45 each, identical**; rollback restores identical behaviour |
| Release A benchmarks (pgbench, 1 and 8 clients, two dataset sizes) | §6 |
| Releases B + C1 + C2 SQL, on **Production's shape** (duplicate overload present). Covers: personas, interactions, assignment history, append-only history, forged writes, catalog, migration over existing data, conversion (attribution, idempotency, validation, atomicity, IDOR, lost/reopen), direct-write guards, visibility, old entry point, concurrency (C1, C2, CV1 double submit, CV2 owner-vs-manager race), and rollback fingerprints (M01–M06) | **168/168** |
| Mutation tests | §5: all mutations detected |
| Unit tests (Vitest, uncached) | identity 44, sales 50, reception 82, hr 14, shared-kernel 6, training 5, audit 2: all pass |
| Typecheck + lint (25 turbo tasks) | pass |
| `next build` (production build) | succeeds |
| Browser: Sales Workspace (`sales-workspace.mjs`). Covers: employee loop, manager assign/reassign, branch isolation, mobile 390 px, console errors | **37/37** |
| Browser: CRM E2E (`sales-crm-e2e.mjs`). Covers: follow-ups page record/reschedule, lost→reopen, owner conversion with DB attribution check, reload details, API retry, receipt-used refusal, team-page refusal, IDOR, forged REST writes, profile edit allowed, unassigned-lead block, manager converting an employee's lead, team dashboard vs independent count, reception refused | **28/28** |
| API / authorization over HTTP | covered in the browser suites through the local gateway (RPC and REST calls with real JWTs): A17–A19, B6–B8, C2, G13, G16–G18, R2 |
| Production performance, real PostgREST, Auth settings, outside-network login | **not executed** (§9) |

How the browser suites were run:
* The local mail stand-in needs a dev-only mail override. Production's `527f705` mailer has none, so it was swapped in for each run and restored afterwards; it is not in the release.
* The browser login helper retries once after clearing the local verification-code limiter (`truncate device_verification_codes`). This is a local-harness timing issue, not an app defect: it was observed and documented.

## 8. Behaviour changes to tell staff about
* Employees no longer see unassigned leads. Production has 0, so nobody loses anything today.
* "Complete" and "Cancel" on a follow-up were replaced:
  * **Record contact** completes the follow-up and requires the next action;
  * **Reschedule** moves it;
  * **Mark as Lost** closes the lead.
* **Restore** of a lost lead became **Reopen**, which asks for the next action.
* Conversion is possible only for an assigned lead with an active owner (Production: 0 exceptions). A phone that already belongs to a member is refused with a clear message, as before but now explained.
* 693 of 825 active Production leads have no next action today. They appear in the "No next action" bucket and are counted on the team dashboard. Nothing is auto-dated.

## 9. Known limitations / not verified
1. **Real PostgREST / Supabase** was not run locally; the gateway stand-in is not PostgREST. Error mapping, overload resolution via REST and schema-cache behaviour are covered only by the post-deployment checks. The stand-in had a bug: it ignored `!constraint` embed hints. It was fixed in the test tooling; the app itself was unaffected.
2. **Supabase Auth Site URL / redirect list** and **login from an outside network** are unverified.
3. **Production schema drift:** several repo migrations are absent from Production's history although their objects exist. The four Sales migrations do not depend on those objects beyond what was verified read-only: the policies, functions and columns they replace or reference exist in Production with the expected definitions.
4. The leftover overloads (`register_membership`, `renew_membership`, `sell_additional_membership`) remain. A clean-up is optional and separate.
5. The legacy converted lead (1 in Production) has no `lead_conversions` row. Its page shows "converted" without credit details, and a retry returns `already_converted` without a membership id.

## 10. Production migration execution plan (requires your approval for each step)
**Order:** A → B → C1 → C2, then deploy the app from this branch. Steps A to C2 can be applied in one maintenance window. The app must be deployed **after** C2, because the new UI calls `convert_lead`, `mark_lead_lost` and `reopen_lead`. The **old** app keeps working on the new schema with these exceptions:
* old Mark-lost, Restore and follow-up Complete/Cancel buttons get a clear refusal (they used direct writes);
* old conversion starts working.

Keep the gap short.

For each migration:
1. **Pre-checks (read-only):**
   * confirm the objects it replaces match the expected definitions (the queries used in this audit);
   * `select count(*) from leads where assigned_to is null` (expect 0);
   * no active lead with an inactive owner (expect 0).
2. **Backup:** the migrations change no existing row, so no data backup is required beyond Supabase's daily backup. Before C2, record the current `convert_lead_to_member` definition and ACL (the rollback restores exactly that).
3. **Apply:** run the file as one transaction (`apply_migration` with the file's exact content; check the sha256 above).
4. **Post-checks:**
   * A: measure `select id from leads` as a sales employee (was 1,036 ms) and watch `edge_logs` for 500s on `leads` / `lead_followups`.
   * B, C1: the new functions exist with definer / `search_path` / grants as in G01 and G02.
   * C2: run the overload check (`EXPLAIN` of the old positional call still errors 42725 — expected — while a named call resolves).
5. **App deploy:** push the branch, let Vercel build a preview, then **promote** it to Production (`app.9throundegypt.com`). No environment variable changes are needed.
6. **Smoke test on Production** (real staff accounts):
   * employee: workspace, record a contact, reschedule;
   * manager: team dashboard, assign;
   * one real conversion **with a real receipt** when a customer actually joins;
   * check `memberships.sold_by` = the lead owner.

## 11. Rollback and recovery plan
* **App:** promote the previous deployment (`dpl_BwV81XgrS4besrhpKbcyAtB35DBA`, Production today). This is instant.
* **Database (reverse order C2 → C1 → B → A):** each rollback file runs in one transaction.
  * The C2 and B rollbacks **refuse** once real conversions or history exist, to protect data. After that point, recovery is **forward**: fix and re-apply. History tables can stay unused.
  * Rolling back C2 restores Production's original, broken conversion (42725), so prefer fixing forward.
* **Data:** nothing is deleted by any migration. Conversions create normal members, memberships and payments through the existing function. Reversing a wrong conversion uses the existing receipt/member procedures, exactly as today.

## 12. Release checklist
- [x] Business rules implemented and enforced in the database (§3)
- [x] Employee and manager workflows end to end in a browser (65/65)
- [x] Conversion safe and idempotent (V01–V24, CV1, CV2, G10–G14, H3)
- [x] Permissions enforced at database level; IDOR and forged writes tested
- [x] No known critical or high defects
- [x] SQL, unit, typecheck, lint, browser and performance suites pass; production build succeeds
- [x] Migrations reviewed; rollbacks verified by fingerprint; refuse-to-destroy guards tested
- [x] Unrelated work excluded (no Refunds / accounting / THE NINTH / Challenges code or migrations)
- [x] Branch isolated (Production `527f705` + Sales files and Sales test tooling)
- [x] Environment limitations disclosed (§9)
- [ ] **Your approval** to push the branch
- [ ] **Your approval** for each Production migration (§10)
- [ ] **Your approval** to promote the deployment
- [ ] Post-deployment checks (§10.4, §10.6) on Production
