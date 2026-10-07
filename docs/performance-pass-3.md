# Performance pass 3

Requires manual Chrome verification.

The real Chrome baseline remains the user's **36–40 FPS**. No new real-Chrome capture has been supplied, so 60 FPS has not been established. No gameplay features were added.

## Diagnosis and evidence

**Provisional classification: GPU / render limited is the leading candidate; CPU versus GPU remains unconfirmed on the user's Chrome session.** Architecture inspection found excessive submitted scene content: the Great Hall normally enabled all four adjacent rooms as well as itself, and distant boss/queen geometry did not consistently inherit room visibility. The collision system already used cached numeric AABBs and a spatial grid; it was not rebuilding mesh bounds during movement. Its remaining overreach was accepting colliders from every adjacent room in nearby grid cells.

There was also a measurement error: the timer labeled UI CPU extended across `renderer.render()`, double-counting rendering as UI work. That is corrected. Renderer submission remains CPU wall time, explicitly **not GPU time**. The matrix is needed to distinguish resolution/light/shadow pressure from draw submission and other CPU work. Sequential tests can be affected by changing camera views, combat states, browser load and temperature; they do not prove causality perfectly.

## Before / after

The rendering rows below compare an earlier recorded preview Great Hall starting view with the post-change Great Hall starting view, at DPR 1. These are secondary checks of reduced scene work, **not Chrome FPS measurements or performance acceptance**. Views and animation frames are not bit-identical. Mesh counts mean hierarchy-visible mesh nodes, not frustum-visible triangles; an instanced node can draw several objects.

| Metric | Before | After | Scope |
| --- | ---: | ---: | --- |
| Draw calls | 194 | 102 | Preview Great Hall observation |
| Triangles | 22,711 | 12,873 | Same observation; includes actors |
| Visible mesh nodes | about 282 | 104 | Same observation |
| Visible rooms | 5 | 1 normally; at most 2 near a connector | Code and F3 |
| Rooms running enemy/boss gameplay | 1 | 1 | Already mostly gated; kept gated |
| Rooms eligible for fragment animation | up to 5 near Great Hall | 1 | Code inspection |
| Collision checks at Great Hall spawn | 30 | 18 | Three passes; static audit and F3 |
| Raycasts/frame | 0 | 0 | Source inspection |
| Active lights | 3 | 3 | Hemisphere + directional + current-room point light |
| Shadow lights | 1 | 1 | Directional only; no point-light shadows |
| Static room mesh nodes, all six rooms | 145 | 62 | Structural audit, includes hidden crown |
| Static room triangles, all six rooms | 3,362 | 3,362 | Geometry retained; batching changes submissions |
| Great Hall static geometry resources | 22 | 4 | Structural audit |
| Great Hall eligible climb surfaces | 6 | 2 | Current-room surfaces only |

The before/after structural inventories are `performance-before.json` and `performance-after.json`. They exclude actors and connector groups and are not rendered frame counters. The audit uses each room's spawn; actual collision checks vary with position. Controller regression scenarios reached 18–57 checks per frame, all bounded.

## Changes

- `src/main.js`: current room plus one nearby doorway preview room, with only current-room connectors. Identity parent groups cull remote actors, fragments and dragon effects without overwriting their lifecycle visibility or progression. Fragment updates and pickup checks use cached per-room lists. Throne checks are room-gated; crown bursts expire or stop when leaving their room. Corrected CPU timer boundaries and duplicate interaction counts, reused capture statistics, added visible/updating room counts, and changed FPS colors to 60+/40–59/below 40. Report completion releases pointer lock and pauses ordinary gameplay until Close. Benchmark settings are restored after completion/cancellation.
- `src/TestLevel.js`: current-room and connector collision filtering; cached climb lists; shared scaled unit boxes and floor planes, shared barrels/tunnel parts/crown spikes; static sibling instancing by geometry/material/shadow/prop status. Climb targets and the reparented crown retain their identities. Static environment local/world matrix computation is disabled after initial world transforms are established. No bounds computation occurs in the movement loop.
- `src/RoomManager.js`: only the current room's tunnel is checked.
- `src/CombatTargetRegistry.js`: room-indexed lock-on candidates; inactive/non-hostile targets filtered before distance work. The locked target is validated directly.
- `src/PlayerController.js`: reuses animation parameter storage instead of creating an object each frame.
- `src/CrownFragment.js`: five identical jewel materials now share one material. Existing stone, wood, dark stone, trim, metal, red and tunnel materials were already shared; distinct floor colors and animated shard materials remain distinct.
- `src/PerformanceCapture.js`: running sum/count/max aggregates replace per-frame arrays for every CPU and scene metric. Only frame intervals are retained for percentiles. Progress updates are throttled internally. K still records the full 15-second FPS/frame/CPU/renderer/scene/browser/long-task report.
- `src/BenchmarkMatrix.js`: optional development command B, eight sequential configurations, 750 ms settling plus about 5 seconds of recording each. Restores the starting configuration before each variant and on exit. Cancels on B, room change, death, hidden tab, resize or interrupted gameplay. No automatic movement, combat, teleportation or additional animation loop.
- `src/style.css`: removed modal backdrop blur/brightness, removed the hidden title from display, hides inactive damage overlay from painting. Bronze framing/material appearance remains. FPS/F3 refresh at 4 Hz; health/crown/boss text remains change-driven; active climb/lock indicators still track the scene.
- `scripts/performance-scene-audit.mjs`, `scripts/performance-validation.mjs`, and these documents: repeatable structural and regression checks.

