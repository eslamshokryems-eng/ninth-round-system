# Sales Release B — Production rollout plan (existing implementation, no new infrastructure)

Prepared 2026-11-15 from read-only inspection of GitHub, Vercel and the Production database. Nothing has been pushed, migrated or deployed.
The separate Supabase test account (`sales-release-b-preview-plan.md`) is **dropped** by owner decision: no new account or project. B is verified locally (PG16 + PG17) and then rolled out to the existing system in controlled steps.

## 1. Branch ancestry (verified)
```
527f705  = what Production runs today (Vercel production deployment dpl_BwV81…, from branch claude/9th-round-platform-architecture-1id262)
  └ 2691e0c  RC1 (A+B+C1+C2)                    ← origin/release/sales-recovery-local (published)
      └ 82b26ce  Release A comment fix            (local only)
          └ e46f01d  Release A ALTER-POLICY rollback (local only)
              └ b381d3f  Release A as ALTER POLICY   (local only) ← the version applied to Production
                  └ a7c6f2b  Release A execution log  (local only) = tip of local release/sales-recovery-local
                      └ 7f59bfc  Release B only        (local only, release/sales-b-local)
                          └ debee7f  Preview plan doc  (local only, release/sales-b-local; superseded)
```
- `82b26ce` is on **both** local branches. `7f59bfc` and `debee7f` are only on `release/sales-b-local`. None of the four local commits after `2691e0c` is on GitHub.
- The GitHub tip of the production branch is `1536ee9`. It **contains `527f705` plus Challenges and other unreleased work** (175 files). Production runs `527f705`, not that tip. **Merging B into the production branch would therefore also ship Challenges.** The plan below never merges into or pushes to that branch.
- B, compared with `527f705`, changes only Sales code, plus the session-profile resilience fix (`use-auth-bootstrap.ts`, `resolve-session-profile.ts`). There are **0 changes** to members, receipts, reception, memberships, payments, Challenges, Refunds or THE NINTH.

## 2. Compatibility with Production (read-only, 2026-11-15)
| Check | Result |
|---|---|
| Postgres | 17.6 (tests run on 17.12 and 16.15) |
| Release A in place | `20261115053707 sales_rls_performance`; `my_sales_branch()` and `can_manage_leads()` are SECURITY DEFINER |
| Names B creates already exist? | none (tables, columns, indexes, 15 functions, 4 triggers): no collision |
| Types B uses | `lead_status` = new, contacted, follow_up, converted, lost · `followup_status` = pending, completed, cancelled · `lead_lost_reason` present: all match |
| Columns B reads | `leads.*` and `lead_followups.*` as in the repo; `profiles` id, role, branch_id, full_name, is_active present |
| Triggers on `leads` | `trg_audit_leads_insert`, `trg_audit_leads_update` (generic `log_table_change`), `trg_enforce_lead_assignment_rules` (Production-only, recreated byte for byte in the tests), `trg_leads_updated_at`. All present in the local test schema. |
| Data | 830 leads, **0 unassigned**, 377 follow-ups (140 pending), 0 owners in another branch, 0 inactive or non-sales owners; 3 sales employees, 2 branch managers, 1 super admin |
| Existing conversion `convert_lead_to_member` | md5 `7b31d29c`, identical to the tested one. On the B schema an employee and a manager both convert successfully (member, membership, payment, lead converted). B does not touch this function. |
| Login | B adds only the retry when the profile load fails (no more sign-out on a slow network). Members and auth routes are unchanged. |

**Pre-existing behaviour, not changed by B (fixed in C2):** the current conversion leaves `memberships.sold_by` empty. Production has 1 converted lead, with `sold_by` null. The decision "sold_by = lead owner" takes effect only in C2.

## 3. Release B migration: exactly what changes
File `supabase/migrations/20261124000001_sales_workspace.sql`, SHA-256 `1e4010ec336bdd9da132559e7c59e47bced9ef0d80b1593f869ab8b1f98727eb`, 498 lines. It contains **no DROP, DELETE, TRUNCATE or UPDATE of data**.

