# Final performance root-cause pass — continuation

2026-10-04. **REQUIRES REAL CHROME VERIFICATION.**

The user's real Chrome baseline is approximately 40 FPS. No valid real Chrome after-result is available. The connected browser is the Codex embedded browser; its user-agent string says Chrome but it is not the user's normal Chrome session. This pass establishes structural improvements and regression coverage, not a confirmed explanation of every millisecond in that 40 FPS result.

## Work preserved at the usage cutoff

The directory has no Git metadata, so saved source and the previous run's measurements were inspected rather than resetting a checkout. Preserved:

- Rigid fallback-player batching within individual animation pivots/sockets: 73 to 50 meshes, without changing triangles or materials. Great Hall starting draw calls 102 to 79.
- `DormantGroup` boundaries for static rooms/connectors, room actors, hidden map helpers and the fallback rig. Invisible room hierarchies now skip world-transform traversal as well as rendering.
- Existing static map instancing, numeric collider grid, current-room actor/interaction filtering, cached shadows and DPR 1.
- J snapshot, optional asynchronous GPU queries, spike/heap capture work, reusable scene inventory, named/removable InputManager blur handler.

The interrupted regression harness was repaired: `beginClimb()` sets state but returns no boolean; the mock finale UI also needed a `querySelector` method. Game logic was not rewritten to satisfy those test assumptions.

## Work completed in this continuation

- Finished frame/system, static batching, material/geometry, light/shadow, listener/loop and allocation audit below.
- Shared identical immutable primitive buffers in EnemyController, ArmoredBeetleBoss, ArmoredRatKnightBoss, FinaleCharacters and DragonBoss. Removed 30 redundant geometry resources. Animated transforms, custom mutable buffers and the production GLB pipeline remain independent.
- Shared the two queen-eye materials and two dragon-wing membrane materials: two fewer material objects, identical settings.
- Corrected spike timestamps to use the measured RAF interval endpoint rather than post-render time. Added the once-per-second heap timeline and visibility/death context to captures. Clarified rendered points versus mesh VFX and opaque output versus actual WebGL context attributes.
- Completed diagnostics tests, controller/scene/animation/game-flow tests, browser report checks and production build.

## Ranked findings

1. **Excess player draw submissions.** 23 rigid meshes were safely removed through batching before the cutoff. This is the largest demonstrated draw-call reduction in this final pass, about 23% of the starting view's calls.
2. **Invisible hierarchy transform traversal.** Three.js still walks invisible children by default. Dormant boundaries eliminate that work. A representative test scene measured 336 to 130 transform-method visits; this is a traversal count, not an FPS benchmark or the full browser scene.
3. **Duplicate procedural buffers/materials.** Sharing removes 30 geometry and 2 material resources. Expected benefit is chiefly resource memory/setup/upload work, with no additional draw-call reduction.
4. **Diagnostic attribution gaps.** Optional GPU timings, spike windows, long-task overlap and heap samples now distinguish submission cost from scheduling/GPU/possible-GC questions. CPU render timing alone cannot establish GPU time.
5. **Defensive listener cleanup.** The saved blur-disposal correction closes a lifecycle hole. A single input manager is used during ordinary gameplay; there is no evidence that this caused the observed FPS regression.

No mesh bounds recomputation, movement-only scene traversal, unbounded collision loop, repeated model creation, repeated RAF startup or raycast storm was found in the current movement path. Draw counts already being below the budget does not prove that real Chrome will reach 60 FPS.

## Before / saved cutoff / final metrics

Great Hall starting view, normal settings, DPR 1, 1894 x 1244 canvas. Before/cutoff figures come from the earlier run; final figures were read from J in this continuation at the matching viewport. Visible mesh counts follow ancestor visibility, not camera-frustum visibility. Geometry resources count distinct scene geometries; uploaded geometries are renderer memory counts and depend on which rooms have been visited.

