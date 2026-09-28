-- THE NINTH race system — 5/5: rulebook seed (9 stations × 3 categories).
--
-- Seeds the TEMPLATES only. A migration cannot know which branch/date a real
-- event belongs to, so no event is created here; race_create_event() copies
-- these 3 + 9 + 27 rows into each new event (and refuses to create an event
-- if the copy is not exactly 3 / 9 / 27).
--
-- Source: the THE NINTH rulebook (brief §11) + approved decisions:
--   D-10  the 2-break limit applies ONLY to the Masters Wall Squat Hold;
--   F-4   S06 penalty cancels the last completed lap, a 0-lap penalty
--         cancels nothing, laps never go negative;
--   S07   barrier mechanics are NOT finalized — stored as configurable text,
--         no mechanics invented.
-- All nine stations are higher-is-better.

insert into race_category_templates (code, name, min_age, default_pushup_style, sort_order) values
  ('MEN',     'Men',         null, 'STANDARD', 1),
  ('WOMEN',   'Women',       null, 'KNEE',     2),
  ('MASTERS', 'Masters 40+', 40,   'KNEE',     3);

insert into race_station_templates (number, code, name, has_technique, requires_ocr) values
  (1, 'SQUAT',            'Squat',               false, false),
  (2, 'PUSH_UP',          'Push-Up',             false, false),
  (3, 'SLED_PUSH',        'Sled Push',           false, false),
  (4, 'JAB_CROSS',        'Jab + Cross',         true,  false),
  (5, 'BOX_JUMP',         'Box Jump',            false, false),
  (6, 'DB_CARRY',         'Dumbbell Carry',      false, false),
  (7, 'FRONT_KICK',       'Front Kick',          true,  false),
  (8, 'BURPEE_SPEEDBALL', 'Burpee + Speed Ball', false, false),
  (9, 'ROW',              'Rowing',              false, true);

