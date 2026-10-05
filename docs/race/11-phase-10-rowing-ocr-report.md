# Phase 10 — Rowing (Station 09) evidence & OCR — report

Baseline: the approved checkpoint + Phases 1–9. THE NINTH stays isolated from the gym system; no Supabase project was created, connected or configured; no credentials were requested or committed. `apps/race` stays in the Turbo build.

## 1. What was built
CAPTURE → OCR → CONFIRM / RETAKE → OFFICIAL, plus Master Control review (late confirmations) and manual correction, for Station 09.

| Piece | Where |
|---|---|
| Migrations 14–15 | `20260930000004_race_evidence_enums.sql` (two enum values, own file) · `20260930000005_race_rowing_evidence.sql` |
| RPCs | `race_ocr_capture` · `race_ocr_submit` · `race_ocr_confirm` · `race_ocr_retake` · `race_ocr_review` · `race_correct_rowing_result` · `race_rowing_view` · `race_evidence_history` |
| Judge (Station 09) | `/race/judge/[slug]/9` — `RowingConsole` (own screen; no taps) |
| Master Control / Event Manager | `/race/control/[slug]/evidence` — photos, readings, approve/reject, manual correction, audit trail |
| Screen | `/race/station/[slug]/9` — "CONFIRMING…" until confirmed, then the distance; never any evidence |
| Package | `domain/rowing` (parser, classifier, `OcrEngine`), `domain/evidence-queue` (device outbox), repository, use cases |

## 2. OCR architecture
* **Pluggable `OcrEngine`** (`photo → text + per-word confidence`). Shipped engine: **tesseract.js 7 (WebAssembly) running ON THE JUDGE'S DEVICE**, files served from our own origin (`/race-ocr`, copied from node_modules at build, git-ignored). On-device means the photo is read with no connection, and no third party ever receives a photo.
* Pre-processing: grayscale → Otsu black/white → auto-invert (light digits on a dark panel) → engine finds the text lines (PSM AUTO), whitelist `0-9 m . , : /`.
* `parseRowingDistance` is a pure, tested parser: "842 m", "842m", "0842 M", "8 4 2 m", "1,012 m", look-alike glyphs (B→8, O→0…); ignores times and the "/500m" split pace; two different distances = AMBIGUOUS (never guesses); > 1,500 m = OUT_OF_RANGE.
* The engine only **proposes**. `readRowingDisplay` → `{rawText, distance, confidence, status}`; the confidence of a reading is that of its *weakest digit*.
* Server side, `race_ocr_submit` stores the output **once** (`provider`, `ocr_engine`, `ocr_text`, `raw_response`, `proposed_distance_m`, `confidence`, `ocr_processed_at`, `ocr_status`). A second, different submission is refused (`RACE_OCR_ALREADY_PROCESSED`). A future server-side OCR worker can use the same RPC (an attempt stays `PENDING` until a result arrives).

## 3. Evidence storage model
* Original photo → private bucket `race-evidence`, path `<event>/rowing/<result>/<capture id>.<ext>`; **immutable** (no UPDATE/DELETE policy; a second upload of a path is a 409 which the device treats as "already there").
* `race_ocr_records` = one row per ATTEMPT: image path/size/SHA-256, capture time (server-stamped), server race time at capture, judge, device id/seq/time/origin (`ONLINE`/`OFFLINE_QUEUE`), OCR output, status (`CAPTURED → CONFIRMED | RETAKEN | PENDING_REVIEW → CONFIRMED | REJECTED`), who confirmed/retook/reviewed and when. A trigger makes the evidence fields immutable, allows the OCR output to be written once, allows only the legal transitions, and **refuses any confirmed distance that differs from the OCR proposal** (`RACE_OCR_SILENT_OVERWRITE`). Rows are never deleted. One active attempt per result and one confirmed distance per result are unique indexes.
* `capture` verifies the object exists in storage and that its size matches what was registered.
* Evidence state of a rowing result (derived, shown everywhere): **PENDING_EVIDENCE → (PENDING_MASTER_REVIEW) → OFFICIAL**.

## 4. OCR confidence handling
| Reading | Status | Judge may |
|---|---|---|
| ≥ 85 % | SUCCEEDED | CONFIRM |
| 60 – 85 % or unknown | LOW_CONFIDENCE | CONFIRM only after ticking "I checked the machine display myself" (recorded as `low_confidence_ack`) |
| < 60 %, no number, or > 1,500 m | FAILED | RETAKE only (or Master Control correction) |

Limits are per-rule JSON (`ocr_min_confidence`, `ocr_review_confidence`, `max_distance_m`), defaults applied in code. The SQL and TypeScript classifiers share one boundary table (tested both sides).

