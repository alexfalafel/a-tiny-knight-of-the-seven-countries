# Prompt Log

## Preserved / reconstructed Major Codex Prompt Archive

This archive preserves and reconstructs the major Codex prompts that shaped the project. It is a development record, not a claim that every sentence below is an exact historical transcript. The original milestone structure and technical intent are retained. The prompts describe requested work at the time; the current implementation is documented separately in [README.md](README.md), and current source code is the source of truth when behavior differs from historical intent.

## Milestone 1 — 3D game foundation / core vision

Build a browser-based third-person dark-fantasy game, **A Tiny Knight of the 7 Countries**, using Three.js, Vite, JavaScript, and a browser-first architecture. The player is a tiny armored rat knight exploring one interconnected human royal keep inspired by a Red Keep-style fortress, not a large exterior city. Communicate rat scale through oversized human doors, tables, chairs, banners, walls, stairs, and throne architecture; do not shrink the camera or use miniature architecture. Aim for serious, regal semi-realistic fantasy: gray/brown fur, long tail, pale-silver plate, ivory cloth, subtle gold, and dark steel.

Establish separate all-fours exploration, upright combat, and slow, serious Aura Walk states. Use WASD movement, Space jump, Q dodge, E interact/climb, period for Aura Walk, and a Dark Souls 3-style third-person camera. Plan a five-fragment crown loop across the Great Hall, Royal Kitchen, Armory, Dungeon, and Royal Chambers, returning to the Throne Room when complete. Lay out those six connected rooms with hallways, doors, and eventually discoverable rat tunnels; reserve stronger guardians for two rooms. Prioritize stable movement, collision, jump, camera, room/state/interaction frameworks, combat-ready architecture, one authoritative requestAnimationFrame loop, and smooth browser performance. Avoid premature decoration and per-frame allocations. Run `npm install` and `npm run build`, report the foundation and stop when playable.

## Milestone 2 — Core hack-and-slash combat

Add explicit upright combat behavior without breaking exploration movement, jump, camera, or room layout. Mouse1 attacks with a buffered three-hit ATTACK_1/2/3 combo; valid input queues the next hit without frame-perfect timing. Q remains dodge, with a movement burst, cooldown, brief invulnerability, and animation support; Space remains jump outside climbing. Use explicit combat idle/movement, attack, dodge, damage, and death states. Sword damage must happen only during windup/active/recovery timing, and each enemy should be damaged once per swing unless deliberately specified. Add a hostile beetle that detects, approaches/attacks, takes damage, reacts, and dies. Add real player health, death, and retry without building an inventory. Keep semantic states ready for production animation mapping. Verify hits and misses, combo, dodge, enemy damage/death, player death/retry, and run the build.

## Milestone 3 — Breath of the Wild-style cloth climbing

Add a real CLIMB state on explicitly tagged banners, drapes, tablecloths, and curtains. E attaches; while attached W/S climb vertically and A/D move sideways while remaining on the surface. Use separate green circular climbing stamina, draining while climbing and detaching/falling at zero; do not use health for stamina. Space performs a climb jump away/upward. Preserve the third-person camera, authoritative gameplay movement, combat, Q dodge, health, and room progression; do not make every wall climbable or use animation root motion for physics. Verify attach, four directions, stamina drain/exhaustion, detach, climb jump, and reattach; build and stop.

## Milestone 4 — Five crown fragments / progression

Implement the primary objective: exactly five unique crown fragments, one each in the Great Hall, Royal Kitchen, Armory, Dungeon, and Royal Chambers. Collection marks a fragment once, updates the CROWN FRAGMENTS X/5 HUD, and persists for the run. On the fifth, trigger a crown reconstruction state and direct/allow the player to return to the Throne Room. Two fragments are intended to be protected by stronger Armory and Royal Chambers enemies, but do not add full bosses unless already available. Do not overhaul combat or movement. Verify each pickup is unique and 5/5 unlocks throne progression; build and stop.