insert into race_station_rule_templates (station_number, category_code, scoring_type, movement, equipment, rule) values
  -- S01 SQUAT — Men/Women: chair-depth barbell squat reps, no break rule.
  --             Masters: wall squat hold, max 2 breaks, 3rd exit ends the hold (no DQ).
  (1, 'MEN',     'REPS',    'Barbell Squat',   '{"load_kg": 20, "depth_standard": "chair"}',
                                                '{"valid_rep": "reach chair depth and return to full extension", "max_breaks": null}'),
  (1, 'WOMEN',   'REPS',    'Barbell Squat',   '{"load_kg": 5, "depth_standard": "chair"}',
                                                '{"valid_rep": "reach chair depth and return to full extension", "max_breaks": null}'),
  (1, 'MASTERS', 'HOLD_MS', 'Wall Squat Hold', '{"load": "bodyweight", "position_standard": "wall_mark"}',
                                                '{"max_breaks": 2, "third_exit_ends_hold": true, "disqualify_on_third_exit": false, "score": "accumulated_valid_hold_ms"}'),

  -- S02 PUSH-UP — style chosen before the station, locked at station start; knee = 3 reps : 1 score.
  (2, 'MEN',     'CONVERTED_REPS', 'Push-Up', '{}', '{"default_style": "STANDARD", "any_athlete_may_choose_knee": true, "knee_ratio": 3, "count_partial_groups": false, "style_locked_at_station_start": true}'),
  (2, 'WOMEN',   'CONVERTED_REPS', 'Push-Up', '{}', '{"default_style": "KNEE",     "any_athlete_may_choose_knee": true, "knee_ratio": 3, "count_partial_groups": false, "style_locked_at_station_start": true}'),
  (2, 'MASTERS', 'CONVERTED_REPS', 'Push-Up', '{}', '{"default_style": "KNEE",     "any_athlete_may_choose_knee": true, "knee_ratio": 3, "count_partial_groups": false, "style_locked_at_station_start": true}'),

  -- S03 SLED PUSH — completed 10 m laps only.
  (3, 'MEN',     'LAPS', 'Sled Push', '{"load_kg": 100, "lap_m": 10}', '{"count_incomplete_lap": false}'),
  (3, 'WOMEN',   'LAPS', 'Sled Push', '{"load_kg": 60,  "lap_m": 10}', '{"count_incomplete_lap": false}'),
  (3, 'MASTERS', 'LAPS', 'Sled Push', '{"load_kg": 80,  "lap_m": 10}', '{"count_incomplete_lap": false}'),

  -- S04 JAB + CROSS — both punches must touch; technique /10 is tie-break #1 only.
  (4, 'MEN',     'REPS', 'Jab + Cross', '{}', '{"both_punches_must_touch": true, "technique_max": 10, "technique_tiebreak_order": 1}'),
  (4, 'WOMEN',   'REPS', 'Jab + Cross', '{}', '{"both_punches_must_touch": true, "technique_max": 10, "technique_tiebreak_order": 1}'),
  (4, 'MASTERS', 'REPS', 'Jab + Cross', '{}', '{"both_punches_must_touch": true, "technique_max": 10, "technique_tiebreak_order": 1}'),

  -- S05 BOX JUMP
  (5, 'MEN',     'REPS', 'Box Jump', '{"box_height_cm": 50}', '{"valid_rep": "both feet on top, return fully to ground, cross to other side"}'),
  (5, 'WOMEN',   'REPS', 'Box Jump', '{"box_height_cm": 40}', '{"valid_rep": "both feet on top, return fully to ground, cross to other side"}'),
  (5, 'MASTERS', 'REPS', 'Box Jump', '{"box_height_cm": 40}', '{"valid_rep": "both feet on top, return fully to ground, cross to other side"}'),

  -- S06 DUMBBELL CARRY — 2 dumbbells, unlimited breaks, throw = cancel last completed lap (F-4).
  (6, 'MEN',     'LAPS', 'Dumbbell Carry', '{"dumbbells_kg": [24, 24], "lap_m": 10}', '{"breaks": "unlimited", "penalty": "CANCEL_LAST_COMPLETED_LAP", "zero_lap_penalty": "NO_EFFECT", "min_official_laps": 0}'),
  (6, 'WOMEN',   'LAPS', 'Dumbbell Carry', '{"dumbbells_kg": [16, 16], "lap_m": 10}', '{"breaks": "unlimited", "penalty": "CANCEL_LAST_COMPLETED_LAP", "zero_lap_penalty": "NO_EFFECT", "min_official_laps": 0}'),
  (6, 'MASTERS', 'LAPS', 'Dumbbell Carry', '{"dumbbells_kg": [20, 20], "lap_m": 10}', '{"breaks": "unlimited", "penalty": "CANCEL_LAST_COMPLETED_LAP", "zero_lap_penalty": "NO_EFFECT", "min_official_laps": 0}'),

  -- S07 FRONT KICK — alternating legs, target touch; barrier rule NOT finalized (configurable text only).
  (7, 'MEN',     'REPS', 'Front Kick', '{}', '{"alternating_legs": true, "target_touch_required": true, "barrier_rule_text": null, "barrier_rule_final": false, "technique_max": 10, "technique_tiebreak_order": 2}'),
  (7, 'WOMEN',   'REPS', 'Front Kick', '{}', '{"alternating_legs": true, "target_touch_required": true, "barrier_rule_text": null, "barrier_rule_final": false, "technique_max": 10, "technique_tiebreak_order": 2}'),
  (7, 'MASTERS', 'REPS', 'Front Kick', '{}', '{"alternating_legs": true, "target_touch_required": true, "barrier_rule_text": null, "barrier_rule_final": false, "technique_max": 10, "technique_tiebreak_order": 2}'),

  -- S08 BURPEE + SPEED BALL — 1 burpee (full floor touch) + 2 speed-ball touches; no extra jump requirement.
  (8, 'MEN',     'REPS', 'Burpee + Speed Ball', '{"speed_ball": "fixed_height"}', '{"burpees_per_cycle": 1, "speedball_touches_per_cycle": 2, "floor_touch_required": true, "extra_jump_required": false}'),
  (8, 'WOMEN',   'REPS', 'Burpee + Speed Ball', '{"speed_ball": "fixed_height"}', '{"burpees_per_cycle": 1, "speedball_touches_per_cycle": 2, "floor_touch_required": true, "extra_jump_required": false}'),
  (8, 'MASTERS', 'REPS', 'Burpee + Speed Ball', '{"speed_ball": "fixed_height"}', '{"burpees_per_cycle": 1, "speedball_touches_per_cycle": 2, "floor_touch_required": true, "extra_jump_required": false}'),

  -- S09 ROWING — final distance from photographed display, judge-confirmed OCR; photo retained.
  (9, 'MEN',     'DISTANCE_M', 'Rowing', '{"damper": 5}', '{"evidence": "photo", "ocr_assist": true, "judge_confirmation_required": true, "retain_original_image": true}'),
  (9, 'WOMEN',   'DISTANCE_M', 'Rowing', '{"damper": 4}', '{"evidence": "photo", "ocr_assist": true, "judge_confirmation_required": true, "retain_original_image": true}'),
  (9, 'MASTERS', 'DISTANCE_M', 'Rowing', '{"damper": 4}', '{"evidence": "photo", "ocr_assist": true, "judge_confirmation_required": true, "retain_original_image": true}');