| Metric | Before final pass | Saved at cutoff | Final continuation |
|---|---:|---:|---:|
| Draw calls | 102 | 79 | 79 |
| Triangles | 12,873 | 12,873 | 12,873 |
| Object3D nodes | 409 | 386 | 386 |
| Meshes total / visible | 314 / 104 | 291 / 81 | 291 / 81 |
| Player meshes / materials | 73 / 15 | 50 / 15 | 50 / 15 |
| Player visible shadow casters | 67 | 44 | 44 |
| Scene materials | 87 | 87 | 85 |
| Scene geometry resources | 143 | 145 | 115 |
| Uploaded geometries / textures | 42 / 1 | 44 / 1 | 40 / 1 |
| SkinnedMesh / InstancedMesh nodes | 0 / 26 | 0 / 26 | 0 / 26 |
| Active / inactive lights | 3 / 5 | 3 / 5 | 3 / 5 |
| Shadow lights | 1 | 1 | 1 |
| Visible shadow casters | 77 | 54 | 54 |
| Rooms total / visible / updating | 6 / 1 / 1 | 6 / 1 / 1 | 6 / 1 / 1 |
| Static colliders | 107 | 107 | 107 |
| Collision checks at spawn / raycasts | 18 / 0 | 18 / 0 | 18 / 0 |
| Explicit RAF chains / scene renders per frame | 1 / 1 | 1 / 1 | 1 / 1 |
| Active particle emitters / rendered points at spawn | 0 / 0 | 0 / 0 | 0 / 0 |
| Canvas / pixel ratio | 1894 x 1244 / 1 | same | same |

Batching initially added two merged geometry resources while eliminating 23 mesh submissions; that tradeoff was preserved. The independent builder inventory excludes main.js debug objects/lights and therefore has different totals: **74 to 72 materials, 134 to 104 geometries, 273 meshes unchanged**. See `root-cause-resources-before-continuation.json` and `root-cause-resource-audit.json`. Two small cross-builder primitive duplicates remain (unit box and a player/NPC sphere); unifying independent ownership for these was not justified.

## Complete per-frame system audit

| System | Current execution and bounded work | Finding/action |
|---|---|---|
| Animation driver | One RAF reschedules itself; one renderer.render; delta clamped to 0.04 seconds | No duplicate chain, catch-up loop or runaway delta feedback |
| Input | Persistent key sets and reused mouse delta object; edge actions consumed once | Six input listeners registered at construction, removed by dispose; none installed from update |
| Player movement/collision | Reused vectors/candidate array; X, Z and support passes against cached numeric bounds | No Box3 creation/setFromObject/mesh traversal; each pass terminates |
| Collision broad phase | Nine grid buckets per query, room tags, query-stamp deduplication; current room and its connector bounds | 107 colliders stored once; 18 checks idle; maximum 57 in exercised diagonal movement |
| Climbing | Current-room surface list; Great Hall has two climb targets; numeric proximity and cached surface data | Protected target identities retained by batching; no raycasts |
| Player visual | Existing fallback pivots/pose lerps updated; production model load is initialization-only | 50 meshes; rigid batches preserve articulated sockets, attacks, climb, crown and seated pose |
| Camera / lock-on | Reused vectors; one camera update; existing target validated a bounded number of times | No raycaster or whole-scene target scan |
| Room selection | Six room bounds; at most five connector-distance comparisons for doorway preview | Visibility/material matrices changed only on room/preview/settings changes; two cheap sync calls per frame |
| Enemy / boss AI | Hall enemy, Armory beetle, Royal Chambers rat or active throne dragon selected by current room | Distant AI does not tick; leaving active guardians resets them through existing logic |
| Combat | Current-room target array; attack serial returns early between hit events | No all-scene nested collision loop; result allocation occurs on hits |
| Fragments / gold particles | Current-room fragment list; collected fragments stop after collection animation; inactive burst returns early | No distant fragment/VFX updates; existing burst pool retained |
| Boss particles | Current boss update; effects disabled/hidden with owning room | Pooled/reused spark and smoke objects; no per-frame object disposal |
| Tunnels / throne | Current-room tunnel check; numeric throne proximity; menu creation only on open | Menu listener delegated once; small contextual interaction object may be created when nearby |
| Finale / endings | Finale sequence only when active; dragon death updates through its sequence | Deterministic tests cover both choices and both ending sequences |
| UI / presentation | Health/state/progress mostly change-driven; active lock/callout/climb indicators update position while relevant | FPS/F3 refreshed at 4 Hz; short toast timers use frame delta; debug-only text can allocate when shown |
| Scene matrices / rendering | Static local/world matrices frozen; invisible room/actor boundaries skip traversal | Visible current room and at most one adjacent environment preview; adjacent AI stays asleep |
| Lighting / shadows | One current-room point light; directional + hemisphere; cached 1024 shadow map | No point-light shadows, extra render targets, postprocessing or per-frame shadow redraw |
| Diagnostics | Inventory only for J or 4 Hz while F3/capture active; K aggregates timing; optional GPU query sample about every 100 ms | Four reusable GPU queries, availability polling, disjoint rejection, capture-token filtering; no blocking GPU read |