## Milestone 5 — Full castle framework and rat-tunnel fast travel

Connect the Throne Room, Great Hall, Royal Kitchen, Armory, Dungeon, and Royal Chambers as one compact fortress, reachable through ordinary corridors/doorways. Add a discoverable tunnel node in each major room and make only discovered destinations available to fast travel using contextual E. Preserve intended rat scale; enlarge the human architecture rather than shrinking the player. Keep graybox quality acceptable and prioritize connectivity, collision, navigation, progression, and functional tunnels over decoration. Verify normal room traversal and discovered tunnel travel; stop when the castle framework works.

## Milestone 6 — Armored Beetle boss

Turn the Armory guardian into a readable Armored Beetle boss that protects the crown fragment. Add boss health and explicit IDLE, CHASE, WINDUP, ATTACK, RECOVERY, HIT, STAGGER, and DEATH behavior as appropriate. Telegraph committed attacks; stop perfect tracking through their full animation. Ensure real vulnerable/hit windows so the boss is damageable. Communicate armor/chitin and heavier attacks; on death unlock collection of the Armory crown fragment. Give the player fair windup/active/recovery punish windows. Test a full-health-to-death fight and the reward; build and stop.

## Milestone 7 — Giant Rat Knight boss and lock-on

Add a skilled-duelist Giant Armored Rat Knight in/near Royal Chambers while preserving the Beetle and regular combat. Give it committed sword attacks, guard/block behavior, stagger/poise, and punish windows; prevent ordinary strikes from permanently stun-locking it. Add Dark Souls-style lock-on on Middle Mouse: choose an appropriate nearby enemy, frame it, orient combat movement toward it, allow strafing, and disengage when the target dies or becomes invalid without breaking the existing camera. Use explicit IDLE, CHASE, GUARD, ATTACK_WINDUP, ATTACK_ACTIVE, RECOVERY, HIT_REACTION, STAGGER, and DEATH states. Protect the Royal Chambers fragment. Verify a full duel with lock-on; build and stop.

## Milestone 8 — Throne Room finale and ending choice

After 5/5 fragments and return to the Throne Room, create an original dramatic throne inspired by a sword-made throne and an original silver-haired dragon-queen archetype. Do not use copyrighted character names directly. Offer GIVE THE CROWN TO THE QUEEN or CLAIM THE CROWN FOR YOURSELF. Giving it triggers a short good-ending sequence; claiming it starts the secret final confrontation instead of finishing immediately. During the scripted choice, number keys 1 and 2 belong to the finale and must not be overwritten by future number-key systems. Verify both branches; build and stop.

## Milestone 9 — Secret Dragon boss and Tiny King ending

Complete the claim path with an original castle-finale dragon and readable, avoidable attacks such as breath/fire, claw, bite, area denial, and repositioning. On dragon death, return control to the rat and let the player perform a final ceremonial walk toward the throne, ideally using Aura Walk. Conclude with the rat becoming king and display ALL HAIL THE TINY KING. Preserve the independent good ending. Verify claim → dragon → dragon death → throne approach → king ending; build and stop.

## Milestone 10 — Production rat-knight GLB integration

Replace the procedural visual with `/assets/models/player/rat-knight.glb` using GLTFLoader and AnimationMixer, while preserving a safe fallback. Separate the authoritative gameplay root/collider (movement, physics, collisions, state) from its following visual model; never let GLB root motion drive world movement. Preserve intended player scale (requested production targets: GLB scale about 0.70, standing height about 1.19, collider about 1.20 high and 0.28 radius, camera distance about 4.6); enlarge the castle rather than shrinking the rat. Inspect clips, map semantic states through a mapping layer rather than relying only on opaque names, and support relevant idle, walk, run, attack/combo, dodge, jump, death, kneel, sit, and other production clips. Attach the sword to a stable right-hand socket. Verify model/mixer/animations, gameplay collider authority, and hand-following sword; build and stop.

## Milestone 11 — Royal bronze HUD / UI