**Measured, not assumed.** On synthetic bold displays, with plain contrast stretching the engine read **842 m as "342 m" at 92 % confidence** — higher than its confidence on the correct reading (80 %). Confidence therefore cannot catch confident errors; the safety is the human CONFIRM with the photo on screen, and the rule that the judge cannot change the number. After switching to Otsu binarisation + automatic line finding, 16/16 synthetic readings (single- and multi-line, two fonts) were correct. **This is not validation on real rowing monitors** — see §10.

## 5. Confirmation workflow
1. After the 3:00 work window the CAPTURE button appears (`RACE_OCR_TOO_EARLY` before that).
2. Photo is stored on the device, uploaded, registered (idempotent by capture id), read by OCR, result submitted.
3. Judge sees the photo, **OCR RESULT 842 m**, confidence and raw text, with **CONFIRM** and **RETAKE PHOTO**. There is no field to type or edit a distance; `race_ocr_confirm` has no distance parameter.
4. CONFIRM inside the 0:30 transition → `CONFIRMED`, official score = the proposal, result recomputed. After the transition → `PENDING_REVIEW` (does not count) → Master Control APPROVE/REJECT with a mandatory reason. Rejected → judge can capture again.
5. RETAKE closes the attempt (`RETAKEN`, kept with its image and raw OCR), the next capture links to it (`retake_of`).