## Rendering and effects audit

Default DPR stays **1.0**, with diagnostic .75/1/1.25/1.5 options. No permanent resolution reduction. Antialiasing stays enabled. Renderer uses opaque output, default no tone mapping, no preserveDrawingBuffer, no logarithmic depth buffer. No unrelated quality reduction was made.

One 1024 directional shadow map remains. Existing shadow caching is retained, with refresh when room visibility or shadow settings change. Small environment props are already filtered from casting by size; batching preserves caster flags. Dynamic shadow caching is a pre-existing visual limitation: this pass does not introduce expensive every-frame shadow refresh. PointLights do not cast shadows, and distant room lights are off.

Crown particles use fixed arrays and one reusable geometry, with a .72-second lifetime. Boss sparks and dragon telegraphs are created once and reused; their updates are gated by the encounter/current room. Crown collection animation still completes before hiding its shard. Far fragment animations are paused rather than destroyed. No new profiling dependency was installed.

Exactly **one** `requestAnimationFrame` call exists in application source, inside `frame()` in `src/main.js`. No extra UI, effect, cinematic or benchmark RAF/interval loop. Simulation delta remains capped at .04 seconds; measured frame intervals remain unclamped so captures show stalls honestly.

## Validation

- `npm run build`: passed. Existing large main-bundle warning remains; this concerns download/startup size, not proof of steady-state frame cost.
- `node scripts/performance-validation.mjs`: passed current-room collider uniqueness, both sides of all connectors, preserved climb identities, instanced bounds, static matrices and movable crown. Capture aggregate calculations, all eight independent benchmark modes and setting restoration/cancellation passed.
- The same script ran 600 real controller steps for each of idle, W, W+A, camera rotation with movement, jumping with movement, dodging with movement and repeated Aura Walk toggling. Positions stayed finite and collision checks stayed below 100. These are deterministic logic regressions, **not browser throughput tests**. Only the browser-only GLB fetch is skipped; the procedural rig and controller logic run.
- Preview: title and Controls rendered; Begin hid the title and started gameplay; F3 worked; keyboard movement inputs, jump (AIRBORNE), dodge (DODGE) and Aura Walk were exercised. K completed a 15-second report. B completed all eight tests, and a separate room-change test cancelled and restored settings. No warnings/errors appeared in the captured browser console during these checks.
- Preview pointer lock returned false. Sustained physical WASD/chords and mouse camera control require manual Chrome testing. Full combat, traversal of every doorway, and an active dragon battle still need real-browser validation.
- Preview renderer memory stabilized in the sampled room (one texture, geometry counts reaching a fixed warmed set). Visiting a new room or displaying a weapon pose can upload an existing geometry for the first time. This is different from continuously allocating geometry; long traversal memory stability still needs a Chrome capture.

## Run in actual Chrome

1. Start the development server with `npm run dev -- --host 127.0.0.1` if it is not already running. Open the printed localhost URL in your normal Chrome window (currently port 5173).
2. Reload, click **BEGIN**, and confirm mouse capture and WASD work. Keep the same window size as your 36–40 FPS baseline. Default DPR is 1.0; leave diagnostic quality settings normal.
3. Pick a repeatable view in the current room. Press **B** once. Stay in that room and keep the tab foreground for about **46 seconds**. The game remains live; the test does not move you or disable enemies. Death, travel or other interruptions cancel rather than produce a misleading complete report.
4. Tests run: current normal, shadows off, local lights off, DPR .75, current-room-only, UI off, particles off, decorative props off. Each compares one variable with the starting configuration. Current-room-only may match normal when already away from doors; particles-off may match normal when no effect is active.
5. At completion, use **COPY PERFORMANCE REPORT** and paste the report back. Settings restore automatically. **B** also cancels an active matrix.
6. Use **K** for a separate 15-second sample of ordinary movement/combat; repeat in a safe traversal view, an active boss encounter and the active dragon encounter. **F3** shows room/check/render counters. Compare normal captures, not only the best diagnostic mode.

Remaining concerns: actual Chrome CPU/GPU limitation is unresolved; doorway preview transitions and cached shadows need visual review; the detailed animated player/active bosses still contribute many individual draw calls; active dragon cost has not been measured on the user's machine. Target performance remains unconfirmed.