Replace placeholder/debug-looking normal-play UI with cohesive dark royal-fantasy presentation: elegant bronze trim, serif typography, dark translucent panels, restrained ornament, and readable scale. Integrate health/VITALITY, circular green climbing stamina, crown progress, boss health, healing charges, FPS, a truthful PING: LOCAL indicator for browser-only state, and contextual prompts. Keep the UI restrained and do not copy another game's interface or alter mechanics. Stop after the HUD is cohesive.

## Milestone 12 — Performance instrumentation / optimization

Address severe frame drops by measuring rather than guessing. Keep a visible FPS counter and F3/debug panel exposing FPS, frame time, draw calls, triangles, active enemies/particles, renderer information, and useful subsystem timings. Add K for an approximately 15-second capture and J for a snapshot, reporting average/low FPS, spikes, and bottleneck observations. Inspect allocations, raycasts, geometry creation, shadows, object counts, materials, and duplicate loops without visually destroying the game. Do not trust tool-side FPS when the browser or graphics driver may be wrong; measure the actual runtime. Build and report findings.

## Milestone 13 — Foot IK / visible support grounding

Ground the Mixamo-style left/right upper leg, leg, and foot chains against the visible surface beneath each foot. Use lightweight two-bone IK/CCD-style correction or an equivalent, after AnimationMixer evaluation. Select the highest valid visible walkable/contact surface: a rug above stone must win over the floor beneath it. Allow modest pelvis correction. Reduce/disable ground IK for jump, fall, dodge when needed, climb, and seated poses, then restore smoothly when grounded. Do not alter scale or collider just to hide clipping. Stop when stone, rugs, stairs, and ordinary locomotion work.

## Milestone 14 — Boss fairness, 100 HP, and Royal Tonic

Move from three integer hearts to approximately 100 HP with VITALITY 100/100. Add three Royal Tonic charges (3/3) on R, healing about 40 HP with action commitment, no overheal, and sensible refill on retry/reset. Make Beetle the easier teaching boss and Rat Knight harder but fair, with clear WINDUP/ACTIVE/RECOVERY, less unfair tracking, committed attack direction, true punish windows, and hitboxes that approximately match danger. Preserve lock-on, dodge, sword combo, crown progression, and the dragon's intended damage scale. Do not change systems outside health/healing and boss fairness. Stop after healing and fairness work.

## Milestone 15 — Smooth animation crossfade / blending

Use Three.js AnimationMixer/AnimationAction crossfade/fade APIs to soften transitions without slowing animation clips. Starting blend targets: Idle↔Walk .20 s, Idle↔Run .18, Walk↔Run .15, Idle↔Aura .25, Aura↔Run .20, combat locomotion .15, locomotion→attack .08–.12, attack→locomotion .12–.18, attack 1→2 and 2→3 .06–.10, held 3→1 .08–.12, locomotion→dodge .05–.08, dodge→locomotion .10–.15, ground→jump .08–.12, jump→locomotion .12–.18, and a very short incoming death blend. Do not reset/replay the same action every frame; transition on state changes. Queued combo clips crossfade directly without Idle. Respect priority DEATH > CLIMB/scripted > DODGE > ATTACK > JUMP > COMBAT > AURA > locomotion > IDLE, and keep Foot IK after mixer evaluation. Do not change sword transforms, movement, damage, bosses, scale, lock-on, or camera. Build and stop.

## Milestone 16 — Hold Mouse1 for continuous combat

Track mouse down/up attackHeld. A tap performs one attack; holding loops ATTACK_1→2→3→1, while release lets the current attack finish then stops. Feed held state to the existing combo queue/timing system; do not invoke attacks every render frame or bypass authoritative hit windows. Respect current interruption/cancel rules for dodge, jump, climb, heal, and death. Clear attackHeld on pointer-lock loss and window blur. Freeze the sword setup and other mechanics. Stop after smooth held-combo behavior.

## Milestone 17 — Emote system and real EMOTING state