| Kind | Objects |
|---|---|
| Columns (constant defaults, existing rows untouched) | `leads.interest_level` text, default `'warm'`, CHECK hot/warm/cold · `leads.last_contacted_at` timestamptz · `lead_followups.kind` text, default `'call'`, CHECK · `lead_followups.outcome` text, CHECK |
| Indexes | `idx_lead_followups_pending_lead`, `idx_leads_owner_status`, `idx_lead_activities_lead`, `idx_lead_activities_actor`, `idx_lead_assignments_lead` |
| New tables (RLS on; `authenticated` gets SELECT only) | `lead_activities`, `lead_assignments`. Policies "lead activities read" and "lead assignments read": owner, branch manager, super admin. |
| Altered policies (ALTER POLICY, same names) | `leads` "sales staff read leads" and "sales staff update leads": an employee sees only leads assigned to them; managers keep the whole branch; super admin everything |
| Triggers | `trg_enforce_lead_insert_rules` (BEFORE INSERT leads) · `trg_guard_lead_last_contacted` (BEFORE UPDATE leads) · `trg_record_lead_assignment_ins/upd` (AFTER, leads) · `trg_guard_lead_activities`, `trg_guard_lead_assignments` (+ `_truncate`) on the history tables |
| Functions (all `search_path=''`) | RPCs, EXECUTE for `authenticated` only: `can_work_lead`, `log_lead_interaction`, `set_lead_next_action`, `add_lead_note`, `set_lead_interest`, `assign_leads`, `get_my_worklist`, `get_worklist_summary`, `get_lead_activities`, `get_lead_assignments`, `get_lead_workspace_state`. Trigger functions, EXECUTE revoked: `enforce_lead_insert_rules`, `guard_lead_last_contacted`, `record_lead_assignment`, `guard_lead_history`. |
| Untouched | members, memberships, payments, receipts, `convert_lead_to_member`, `enforce_lead_assignment_rules`, every other table's RLS, Auth |

**Application command** (one transaction):
```
set local lock_timeout = '5s'; set local statement_timeout = '30s';
<the 498 lines of 20261124000001_sales_workspace.sql>
```
It is recorded as migration `sales_workspace`. `lead_followups` and `leads` are locked only for the milliseconds the `ALTER TABLE`s take. With 830 and 377 rows, the CHECK validation is instant.

**The current Production frontend (`527f705`) keeps working on the B database.** Old screens still work: the manager's direct reassignment (now recorded in history), creating leads (an employee's own lead is assigned to them), follow-ups, lost, restore and conversion. So the database can go first and the app second, with no broken window.

## 4. Application to deploy
- Commit **`7f59bfc`** (branch `release/sales-b-local`; `debee7f` only adds a doc and is equivalent). Locally: typecheck pass, unit tests pass, `next build` pass, browser suite 37/37 on PG17 with the Production trigger.
- How: push `release/sales-b-local` → Vercel builds a **Preview** (SSO-protected, `all_except_custom_domains`) → after verification, **promote that exact deployment** to Production. `app.9throundegypt.com` then serves `7f59bfc`. No merge into, or push to, the production branch.
- Note: the Preview shares the Production database variables. It is used only to confirm the build and for read-only page loads, never to enter data. This is an existing configuration, and not changed here.

## 5. Expected behaviour for staff after B
- **Sales employee:** `/sales` opens **My Sales Workspace**.
  - Only their leads, ordered: overdue → due today → new → ready → hot → awaiting reply → no next action → scheduled, each with its reason.
  - Card buttons: Call, WhatsApp (opens the chat, sends nothing), Record contact (the next step and its date are required), Schedule follow-up, Note, Hot/Warm/Cold.
  - The lead page shows the full history.
  - They no longer see leads of colleagues or unassigned leads. There are 0 unassigned leads today, so nobody loses a lead.
- **Branch manager:** the branch dashboard as today, plus assign or reassign from the lead page **with a required reason**, recorded with who, when and why. They see the whole branch, including unassigned leads.
- **Unchanged:** members, renewals, receipts, check-in, HR, reports, conversion form (no sold_by change until C2), mark lost, restore, login.