Some presentation/camera/player-visual work continues at menus, as in the existing implementation. This is bounded and is not a moving-only hot path. Updating-room count describes the normal gameplay room; scripted finale and diagnostic modes must be interpreted using their context.

## Static batching and room scope

The previous static pass is retained, not redone. Great Hall has **12 static mesh nodes representing 39 instances** (previous static-only baseline 39 meshes). Five instanced groups contain 16 stone boxes, 8 wood boxes, 2 wood boxes, 2 wood boxes and 4 trim pillars; distinct groups preserve cast/receive shadow and prop-toggle behavior. The four stair blocks are included in static instancing; stair collision height is analytical in PlayerController. Walls, furniture, pillars and compatible repeated room objects share unit primitives. The cloth/banner climb targets and reparentable crown retain identities.

Room static mesh nodes: Great Hall 12, Kitchen 10, Armory 9, Dungeon 7, Royal Chambers 8, Throne Room 16. Existing shared floor, barrel and tunnel primitives remain. There are 26 InstancedMesh nodes across the full scene. No remaining large safe repeated map stack justified another structural rewrite.

Normal rendering includes the current room plus at most the nearest connected room when within six world units of its connector center. Connectors touching the current room render. Actors, boss effects, fragments and room logic use **only the current room**. Hidden environment and actor groups are dormant. This retains connector collision and doorway visibility; it does not unload/reset collected progression.

## Materials, lights and allocations

New immutable geometry sharing covers boxes, spheres, capsules, cones, cylinders, planes, rings and toruses where constructor parameters match in the NPC/character builders. No custom mutable wing/VFX buffer or imported mesh is placed in this cache. The two shared material pairs have identical properties and are not independently animated.

Lighting is unchanged in this continuation: three active lights, five disabled room point lights, one shadow-casting directional light, 1024 PCFSoft shadow map, DPR 1. Antialiasing remains enabled; no tone mapping, stencil, preserved drawing buffer or logarithmic depth buffer. Three internally reports an alpha-capable WebGL context even though renderer output is opaque; J now reports `transparentOutput: false` separately.

**Existing shadow limitation:** shadow maps refresh on room/visibility/quality changes, not every animated pose. Moving actors can therefore have stale cached shadows. This pass preserves the existing policy; it is not a claim that animated shadows are continuously correct.

No per-frame geometry/material creation or disposal was found. Main animation parameter objects, movement/camera vectors and collision candidates are reused. Remaining small allocations include collision cell-key strings, contextual interaction descriptors, active indicator CSS strings and debug text. K additionally records bounded 15-second frame samples, at most 120 spike windows and coarse heap samples. None has been established as the real Chrome GC bottleneck. The measured embedded heap rose and fell around 18.5–19.3 MB without monotonic growth; approximate `performance.memory` values cannot identify GC causes or prove leak freedom.

## Listener / timer / RAF audit

- Source has one requestAnimationFrame scheduling site and one renderer.render site; no setInterval.
- Main has 14 setup-time listeners, InputManager six. Retry, room travel and menus reuse them. Ending Play Again reloads the document.
- Only application setTimeout is the copy button's 1.4-second label reset, scheduled on copy clicks, not every frame.
- PerformanceObserver disconnects on finish/cancel. Twenty InputManager create/dispose test cycles leave zero listeners, including blur.
- No repeated console logging in movement/update. Setup/resource scans and cloning are initialization/debug/event operations. Pattern inventory is saved separately; matches alone are not treated as hot paths.

## Validation and limits