Enumerate actual GLB clips and classify GAMEPLAY, EMOTE CANDIDATE, UNSUITABLE, or UNKNOWN; do not invent clips. Keep 1 for Aura Walk and period as its alias; use 2–9 for emotes. Add a true EMOTING state that owns the visual and suppresses ordinary movement/locomotion. Cancel on movement, jump, dodge, attack, damage, heal, lock-on/combat, climb, death, or scripted sequence. Support one-shot clips, held poses (LoopOnce/clamp), and loops only where the clip was authored to loop. Keep root motion from moving the gameplay root; neutralize unwanted horizontal hips/root translation. Final mapping: 2 kneeling bow one-shot; 3 kneel held until cancelled; 4–9 empty absent suitable clips. Do not alter the permanent sword transform; reduce Foot IK for kneeling/seated emotes. Stop when EMOTING works.

## Milestone 18 — Four-direction production climbing animation

Wire the actual live climb direction to existing production clips: W→`climbing_up_wall`, S→`climbing_down_wall`, A→`Climb_Left_with_Both_Limbs_inplace`, D→`Climb_Right_with_Both_Limbs_inplace`; no input→CLIMB_IDLE. Expose CLIMB_IDLE/UP/DOWN/LEFT/RIGHT. For diagonals choose the dominant axis with a small deadzone/hysteresis to avoid flicker. Directional clips loop while moving and do not reset each frame. The gameplay controller remains authoritative, with root motion disabled and ground Foot IK off while climbing. Use one authoritative selector so generic animation cannot override it. Verify W/S/A/D visibly select four different clips; stop.

## Milestone 19 — Frozen CLIMB_IDLE wall-contact pose

Replace the implausible upright standing idle against the wall with a believable frame from `climbing_up_wall`: hands engaged, feet braced, torso close to the wall. Preview/select a suitable nonzero frame; entering CLIMB_IDLE seeks there and pauses playback once. Do not reset the action every frame. W resumes normal looping climb-up. Blend directional climb→idle in about .10–.15 s and idle→movement .08–.12 s. Do not change climbing physics or add an animation. Stop when the rat looks like it grips the wall.

## Milestone 20 — Sword back sheath (combat hand, otherwise back)

Keep the working right-hand WeaponSocket transform frozen. Use the same single sword object and two mounts: drawn in hand during active combat (combat idle/movement, attacks, held combo, lock-on, combat dodge, bosses, active enemy engagement); sheathed on back during exploration idle/walk/run/Aura, noncombat jump/dodge, emotes, bow/kneel, climbing and all other noncombat states. Attach BackSheathSocket to the actual stable spine bone (Spine2 or Spine1) and tune an independent correction for a close diagonal lay, handle near shoulder/blade toward opposite lower side. For first exploration attack, validate/activate combat, move sword to hand, then start attack. Reparent the same object and restore explicit destination-local transforms on each switch so repeated transitions cannot drift. Do not create a duplicate sword or fake a draw animation. Test at least 20 transitions; confirm hand placement is unchanged. Stop.

## Milestone 21 — Combat impact polish (hit-stop, camera, flinch, VFX, SFX)

Add physical presentation only for authoritative confirmed damage events, never for a press, attack start, or miss. Use controlled nonblocking hit-stop timers (starting Attack 1 .045 s, Attack 2 .050 s, Attack 3 .065 s); render continuously and keep held combo queued, using max(current,new) to prevent stacking freezes. Add a subtle .08–.15 s directional camera impulse layered on the existing camera (1 small, 2 stronger, 3 strongest), with no drift or lock-on/collision disruption. Give normal enemies a small readable flinch and bosses small recoil; preserve real stagger/poise, DEATH priority, and gameplay roots. Use restrained hit-point VFX, pooled or aggressively cleaned: Beetle sparks/chitin, Rat Knight restrained armor sparks/body flinch, flesh light blood mist/droplets, generic small fallback; no huge spray. Add semantic hooks `SFX_SWORD_HIT_FLESH`, `_ARMOR`, `_CHITIN`, `_HEAVY`; missing audio should fail silently. A recognized block may use a non-damaging clang/sparks. Attack 3 gets stronger presentation, not more damage. Do not touch combat values, hitboxes, sword hand/sheath transforms, scale, movement, dodge, IK, climbing, Aura, emotes, lock-on, healing, progression, or map. Exercise a 30-second fight and check leaks/object growth, drift, FPS, and console; build. Report hit confirmation, hit-stop, camera, flinch/profiles, VFX, SFX, duplicate protection, performance, and build.

