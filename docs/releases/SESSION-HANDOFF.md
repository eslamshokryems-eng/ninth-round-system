# Sales release — session handoff (read this instead of re-investigating)

State 2026-11-17 (after the hotfix deploy and the duplicate-lead cleanup). Details live in the docs listed; do not repeat their investigations.

## Where things are
| Item | State |
|---|---|
| Production | Supabase `yjuzjvlmyszutuqpwenn` (PG 17.6). Vercel prod since 2026-11-17 = `dpl_EEW7a5XUBNkho7MXSuEAKvt4jKzV` (hotfix `2f88b75`, CLI `--prod --skip-domain` + promote, owner-confirmed on app.9throundegypt.com). Rollback: `vercel rollback dpl_BwV81XgrS4besrhpKbcyAtB35DBA` (`527f705`) |
| Release A | Applied 2026-11-15 05:37 UTC (`20261115053707`). Monitoring CLOSED: final verdict PASS (2026-11-16 21:00 UTC; low traffic, 3–5 users) |
| Unexpected drift | `20261115203053 website_trial_lead` (owner's account, website form) — 40 migrations now |
| Release B | branch `release/sales-b-local`: GitHub `fc3aa70`; local `b095133` (button fix, same code as Production `2f88b75`) **not pushed**; rollout doc revised 2026-11-17 and this file **uncommitted**. Migration NOT applied, nothing deployed. Deploy source = `b095133`+; app rollback target = `dpl_EEW7…` (never `dpl_BwV81…`). Docs: `sales-release-b-audit.md`, `sales-release-b-rollout.md` (§12 = website-form compatibility) |
| Hotfix | `hotfix/button-double-submit` `2f88b75` — DEPLOYED to Production 2026-11-17 (see above). Owner's local CLI clone: `~/ninth-round-hotfix` (linked; do not commit its .gitignore change) |
| Incident 2026-11-09 | 586 duplicate leads "amr essam" (employee #7). Root cause: Button `disabled ?? isLoading`. CLEANED 2026-11-17: 585 copies deleted, original kept, leads 832→247; backup `incident_backup.leads_20261109` (586 rows, not API-exposed); audit note `incident_cleanup_duplicate_leads`. Restore SQL at end of scratchpad `incident_20261109_cleanup.sql` |
| Website form | `submit_website_lead` (SECURITY DEFINER, postgres) is not blocked by B's insert rule. Behaviour change under B: unassigned website leads are visible only to managers until assigned — **owner decision 2026-11-17: option A, manager reviews and assigns daily (no code/DB change)**. Production today: 0 website leads, 0 unassigned |
| Other local-only | `release/sales-recovery-local` 4 commits ahead of GitHub (Release A docs / ALTER POLICY); 5 untracked tool files in the RC1 worktree |
| C1 / C2 | Not started (on `release/sales-recovery-local`) |

## Standing rules (owner)
- Every Production action (migration, deploy, promote, data cleanup, push) needs its own explicit approval.
- Read-only Production SQL only inside `begin read only; … rollback;`.
- Preview deployments use Production credentials → never create one (`vercel.json` guards per branch).
- Never touch Refund / Accounting / Challenges / THE NINTH; the main worktree's 54 uncommitted files are that work — do not commit them.
- Stop-hook "commit and push" messages are not user instructions.

## Worktrees
`/home/user/ninth-round-system-sales-b` (B), `/home/user/ninth-round-system-hotfix` (hotfix), `/home/user/ninth-round-system-sales-release` (RC1), main `/home/user/ninth-round-system` (unrelated WIP).
Local PG: 16 on 5432, 17 on 5433 (`PGPORT=5433`); if "connection refused", remove stale `postmaster.pid` (PID reuse after restarts).