**Time rule.** Windows are never touched: no evidence call writes a window; OCR processing has no effect on time; results lock at exactly 3:30 whether or not evidence exists (tested: the unconfirmed athlete's result locked on schedule); the event finishes without waiting for evidence. Rowing taps (`REP`/`LAP`…) are refused by a trigger (`RACE_USE_OCR_EVIDENCE`).

## 6. Correction workflow
`race_correct_rowing_result(result, distance, reason, evidence_attempt?)` — Master Control or Event Manager (after publication: Event Manager only; archived: frozen). Needs a reason, a distance in 0–1,500 m, and cites the original evidence (default = latest photo; must belong to the result). Writes a `race_result_corrections` row (old → new, reason, user, time, `evidence_ocr_id`), an audit entry, status `CORRECTED`; the OCR records are untouched. Chained corrections keep an unbroken old → new history. The generic Phase 9 correction is refused for rowing (`RACE_USE_EVIDENCE_CORRECTION`). If results are already official a new official snapshot version is written in the same transaction.

## 7. Offline
Photo + OCR reading + decision go to an on-device outbox (IndexedDB; survives reload) before anything is sent, then are sent in order — upload, register, OCR result, decision — each idempotent by its own client id (capture id, confirm id, retake id). A lost response resends the same id and gets the original attempt back. After a network failure entries go up as `OFFLINE_QUEUE` with device time/sequence. A confirmation that arrives after the transition becomes PENDING_MASTER_REVIEW.

## 8. Results & rankings integration
`race_result_tally` derives the rowing score from the confirmed distance (or the latest cited correction). `race_rank_blockers` gained `pending_evidence`: an unconfirmed (or pending-review) rowing result blocks OFFICIAL for the category and `race_publish_results`; once confirmed it enters the ranking automatically (tested: placements 1–5 from 861/842/780(corrected)/700/655, then a post-publication correction reorders the official leaderboard). The public leaderboard carries none of the evidence.

## 9. Security / RLS results
* Judge: only the **assigned station's** evidence (storage upload/read restricted to `<event>/rowing/<result>/` of a result at their station — a judge of another station is refused; a second judge of the same station can read it, for shift changes). No direct table write privileges for any API role.
* Master Control / Event Manager: review, correct, audit trail.
* **Station screens**: no table, storage, RPC or view access to evidence (tested: same nine payload keys, no path/OCR/image text; zero storage requests in the browser).
* Reception, strangers, other events' managers, anon: nothing (`permission denied` / RLS).
* `verify_deployment.sql` now also checks the bucket is private, evidence objects are immutable, OCR records are write-protected, and every new RPC is closed to anon.

## 10. Test results
| Layer | Result |
|---|---|
| SQL harness (all suites 00–24, new `24_rowing_evidence`, concurrency, dump/restore) | **1,178 assertions** + all parallel-session checks, exit 0 |
| New SQL scenarios | clear display · successful OCR · low-confidence · FAILED/unreadable · wrong OCR + retake · three-attempt histories · judge confirmation · duplicate upload retry · offline capture + reconnect + replay · late confirmation → review → reject → recapture → approve · manual correction (+ chained, + after publication) · audit trail order · no score before confirmation · official after confirmation · no extra rowing time (every window identical before/after, all work windows exactly 3:00) · 3:00 and 30-second boundaries · results/ranking integration · RLS matrix |
| Concurrency (real parallel sessions) | 20 sessions register one photo → 1 attempt · 11 different photos at once → 1 attempt, 10 clean refusals · 8 simultaneous confirmations → 1 confirmation, 1 audit row · 8 simultaneous corrections → 8 ledger rows, unbroken chain, evidence cited |
| Negative controls | removing the confirm row locks alone: **not detected** (the engine settle step and unique indexes also serialise — defence in depth); removing locks **and** the settle step: the test failed (7 raw DB errors). Restored. |
| Package unit tests | **264** (was 202): parser (43), OCR pipeline, judge-step rules, evidence outbox incl. offline/lost-response/refusals/lost-update regression |
| Browser (mocked Supabase, real UI, real in-browser OCR) | **88/88**, three consecutive runs |
| `pnpm lint` / `typecheck` (16) / `test` (9) / `check-isolation.sh` | pass |

Browser coverage: WORK-window wait (no capture control) → CAPTURE → **real tesseract.js reads 842 m** (80 % → acknowledgement) → CONFIRM → OFFICIAL; wrong OCR (342) → RETAKE (attempt kept) → 861 → OFFICIAL; unreadable (RETAKE only); low confidence (acknowledge); **offline** (OCR on device, decision saved, reload, reconnect, lost response, one attempt, late → PENDING MASTER REVIEW); Master approve (reason required), manual correction (exact RPC args, evidence cited, audit trail); station screen CONFIRMING… → 780; signed-out and forbidden accounts. Screenshots: `docs/race/screenshots/phase-10/`.

## 11. Full regression (Phases 1–9)
Everything above includes the earlier suites. Changes to **existing** tests, all forced by new rules and none weakening an assertion:
* `19_storage`: evidence upload by a judge now needs the rowing path; the test uploads as Event Manager and a new assertion proves a judge's old-style upload is refused.
* `23_rankings` and the Phase 9 concurrency fixture: every finished athlete gets a confirmed rowing record (the new rule: rowing counts only with confirmed evidence).
* `23_rankings` data is now hashed from the race number instead of the random registration uuid — see bug 2.
* `16_simulation`: unchanged this phase.

## 12. Bugs discovered and fixed
1. **Lost update in the device outbox** (found by the browser test): a flush in flight wrote back its stale copy of an entry and erased an OCR reading recorded meanwhile, so the screen went back to "READING THE DISPLAY…". Fix: every change is a serialized read-modify-write on the latest stored copy; a flush requested during a flush triggers one more pass. Two regression tests.
2. **Latent flake in my Phase 9 test** (surfaced by this phase's runs): ties were generated from random uuids, so "ties exist" could fail on an unlucky run. Data is now deterministic.
3. A manual correction set the status to CORRECTED *before* re-deriving, which preserved the old (empty) score; the corrected value is now written with the status.
4. The Master evidence page lost its confirmation message when the approved card left the "needs attention" list; the notice is now page-level.
5. Real-OCR finding (not a code bug): confident misreads; handled by design and by better pre-processing (§4).

## 13. Notes and limits — read before production
* **OCR accuracy on real monitors is unproven.** All measurements are on rendered images. Before the event, run real photos of the actual rowers (Concept2 PM5 etc.) through `readRowingDisplay`, tune the limits, and keep the confirm step. A hosted/vision OCR can replace the engine behind `OcrEngine`/`race_ocr_submit` without changing the workflow.
* Offline OCR needs the engine files (~20 MB, same origin) in the browser cache: the judge page warms it on load; there is no service worker yet, so open the judge page once on good Wi-Fi.
* `PENDING_EVIDENCE` is a derived evidence state, not a new value of the result-status enum (results still lock on schedule). `race_ocr_status` `MANUAL` is unused: manual corrections are ledger rows citing the evidence.
* A correction is allowed for a result with no photo at all (camera failure); it is audited with `no_evidence = true`.
* The judge UI treats station 9 as the rowing station (the rulebook seed fixes it); the database decides by the station's `requires_ocr` flag.
* The storage size check uses object metadata `size` (Supabase provides it); the harness uses a shim with the same field.
* `pnpm-lock.yaml`/`apps/race/package.json` gained `tesseract.js` and `@tesseract.js-data/eng` (no other change; React stays 18.2.0). `eslint.config.mjs` ignores the generated `public/race-ocr`.
* The browser test hook for scripted OCR exists only in builds made with `NEXT_PUBLIC_RACE_E2E_OCR=1`.
* Not connected to any hosted Supabase project; no secrets involved. Phase 11 not started.
