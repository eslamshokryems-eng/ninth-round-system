# Sales Release B — Production rollout plan (existing implementation, no new infrastructure)

Prepared 2026-11-15; **revised 2026-11-17** (Production now runs the button hotfix `2f88b75`; Release A monitoring closed PASS; Production has 40 migrations). Release B is not migrated and not deployed. Production frontend = `2f88b75` (deployment `dpl_EEW7a5XUBNkho7MXSuEAKvt4jKzV`) on Release A.
The separate Supabase test account (`sales-release-b-preview-plan.md`) is **dropped** by owner decision: no new account or project. B is verified locally (PG16 + PG17) and then rolled out to the existing system in controlled steps.

## 1. Branch ancestry (verified)
```
527f705  = base of the Production frontend (dpl_BwV81…, now superseded; Production runs 527f705 + hotfix f11cf0d = 2f88b75, dpl_EEW7…)
  └ 2691e0c  RC1 (A+B+C1+C2)                    ← origin/release/sales-recovery-local (published)
      └ 82b26ce  Release A comment fix            (local only)
          └ e46f01d  Release A ALTER-POLICY rollback (local only)
              └ b381d3f  Release A as ALTER POLICY   (local only) ← the version applied to Production
                  └ a7c6f2b  Release A execution log  (local only) = tip of local release/sales-recovery-local
                      └ 7f59bfc  Release B only        (local only, release/sales-b-local)
                          └ debee7f  Preview plan doc  (local only, release/sales-b-local; superseded)
                              └ 65a0c61, fc3aa70 (vercel.json guard) = origin/release/sales-b-local
                                  └ b095133  button fix (same code as Production hotfix 2f88b75) + regression test = **deploy source**
```
- **Pushed 2026-11-15 17:34 UTC:** `origin/release/sales-b-local` = `fc3aa70` (`82b26ce … 65a0c61` + `fc3aa70`). `fc3aa70` adds only `apps/web/vercel.json` = `git.deploymentEnabled: { "release/sales-b-local": false }`, so Vercel's Git integration builds nothing for this branch (verified: 0 deployments after the push). Application code is identical to `7f59bfc`.
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

**The current Production frontend (`2f88b75` = `527f705` + button fix) keeps working on the B database.** Old screens still work: the manager's direct reassignment (now recorded in history), creating leads (an employee's own lead is assigned to them), follow-ups, lost, restore and conversion. So the database can go first and the app second, with no broken window.