## Supplemental existing prompt-log notes

The prior log also recorded two implementation-focused notes retained here because they add detail beyond the archive wording:

- **Milestone 10 implementation note:** the stable PlayerController root was separated from a swappable PlayerVisual; a detailed procedural silver rat-knight fallback and one-time GLTFLoader path were added for `public/assets/models/player/rat-knight.glb`. One optional AnimationMixer maps semantic states to clip aliases and supports nearest-clip/procedural fallbacks. Crown/weapon sockets and a stable camera target were added. The game remains playable if the GLB or optional clips are unavailable.
- **Milestone 10.1 — Aura Walk and combat stance refinement:** the fallback's regal Aura Walk and low combat guard became distinct blended procedural poses. Refinements included rat silhouette, facial proportions, connected neck, hind legs, segmented tail, silver armor, ivory cloth, and sword placement. A development-only F2 pose cycle pauses encounters for inspection; it was recorded as a visual/stance refinement rather than a new gameplay mechanic.

## AUDIO GENERATION PROMPTS AND ITERATION

The project history supplied for this log identifies ElevenLabs as the audio-generation service. The prompts below are the recorded briefs; exact generation timestamps, model names, and setting values were not preserved, so none are inferred here. The MP3 filenames were checked against `public/assets/audio/sfx/`.

### Sword swing

Prompt/brief: “Fast one-handed medieval sword swing, sharp cutting air whoosh, heavy dark-fantasy longsword, short, no impact.”

Files: `sword-swing-1.mp3`, `sword-swing-2.mp3`.

Purpose: additional combat feedback when a legitimate sword attack begins.

### Sword hit / player damage

Prompt/brief: “Heavy medieval sword striking armored enemy, steel impact, compact clang/body impact.”

Files: `sword-hit-1.mp3`, `sword-hit-2.mp3`, `sword-hit-3.mp3`.

Purpose: outgoing successful sword-hit feedback and the damage-triad cue when the player actually loses HP. The damage cue is wired to the successful `takeDamage` result, so a miss or collision during invulnerability does not produce it.

### Crown fragment / reward

Prompt/brief: “Magical royal treasure pickup chime, bright shimmering bells/golden sparkle, elegant/regal.”

File: `crown-fragment.mp3`.

Purpose: reward-triad cue on unique crown-fragment collection.

### Game completion / end

There were multiple human-curated attempts. An early completion sound was rejected for having too many chimes; a later attempt felt too dark/horror-like. The final brief was: “Short triumphant medieval fantasy victory fanfare, joyful royal trumpets/French horns, warm strings, light timpani/cymbal, uplifting major-key resolution, celebratory heroic, no horror/chimes/celesta/glockenspiel/fairy sparkle, 3–5 sec.”

File: `game-complete.mp3`.

Purpose: end-triad cue on successful game resolution. Rubric mapping: Reward → `crown-fragment.mp3`; Damage → the `sword-hit` variants only when player HP is actually lost; End → `game-complete.mp3`. Sword swing is extra combat feedback beyond the three required categories. The final selections were curated by the project author.

## ERROR RECOVERY AND AGENT STEERING

These entries distinguish recorded evidence from recollection included in the assignment brief. Where the repository preserves tests or diagnostics, those are cited by filename. Exact transient console messages and edit sequences are not reconstructed when records do not establish them.

### Movement and apparent FPS collapse

