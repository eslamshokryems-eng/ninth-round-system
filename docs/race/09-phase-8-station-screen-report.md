# Phase 8 — Station Screen — report

Baseline: the approved final architecture checkpoint. THE NINTH stays fully isolated from the gym system; no Supabase project was created, connected, configured or pushed to; no credentials were requested or committed. `apps/race` stays in the monorepo Turbo build. Results/Rankings and Rowing OCR were not started.

## Implementation summary
* **Route:** `/race/station/[slug]/[station]` (e.g. `/race/station/the-ninth-2026/3`). Signed-in station-screen account only; signed out shows just a "sign in this screen" prompt.
* **Display-only.** 1080 × 1920 portrait stage (9:16) scaled to any portrait TV, black/red/white, no buttons/inputs/links/pointer. No judge or admin control exists on the page, and the only server call it makes is one read RPC.
* **DB (migration 13, `20260930000002_race_station_screen.sql`):** `race_station_screen(event, station)` returns only what the screen needs: event name, station number/name, clock facts, timing constants, the current athlete (**race number + category only**, window timestamps, derived score), the next bound athlete, `planned_next_ms`, `served_any`. No names, phones, ids or registration data. Callable by STATION_SCREEN / JUDGE of that station or control roles; closed to `anon`. `race_clock` is added to the `supabase_realtime` publication (nudges only).
* **Least privilege tightened:** the STATION_SCREEN role can no longer read result rows, registrations or start slots directly (policies recreated; the JUDGE role keeps what Phase 3/7 tests require).
* **TS:** `packages/race/domain/station-screen.ts` (pure state machine), use case, repository, mapper; app hook `use-station-screen.ts`; page + CSS.

## State machine — `deriveScreenState(data, raceMs)`
Pure function; no device state.

| Priority | State | When | Shows |
|---|---|---|---|
| 1 | not started | clock not started | WAITING · RACE NOT STARTED |
| 2 | FINISHED | event finished | RACE FINISHED |
| 3 | **PAUSED** | clock paused | RACE PAUSED · PLEASE WAIT FOR OFFICIAL |
| 4 | **WORK** | `start ≤ t < start+3:00` | WORK, athlete code, category, remaining time, live score, "next athlete" strip |
| 5 | **TRANSITION** | `start+3:00 ≤ t < start+3:30` | TIME, frozen final score, MOVE TO STATION nn (or FINISHED at Station 09), 30 s countdown, next-athlete strip |
| 6 | **GET READY** | next athlete starts in ≤ 10 s | code, GET READY, 10 s countdown |
| 7 | **NEXT ATHLETE** | station free, someone scheduled | next code + countdown (or "starts in" when only the slot time is known) / STATION FREE |
| 8 | **WAITING** | otherwise | station, next athlete code, countdown |

TRANSITION has priority over the next athlete's GET READY (shown as the strip). Skipped athlete, empty slot, DNS and NOT_REACHED results never appear (the RPC does not return them); a DNF athlete is dropped. Nobody moves up: the gap is shown honestly. Unbound next slots expose only a planned time — the code appears when the slot is bound (60 s ahead).

## Data flow
`race_station_screen` (settles the race through the idempotent catch-up, then reads) → repository → `StationScreenData` → hook keeps last answer + clock-offset estimate → `raceMsNow()` extrapolates race time locally (100 ms render tick) → `deriveScreenState` → page. Poll 1 s; realtime `race_clock` change, `online` and tab-visible events trigger an immediate re-ask. There is **no second race clock**: the browser timer is display-only extrapolation of the server's race time.

## Reconnect behavior
The screen stores nothing that could go stale. After any outage the first answer yields the state directly:
* offline < 10 s: keeps counting locally, no banner; ≥ 10 s: red RECONNECTING banner (state still extrapolated).
* On the first answer the banner clears and the state is recomputed from authoritative timestamps: WORK → TRANSITION across 3:00 with the correct remaining seconds and the score frozen at 3:00; a pause started during the outage shows PAUSED; after resume the frozen race time continues — no time added, no restart.
* The RPC creates **no race events**; a screen read changes nothing (SQL footprint test: 50 reads, identical digest). Reconnecting only sends `race_station_screen`.

## Tests
| Layer | Result |
|---|---|
| SQL harness (`22_station_screen.sql` + all earlier suites, concurrency, restore) | **964 assertions + all concurrency checks pass**, exit 0 |
| SQL reconnect equivalence | a screen read after a blackout returns the same core payload and the same `race_sim.digest` as an always-ticked event at 8 instants incl. the 3:00 boundary and around pause/resume |
| Package unit tests | **195 pass** (27 new: every state, boundaries 239.999/240.000, GET READY at 10 s, skip/empty/DNS/DNF, pause/resume, reconnect determinism, every 700 ms sweep) |
| Browser (Chromium, mocked Supabase, actual UI) | **65/65** (15 new), run twice for stability |
| `pnpm lint` / `typecheck` (16 tasks) / `test` (9 tasks) / `check-isolation.sh` | pass |

Browser checks: 1080×1920 stage and 9:16 ratio, no interactive elements, WAITING / GET READY / WORK / TRANSITION / NEXT ATHLETE / DNF / EMPTY / PAUSED (+resume), reconnect during WORK, across 3:00, during TRANSITION and PAUSE, the 10 s banner, "reads only" (only `race_get_public_event` + `race_station_screen`), signed-out prompt, scaling to 540×960. Every state is also asserted to fit its stage with no clipped text.

## Screenshots (1080 × 1920)
`docs/race/screenshots/phase-8/`: `17-screen-waiting`, `18-screen-get-ready`, `19-screen-work`, `20-screen-transition`, `21-screen-next-athlete`, `22-screen-paused`, `23-screen-reconnecting`.

## Bugs found and fixed
1. **Screen role could read 15 registration rows** (personal data) through the "registrations visible" policy → policy restricted to ops/JUDGE; slots likewise. First attempt (ops only) broke the Phase-3 judge test and was corrected.
2. A Phase-3 assertion accepted the screen reading its own result rows → tightened to 0 direct rows (documented).
3. `race_result_derived` called unqualified under `search_path=''` → schema-qualified.
4. **TRANSITION layout overflowed** (countdown and next strip pushed off the 1920 px stage) → per-state sizing + an automatic no-clipping check on every state.
5. **PAUSED text clipped horizontally** ("PLEASE WAIT FOR OFFICIAL") → smaller type; the no-clipping check now covers width too.
6. Test-only: three wrong expectations in my own mock/tests (announce timing, score relative to window start, pause remaining) — the state machine was right.

## Notes
* `verify_deployment.sql` now also checks `race_station_screen` is closed to `anon` and that only `race_clock` (never personal data or ledgers) is in the realtime publication.
* Not applied to any hosted Supabase project. Rowing OCR, Results and Rankings remain untouched; Phase 9 not started.