## 4. Application to deploy
- Source: commit **`b095133` or newer** (= `7f59bfc` application code + the button fix that is live in Production). **Never deploy `fc3aa70` or `7f59bfc`: they lack the fix and would bring back the duplicate-lead defect.** Locally: typecheck pass, unit tests pass, `next build` pass, browser suite 37/37 on PG17 with the Production trigger.
- **Not used any more:** Preview → promote. A Preview of this branch would run on the shared Preview variables, which point at the **Production** Supabase project (verified: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` target `production` + `preview`, no branch override).
- **Proposed method (section 11 has the evidence):** a **staged Production deployment** built with the Vercel CLI from a clean checkout of `b095133`: `vercel deploy --prod --skip-domain`.
  - It is a Production deployment: Production variables, no Preview, no change to any variable.
  - Vercel assigns **no domain** to it, so `app.9throundegypt.com` keeps serving `2f88b75`.
  - It gets its own unique URL, protected by Vercel Authentication (the project's `all_except_custom_domains` setting), for read-only smoke tests.
  - Only after a separate approval: `vercel promote <deployment>` moves the domain. Documented: promote does not rebuild.
  - Rollback: `vercel rollback dpl_EEW7a5XUBNkho7MXSuEAKvt4jKzV` (`2f88b75`). **Never roll back to `dpl_BwV81…`: it has the duplicate-save defect.**
- No merge into, or push to, the production branch (its GitHub tip `1536ee9` contains unreleased Challenges work).

## 5. Expected behaviour for staff after B
- **Sales employee:** `/sales` opens **My Sales Workspace**.
  - Only their leads, ordered: overdue → due today → new → ready → hot → awaiting reply → no next action → scheduled, each with its reason.
  - Card buttons: Call, WhatsApp (opens the chat, sends nothing), Record contact (the next step and its date are required), Schedule follow-up, Note, Hot/Warm/Cold.
  - The lead page shows the full history.
  - They no longer see leads of colleagues or unassigned leads. There are 0 unassigned leads today, so nobody loses a lead.
- **Branch manager:** the branch dashboard as today, plus assign or reassign from the lead page **with a required reason**, recorded with who, when and why. They see the whole branch, including unassigned leads.
- **Unchanged:** members, renewals, receipts, check-in, HR, reports, conversion form (no sold_by change until C2), mark lost, restore, login.

## 6. Rollout sequence (each ⛔ = separate explicit approval)
| # | Phase | Step | Production effect | Approval |
|---|---|---|---|---|
| 1 | Release A closure | **DONE**: final report 16 Nov 21:00 UTC, verdict PASS | none | done |
| 2 | B migration approval | Present the exact SQL (section 3: file + SHA-256), the affected objects, the pre-flight results and the rollback; nothing executed | none | ⛔ #2 (approve the migration) |
| 3 | Production migration | Pre-flight (read-only): drift fingerprint (**40 migrations**, latest `20261115203053 website_trial_lead`; Release A policies and trigger md5 unchanged), unassigned leads count (website leads arrive unassigned, see section 12), P8, P7, no long locks. Then `apply_migration` = `set local lock_timeout '5s'; set local statement_timeout '30s';` + the file. Then verify: catalog fingerprint = tested Release B; lead / follow-up rows byte-identical; P8 / P7; logs 15 min. The current app (`527f705`) keeps working on the B database. | DB schema + leads policies | executed under ⛔ #2 |
| 4 | Deployment preparation | Owner provides deployment access (section 11, prerequisite P1); clean checkout of `b095133` with **no** local env files; `pnpm install`, `next build` locally once more | none | ⛔ #3 (approve the access method) |
| 5 | Application deployment | `vercel deploy --prod --skip-domain` from that checkout → a staged Production deployment, READY, **no domain**. A failed build changes nothing. | a new deployment exists; the domain is unchanged | ⛔ #4 |
| 6 | Read-only smoke tests | On the staged deployment's own URL (Vercel Authentication): `/login` and `/sales` load; signed-in **read-only** checks by the owner (worklist visible, history visible, no data entered); runtime errors = 0; plus the read-only SQL persona checks of section 7 | none (no data written) | — |
| 7 | Official domain promotion | `vercel promote <staged deployment>` → `app.9throundegypt.com` serves B. No rebuild. | live for staff | ⛔ #5 |
| 8 | Post-release monitoring & rollback | Edge / postgres logs, runtime errors, P8 / P7 at +30 min, same day, next working day; staff acceptance (section 8). Rollback per section 9 if needed (app first, then database), each with its own approval. | — | ⛔ per rollback action |
| 9 | Close B | Then C1 review, then C2 | — | owner |

**Timing:** steps 3 → 7 fit in one quiet window (about 30–45 minutes). Step 3 may also be done on its own earlier, because the current app is compatible with the B database.

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
**App:** Vercel Instant Rollback (`vercel rollback dpl_EEW7a5XUBNkho7MXSuEAKvt4jKzV` or the dashboard) to `2f88b75` (Release A + button fix). **Do not use `dpl_BwV81…` (`527f705`): it has the duplicate-save defect.** Hobby plan: Instant Rollback reaches the previous Production deployment only, which is `dpl_EEW7…` once B is promoted. Per Vercel docs, a rollback pauses auto-assignment of Production domains until the next `vercel promote`. It takes seconds, and the old frontend works on the B database (section 3).

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

## 11. Vercel deployment findings (2026-11-15, documentation + actual project configuration)
| Question | Finding | Status |
|---|---|---|
| Root Directory of the project | `apps/web`: the RC1 build log installs from `../..` and `docs/08-deployment-plan.md` says the same | **verified** (build log) |
| Does `git.deploymentEnabled` stop Git-integration builds of this branch? | Yes: 0 deployments after the push of `fc3aa70` (checked 45 s, 3 min and 1.5 h later) | **verified** |
| Does `git.deploymentEnabled` affect API- or CLI-created deployments? | The docs describe it only for Git-triggered branch deployments (and deploy hooks), and say nothing about the REST API or the CLI. The CLI uploads local files, with no Git trigger involved. | **not documented → assumption.** The CLI method does not rely on it. |
| Can a REST API deployment use commit `fc3aa70`? | The create-deployment API accepts `gitSource {org, repo, ref, sha}` | documented; **not tested** |
| Production or Preview? | API: `target: "production"` makes a Production deployment. CLI: `--prod`. | documented |
| Build without changing shared variables? | A Production target uses the existing Production variables; nothing is added or edited | documented |
| Can the official domain stay untouched? | **CLI:** `--skip-domain` disables domain promotion and overrides the "Auto-assign Custom Production Domains" setting. **API:** the schema available here has no equivalent field, so an API Production deployment would be aliased to `app.9throundegypt.com` on success, unless the project's auto-assign setting is off (that setting cannot be read with the tools available). | CLI **documented**. API: **unsafe / unproven → not recommended** |
| Failed build | A deployment that does not reach READY is never aliased; Production keeps serving the current deployment | documented (standard behaviour); observed: Production unchanged by every failed or preview build so far |
| Test before promotion | The staged deployment has its own `*.vercel.app` URL behind Vercel Authentication (`ssoProtection: all_except_custom_domains`) | project setting **verified**; staged behaviour documented |
| Promotion | `vercel promote` / `POST /v10/projects/{id}/promote/{deploymentId}`: no rebuild | documented |
| Rollback | `dpl_EEW7…` (`2f88b75`) is the current Production deployment and a rollback candidate (2026-11-17) | **verified** (API listing) |
| Preserves project / domain configuration | `--skip-domain` and `promote` change only which deployment the domain points to; no project setting is edited | documented |

**Prerequisite P1 (deployment access):** the Vercel CLI here needs a Vercel access token. Options:
- (a) the owner runs the two CLI commands on their own computer from a clean checkout;
- (b) the owner provides a token through the session's secure credential form for host `api.vercel.com`. It is injected by the proxy and never shown in chat, and should be revoked afterwards.

Each option is approved separately (⛔ #3).

**Not recommended:** an API Production deployment through the MCP tool, because the domain is not provably kept, and a Preview of any kind (it runs on Production credentials).

## 12. Website form (`submit_website_lead`, migration `20261115203053`) — compatibility with B (read-only review, 2026-11-17)
| Check | Finding |
|---|---|
| Insert rule `trg_enforce_lead_insert_rules` | **No conflict.** `submit_website_lead` is SECURITY DEFINER owned by `postgres`; the trigger is SECURITY INVOKER and returns immediately when `current_user = 'postgres'`. The form's insert is never refused or rewritten. |
| History `record_lead_assignment` | Website leads are inserted with `assigned_to = NULL` → no history row (by design). |
| **Visibility (behaviour change)** | Release A lets sales employees see and claim unassigned leads of their branch. **Under B only the branch manager / super admin see unassigned leads**; an employee sees a website lead only after a manager assigns it with `assign_leads` (reason required). Managers must check the unassigned list daily, otherwise website leads wait unseen by employees. |
| **Decision (owner, 2026-11-17)** | **Option A, temporary:** the branch manager reviews and assigns website leads daily. No code or database change. |
| Branch | The form puts every lead in the first branch by id (Production has one branch, "Main Branch"). Revisit if a second branch is added. |
| Production data today | 0 website leads, 0 unassigned leads (247 leads, all assigned). |
| Not yet tested | A website insert on the local B stack (`select submit_website_lead(...)` as `anon`). Add to the step 3 pre-flight; read-only on Production is not possible because the function writes. |