- **Problem/symptom:** early reports described severe FPS collapse associated with WASD/movement; later performance still appeared lower than expected.
- **Agent diagnosis/proposal:** movement damping/angle handling, including an investigation of invalid `THREE.MathUtils.dampAngle` use, was treated as a possible code cause. The exact original faulty line is not retained in the current source history available here.
- **Human/runtime finding:** a separate browser/system investigation reportedly found Chrome using Microsoft Basic Render Driver instead of proper GPU hardware acceleration; after acceleration was corrected, testing reportedly reached roughly 170 FPS. This figure is a historical user-provided result, not a current benchmark. The later `docs/final-performance-root-cause.md` explicitly says no valid real-Chrome after-result was available for that later pass.
- **Correction/validation:** movement-path and scene/performance diagnostics were added and audited; capture tools distinguish CPU timing from optional GPU timing. `docs/final-performance-root-cause.md`, `docs/performance-pass-3.md`, and the performance/root-cause validation records support structural work, but do not prove a current real-Chrome FPS result. Actual runtime and GPU selection were necessary to refine the diagnosis.

### Armored Beetle vulnerability/readability

- **Problem:** the Armored Beetle appeared impossible or unclear to damage.
- **Agent diagnosis:** treating the symptom as difficulty alone would miss hit-window/vulnerability and readability problems.
- **Human finding/correction:** actual combat checks and later combat audit established valid damage windows, committed attack directions, recovery openings, rear weak-point exposure after recoveries/missed charge/stagger, and front-shell blocking. The newer shared boss logic keeps vulnerability authoritative.
- **Validation:** `docs/milestone16-combat-audit.md` records attack-window and hitbox changes; combat validation and the documented browser smoke test checked actual boss damage. The report still calls for human visual comparison of sword pose and hitbox during full fights.

### Player scale regression

- **Problem:** a scale/map adjustment made the player-to-environment relationship look worse.
- **Human finding/correction:** visual inspection rejected it. The enduring direction is to keep the rat at its intended size and make human architecture feel larger; never shrink the rat merely to communicate scale.
- **Validation:** this rule remains explicit in the Major Prompt Archive and asset/scale guidance. The GLB inspection record reports the configured visual scale, but is not a substitute for visual judgment.

### Foot IK and rug clipping

- **Problem:** feet clipped/sank because support detection could select stone floor beneath a raised rug.
- **Correction:** choose the highest valid visible support surface, with the rug taking precedence over the stone beneath it; feet are evaluated independently and IK follows mixer evaluation.
- **Validation:** `outputs/overnight-final-tests.json` records bare stone, rug center, split feet at rug edge, transitions, and a passing foot-contact validation; `scripts/shadow-grounding-validation.mjs` covers floor/rug/stairs/dais and jump cancellation.

### Ground shadow during jumps

- **Problem:** the blob/ground shadow moved vertically with the jumping player instead of remaining on the support surface.
- **Correction/validation:** support-surface grounding was implemented for the shadow independently of the player; the final hardening output reports a pass for floor, rug, stairs, dais, support box, jump-height cancellation, and horizontal following. The exact original edit is not claimed here.

### Animation blending, jump, and dodge timing

- **Problem:** state transitions were abrupt; jump and dodge visuals began out of sync with accepted physics actions.
- **Correction:** AnimationMixer crossfades were introduced, with no same-action reset each frame and direct attack-to-attack transitions for combos. Jump and Q-dodge visuals were synchronized to their authoritative accepted gameplay events/start offsets; the recovery history does not establish a change to jump physics or invulnerability values for this visual correction.
- **Validation:** animation blending and controller validation scripts cover transitions, while `outputs/overnight-final-tests.json` records animation/game-flow checks. A code test cannot replace visual timing review in a browser.

### Directional climbing and CLIMB_IDLE