Passed:

- `node scripts/performance-validation.mjs`: 600 controller steps each for idle, W, W+A, camera rotation, jump, dodge and Aura toggling. Maximum collision checks respectively **18, 45, 57, 45, 18, 18, 18**. Also static bounds/matrices, connector collision, protected climbs/crown, capture aggregation and all eight benchmark modes/restoration/cancellation.
- `node scripts/root-cause-validation.mjs`: twelve articulated batch comparisons, sword socket reparenting, dormant wakeup, listeners, combat damage, climb/detach, all-room tunnel/spawn logic, both guardian update/reset paths, throne choices, dragon activation/AI/death and both endings. These are deterministic logic tests, not manual gameplay/FPS measurements.
- `node scripts/diagnostics-validation.mjs`: nonblocking GPU availability, disjoint rejection, four-query reuse, optional fallback, correct spike timestamps/long-task overlap, aggregates and shared-buffer identity.
- Resource audit: no duplicate material signatures remain in its builder scope; geometry count reduced by 30.
- Browser: Begin dismisses the title; J produces the complete snapshot; F3 shows counters; F8 moves to the throne; K completes; Copy shows COPIED; console error/warning query returned empty. Clipboard contents are not independently verified by the automation clipboard API.
- Production build passes. Vite initially hit sandbox `spawn EPERM`; the authorized outside-sandbox build succeeded. The existing large-bundle warning remains (about 790 kB main chunk before gzip); this is a loading-size concern, not evidence of a per-frame cause.

Embedded K functional sample: throne room, 15.08 seconds/21 frames, GPU 15 samples averaging 0.43 ms (max 3.91), render submission CPU 0.73 ms, no long tasks, 55 uploaded geometries and one texture constant. Frame intervals clustered around one second even while `document.visibilityState` was visible. This is consistent with host scheduling/throttling, not a valid normal-browser performance result. It must not be compared to the user's 40 FPS baseline. Pointer lock was unavailable; sustained native keyboard/mouse movement and visual quality of all encounter/end sequences still require manual Chrome checks.

## Remaining real Chrome verification

1. Reload **real Chrome** on the running development game at `http://127.0.0.1:5173/` (J/K/B are development diagnostics).
2. Press **BEGIN**. Keep the tab foreground and normal window size; close DevTools for the timing run. Leave normal settings/DPR 1 enabled.
3. Stand and move normally in **Great Hall**. Check W, W+A, mouse rotation while moving, jump, dodge and repeated Aura Walk toggles; watch for collision/visual regressions.
4. Press **J** and retain the copied snapshot. If clipboard permission fails, use the report panel's Copy button. A snapshot is one frame, not sustained performance.
5. Press **K** and move normally for **15 seconds**, staying in Great Hall without dying/opening menus/resizing. Copy the completed report. If interrupted, repeat it. For isolation after that, B retains its eight sequential comparisons and restores normal settings.
6. Paste **both J and K reports** back. Check repeated console errors separately after the timing run. Repeat important boss, climbing, tunnel and ending gameplay checks in this browser.

Stop here. No new gameplay, visual polish, model pipeline work or subsequent milestone has been started.

## Files

Saved final-pass code preserved: `src/PlayerVisual.js`, `src/TestLevel.js`, `src/InputManager.js`, `src/SceneOptimization.js`, `src/main.js`, `src/PerformanceDiagnostics.js`, `src/PerformanceCapture.js`, `src/GpuTimer.js`.

Continuation source edits: `src/SceneOptimization.js`, `src/EnemyController.js`, `src/ArmoredBeetleBoss.js`, `src/ArmoredRatKnightBoss.js`, `src/FinaleCharacters.js`, `src/DragonBoss.js`, `src/main.js`, `src/PerformanceCapture.js`, `src/PerformanceDiagnostics.js`.

Continuation validation/documentation: `scripts/root-cause-validation.mjs`, `scripts/resource-audit.mjs`, `scripts/diagnostics-validation.mjs`, this report and the resource/pattern audit files in `docs/`. Production `dist/` was regenerated by the build. J/K/B/F3, GPU/spike/heap diagnostics remain available; GPU sampling runs only during captures. No heavy dependency was added.
