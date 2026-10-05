# Phase 9 — Results & Rankings — report

Baseline: the approved final architecture checkpoint. THE NINTH stays isolated from the gym system; no Supabase project was created, connected, configured or pushed to; no credentials were requested or committed. `apps/race` stays in the monorepo Turbo build. Rowing OCR was not started.

## Rules (all previously locked: D-6, D-7, F-2, F-5 — nothing new was invented)
* Station score = the derived `official_score` (higher is better at all 9 stations).
* Station placement per station × category: standard competition ranking (1, 2, 2, 4).
* Overall = sum of the 9 placements, lowest wins. Tie-break: Station 04 technique → Station 07 technique → their sum → the tie is kept (shared place). Missing technique ranks after any athlete who has one.
* Only FINISHED athletes with a result at every station are ranked. DNS, DNF and withdrawn are never ranked; they are listed as such.
* **Two points I filled in (approved):** live standings are PROVISIONAL; a correction creates a new snapshot version, never an edit.
* Note: after S04 and S07 are equal, the technique **sum** is equal too, so that rulebook step can never separate two athletes; it is implemented as written.

## Delivered (migration 14, `20260930000003_race_results_rankings.sql`)
| Function | Who | What |
|---|---|---|
| `race_leaderboard(event, category?)` | **public** | Read-only. OFFICIAL → latest official snapshot; LIVE/FINISHED → PROVISIONAL computed from stored results. Race number + "First L." only. Never advances the engine, never writes. |
| `race_compute_rankings(event, category?, official?)` | control (provisional) / Event Manager (official) | Versioned append-only snapshot in `race_rankings`. Idempotent: identical content writes nothing. Once official, only the Event Manager can write and every snapshot stays official. |
| `race_publish_results(event)` | Event Manager | Needs event FINISHED and every category ready; writes official snapshots and sets `RESULTS_OFFICIAL` atomically. Idempotent. |
| `race_correct_station_result(result, field, value, reason)` | Event Manager | `official_score` / `technique_score` of a locked result. Reason mandatory; ledger row (`race_result_corrections`), audit, status CORRECTED; if already official, a new official snapshot version in the same transaction. Archived events are frozen. |
| `race_athlete_results(event, race number)` | control | The athlete's nine results with ids, for the corrections screen. |

"Ready for official" = nobody still racing, nothing under Master review, every result locked/corrected, every result scored. The blockers are named in the refusal and on the desk.

`race_recompute_result` now leaves a CORRECTED result alone, so a late re-derivation can never overwrite a correction.

## App
* **Public:** `/race/e/[slug]/results` — category tabs, shared places shown as `T2`, points, nine station placements, "still racing", DNS/DNF list, PROVISIONAL / OFFICIAL badge, 5 s refresh.
* **Staff:** `/race/control/[slug]/results` — blockers, two-step PUBLISH OFFICIAL RESULTS, corrections (race number → nine results → edit score/technique with a mandatory reason). "Results" added to the staff nav.
* Package: `domain/ranking`, results repository + use cases (client-side validation: reason, non-negative, technique 0–10 in 0.1 steps, race-number normalisation).

## Tests
| Layer | Result |
|---|---|
| SQL harness (23_rankings.sql + all earlier suites, concurrency, restore) | **1,031 assertions + all concurrency checks**, exit 0 |
| Independent oracle | ranks and totals for MEN and WOMEN equal an O(n²) "1 + number strictly better" computation (no window functions) on data with many ties |
| Hand-built tie-break cases | S04 first, S07 second, kept shared rank (4,4), missing technique last, a worse total never rescued by technique, station tie 1,1,1,1,1,1,7 |
| Eligibility | 37 finished ranked; DNF and 12 DNS absent but listed |
| Snapshots | v1 provisional → unchanged recompute writes nothing → changed score gives v2, v1 untouched; append-only; stamped with who |
| Blockers | unscored result and result under review both block publish, name the blocker, and leak nothing (rolled back) |
| Publish / corrections / permissions | Event Manager only for official + corrections; Master Control provisional only; judge, reception, stranger, anon refused; correction ledger chain; archived frozen |
| Privacy | no id, phone, e-mail, surname in the leaderboard; "First L." incl. Arabic names; 25 reads change nothing |
| **Concurrency (parallel sessions)** | 10 simultaneous computes → 1 version; 8 simultaneous publishes → 1 publication; 8 simultaneous corrections of one result → 8 ledger rows in an unbroken old→new chain, final value = last entry, snapshot = live ranking |
| Negative control | removing the snapshot lock → the 10-session test failed (16 errors); lock restored |
| Package unit tests | **202 pass** (7 new) |
| Browser (mocked Supabase, real UI) | **75/75** (10 new), run twice |
| `pnpm lint` / `typecheck` / `test`, `check-isolation.sh` | pass |

## Screenshots
`docs/race/screenshots/phase-9/`: provisional leaderboard (mobile), results desk blocked, published, official leaderboard (mobile), correction.

## Bugs found while building (fixed)
1. A correction could have been overwritten by a later re-derivation of the same result → `race_recompute_result` skips CORRECTED results (tested).
2. Test-only: three wrong expectations of my own (global instead of per-event snapshot counts; a hand-built winner that changed after a later edit; a "latest version = 10" assumption — versions are written only when the standing changes).

## Noted, not hidden
* **One unexplained failure of an existing assertion** (`16_simulation`: pause race times rounded to 10 s) appeared once during development and did not repeat in four later complete runs. I could not reproduce it. The assertion keeps its exact tolerance but now prints the actual values on failure so a recurrence is diagnosable.
* The public leaderboard does not advance the engine (a public viewer must not trigger writes); while the race runs it can lag until any staff device or screen ticks, normally ≤ 1 s.
* Rowing (Station 09) has no score until OCR exists; until then an unscored rowing result correctly blocks OFFICIAL — publishing before the OCR phase requires entering those scores through a correction (Event Manager) or building the OCR phase first.
* Not applied to any hosted Supabase project.