- **Problem:** generic animation selection could override the available production directional climb clips; stationary attachment looked like upright standing against a wall.
- **Correction:** one authoritative selector maps W/S/A/D to up/down/left/right clips. A suitable nonzero `climbing_up_wall` frame is frozen for CLIMB_IDLE and resumes for upward movement.
- **Validation:** `src/PlayerAnimationController.js` and `src/PlayerController.js` contain the live mapping/selection; recorded animation and overnight checks inventory the four clips and exercise states. Human visual review remains the authority for whether the pose reads naturally.

### Sword hand alignment and back sheath

- **Problem:** repeated implementation reports said alignment was corrected while screenshots still showed a visibly wrong blade. Initial back mounting also floated away from the character.
- **Correction:** human visual review guided hand alignment; the working hand transform was subsequently treated as protected. Back-specific socket/correction values were tuned separately so the same sword could mount diagonally near the body without changing the hand mount.
- **Validation:** `outputs/weapon-inspection.html`, alignment proof images, `docs/player-glb-inspection.json`, and `outputs/overnight-final-tests.json` retain inspection data. Weapon attachment/sheath validation reports one sword, unchanged hand transform, and 50 transition cycles with zero measured drift. These numerical checks support hierarchy/transform stability; images and gameplay remain necessary to judge appearance.

### General agent-steering lesson

Agent reports were not accepted as proof by themselves. Source inspection, screenshots, actual gameplay, browser console/runtime behavior, and debug/FPS instrumentation were used to test claims. GPU investigation changed the performance diagnosis; visual inspection changed scale, sword-placement, pose, and audio choices. When broad edits or assumptions risked regressions, later prompts became narrower and explicitly protected working systems. The project author decided whether scale, animation, combat feedback, boss readability, and sound felt acceptable; the agent accelerated implementation but did not make those creative judgments.

## ANALYTICAL REFLECTION

This assignment was definitely the most enjoyment I have ever had out of using a Conversation LLM. Codex helped organize the game into separate systems and made it practical to iterate on combat, animation, movement, and performance tools. That speed did not mean the agent always understood the problem. Sometimes it changed too much or reported a fix as complete when the game still looked wrong. Sword placement, player size, climbing animations, feet clipping through rugs, and animation timing all needed me to inspect the source and iterate that myself.

I learned to treat generated explanations as suggestions. Reading the relevant code, checking the browser console, and testing the actual interaction helped catch mistakes that a confident summary could miss. FPS instrumentation was especially useful because it separated measured frame behavior from guesses about movement code. The graphics investigation was a good example: checking Chrome's selected renderer led to a hardware-acceleration issue that changed the diagnosis. Later, smaller prompts that protected known-good systems made it easier to fix one problem without reopening several others.

AI accelerated development, but it did not choose the game's identity for me. I decided that the rat should feel tiny inside an imposing keep, emotes to bring funny parts to a darker game, and that the bosses, sword feedback, and royal sounds should feel readable and restrained. I also rejected audio attempts that did not fit. I remained responsible for testing, steering, and deciding what counted as finished for this assignment, while leaving room for the game to keep developing afterward.

## Current implementation notes

These are current-source facts, not historical prompt claims:

- The browser entry is `index.html`; the project uses Three.js ES modules and Vite. The application source imports `GLTFLoader`, uses `THREE.AnimationMixer`, and creates a Web Audio API `AudioContext` for effects.
- Crown collection, player damage/death, good and secret endings, pointer-lock startup, and audio cues are wired in current source. Player-damage SFX is triggered only when `takeDamage(...)` succeeds. Browser autoplay handling resumes audio from pointer or keyboard interaction.
- Current asset inventory is seven SFX MP3s under `public/assets/audio/sfx/` and one rat-knight GLB under `public/assets/models/player/`. Exact generation dates/model settings and service-specific license terms were not retained in repository records.
- `package.json` declares Three.js `^0.180.0` and Vite `^7.1.7`; the current lock resolves Three.js 0.180.0 and Vite 7.3.6. The Node.js/npm versions depend on the developer environment and are not pinned by this repository.