## 6. Rollout sequence (each ⛔ = separate explicit approval)
| # | Step | Production effect | Approval |
|---|---|---|---|
| 0 | Pre-flight, read-only: drift fingerprint (A shape, 39 migrations, trigger md5); 0 unassigned; P8 visibility per persona; P7 timings; no long-running locks; Release A monitoring report | none | — |
| 1 | Push `release/sales-b-local` (adds `82b26ce…debee7f` to GitHub) → Preview build. Check: READY, no build errors, pages load (no data entry) | none (a Preview only) | ⛔ #1 |
| 2 | Apply the B migration (section 3) | DB schema + leads policies | ⛔ #2 |
| 3 | Verify, read-only: catalog fingerprint = local Release B fingerprint (policies, columns, triggers, functions, grants); leads/follow-ups rows byte-identical (count + md5 before and after); P8: managers and super admin identical, employees identical (0 unassigned); P7; postgres/edge logs 15 min | none | — |
| 4 | Promote the Preview deployment of `7f59bfc` to Production | app.9throundegypt.com serves B | ⛔ #3 |
| 5 | Smoke tests: page loads and RPC reads only (section 7); runtime errors and edge 5xx for 30 min | none | — |
| 6 | Acceptance by staff during normal work (section 8), then monitoring checks like Release A (same day + next working day) | real use | owner |
| 7 | Close B → start C1 review (manager dashboard), then C2 | — | owner |

**Timing:** after the final Release A report, outside peak hours. Steps 2 → 4 take about 15 minutes.

## 7. Smoke tests (no customer or financial data modified)
- Read-only SQL, as each Production persona (claims plus `set role authenticated` inside `begin read only … rollback`):
  - `get_my_worklist()` and `get_worklist_summary()` for each employee: counts equal their active leads;
  - manager visibility of the whole branch; employee isolation (0 foreign rows); cross-branch denial;
  - `get_lead_activities` on one lead.
- Vercel: the deployment is READY; `/login` and `/sales` respond 200 on the custom domain; runtime errors show 0 new error types.
- Edge logs: `/rest/v1/rpc/get_my_worklist` and the other B RPCs return 2xx; no 401/403/5xx spike.
- **No write is done by me in Production.** Write paths (record contact, assign) were proven locally and are confirmed by staff in step 6.

## 8. Acceptance checklist for staff (real work, in their normal flow)
- **Employee**
  - log in on the phone they use (device verification as today);
  - the workspace shows their leads, with the overdue ones first;
  - record a real call with its next step;
  - the lead page shows that call in History;
  - add a note;
  - WhatsApp opens the chat.
- **Branch manager**
  - leads list = whole branch;
  - reassign one lead with a reason and see it in History;
  - the employee then sees it in their workspace and the previous owner no longer does.
- **Both:** report anything that looks wrong. The rollback is ready (section 9).

## 9. Rollback
**App:** Vercel instant rollback to deployment `dpl_BwV81XgrS4besrhpKbcyAtB35DBA` (`527f705`, rollback candidate). It takes seconds, and the old frontend works on the B database (section 3).

**DB:** `supabase/rollback/sales_workspace_rollback_behavioral.sql`, SHA-256 `e4a2c308…2328`.
- No DROP, no data change.
- ALTERs the two leads policies back to the Release A text, disables the B insert rule and the last_contacted guard, and revokes EXECUTE on the 11 RPCs.
- **Keeps all history** and keeps recording owner changes.
- Tested with history present on PG16 and PG17.
- Re-enable: `sales_workspace_reenable.sql` (`15be83c1…ea8f`).
- Full removal, `sales_workspace_rollback.sql`: only while no history exists. It refuses otherwise.

**Order:** roll back the app first, then the database (behavioural), each with its own approval. The catalog fingerprint confirms the Release A policies are back.

**Triggers for a rollback:** errors on `/sales` or the leads endpoints, a visibility mismatch in P8, staff unable to record contacts or log in.

## 10. After B: C1 and C2 (documented order, not started)
- **C1** (`20261125000001_sales_manager_dashboard.sql`, read-only functions + team page) and **C2** (`20261126000001_sales_conversion_and_integrity.sql`: idempotent `convert_lead` with sold_by = owner, lost/reopen RPCs, direct-write guards, which also close the two direct-path gaps noted in the B audit) are on `release/sales-recovery-local` / RC1.
- They will be rebased onto the B branch, audited the same way (ALTER instead of DROP where possible, Production-shape tests on PG17, non-destructive rollback) and rolled out with the same approval steps.
