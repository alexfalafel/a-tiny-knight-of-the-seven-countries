# A Tiny Knight of the 7 Countries

This Three.js browser game follows a tiny armored rat knight through an interconnected human royal keep. The current assignment milestone includes six castle rooms, traversal and climbing, crown progression, rat-tunnel fast travel, three bosses, both throne endings, and a production player-character visual pipeline. The player loads `public/assets/models/player/rat-knight.glb`; a procedural fallback keeps the game playable if the asset or optional clips are unavailable. Development may continue after this submission milestone.

## Run locally

Install Node.js, then from the project folder run:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Use `npm run build` to create the deployable static site in `dist/`; `index.html` is the entry point.

## Controls

- Click **Begin** or the game canvas to capture the mouse; press **Esc** to release it.
- **W / A / S / D** move relative to the camera.
- **Mouse** rotates the camera.
- **Space** jumps.
- **Q** dodges in the current movement direction (or camera forward) with a short cooldown and brief invulnerability.
- **1 / .** toggles Aura Walk; the rat stands tall and relaxed, with its sword sheathed. Jump and dodge return it to running mode.
- **Left Mouse** attacks with a buffered three-hit combo; hold it to continue attacking. Combat uses a lower guard stance with the sword in hand; the rat returns to running posture after combat ends.
- **E** begins climbing when near and facing a marked cloth surface; press **E** again to detach.
- While climbing, **W / S** climb vertically and **A / D** move sideways. **Space** leaps away from the surface and spends climbing stamina. The stamina circle appears near the rat while attached and refills on solid ground.
- **R** uses Royal Tonic while alive (3 charges, 40 HP, 1-second commitment); retries after death.
- **Middle Mouse** toggles combat lock-on.
- **2** plays the kneeling bow once; **3** enters or cancels the held kneel pose.
- **Tab / Middle Mouse** toggles combat lock-on.
- **F3** toggles the performance panel.
- **F2** cycles the development-only player visual test poses and pauses encounters until the cycle reaches **LIVE GAME**.

Explore the Great Hall, Royal Kitchen, Armory, Dungeon, Royal Chambers, and Throne Room through their normal corridors. Approach a rat tunnel to discover it, then press **E** to open fast travel. Collected fragments and discovered tunnels remain available after death and retry; reloading the page starts a new test run. Completing the five-fragment crown makes the Throne Room a fast-travel destination and enables its throne interaction.

The Armory crown fragment is locked until the Armored Beetle guardian is defeated. Its shell blocks sword damage; wait for recovery after any attack, or stagger, to strike the exposed rear section.

## Architecture

- `src/main.js` creates the scene, renderer, lighting, game loop, and resize handling.
- `src/InputManager.js` tracks keyboard edges and pointer locked mouse movement.
- `src/PlayerController.js` owns the stable gameplay root, health, movement, gravity, and collision resolution. `src/PlayerVisual.js` owns the swappable player model, procedural rat-knight fallback, crown/weapon sockets, and GLB loading. `src/PlayerAnimationController.js` maps semantic gameplay states to optional GLB clips and crossfades them through one AnimationMixer.
- `src/ThirdPersonCamera.js` handles mouse orbit, pitch limits, and smooth following.
- `src/TestLevel.js` builds the six grouped graybox rooms, corridors, tunnel markers, throne, and cached room collision boxes.
- `src/RoomManager.js` tracks room entry, tunnel discovery, and eligible fast-travel destinations; `src/RatTunnel.js` contains reusable tunnel location and spawn data.
- `src/ClimbableRegistry.js` registers explicit climb surfaces and performs short range facing checks without traversing the scene.
- `src/CrownFragment.js` provides reusable animated crown pickups; `src/ProgressionManager.js` tracks unique fragment IDs and completion events.
- `src/GoldParticleBurst.js` reuses a bounded particle pool for pickup feedback.
- `src/EnemyController.js` owns the beetle's simple detect, telegraph, lunge, recovery, health, and death states.
- `src/CombatEncounter.js` resolves one reusable forward-arc hit check at each sword impact.
- `src/BossController.js` provides shared boss state, health, event, arena, and reset behavior; `src/ArmoredBeetleBoss.js` implements the Armory guardian and its attack windows.

The player visuals are grouped separately from the controller. The procedural rat-knight is retained as a loading/error fallback. Camera obstruction uses cached level collision bounds. The project has diagnostic and validation records under `docs/`, `scripts/`, and `outputs/`; those records distinguish automated structural checks from browser and hardware-specific performance observations.

## Concept Inspiration

The concept is an original tiny rat-knight dark-fantasy adventure set inside an imposing royal fortress. Its central visual idea is to explore familiar human architecture from rat scale: doors, furniture, stairs, banners, corridors, and throne architecture should make the player feel small without shrinking the character. The serious, regal treatment of an unusually small hero gives the game its own tone. The castle, queen archetype, and story are original project elements; references below informed design direction and do not indicate included third-party characters or artwork.

Design references include Dark Souls 3-style third-person framing and combat presentation, Breath of the Wild-inspired climbing and stamina readability, dark medieval royal-fortress architecture, and restrained bronze/royal-fantasy HUD styling.

## Gameplay References

- **Dark Souls 3:** a close third-person camera, target lock-on, deliberate melee presentation, readable boss attacks, and punish windows.
- **Breath of the Wild:** selected climbable surfaces, stamina-based traversal, and a circular green stamina display.
- **Action RPG conventions:** room-based progression, telegraphed boss attacks, health management, and a limited healing resource.

These are gameplay design references. The game uses original characters, environments, UI composition, and implementation.

## Sonic References

The intended sound palette pairs a sharp sword-air whoosh with compact metal, armor, or chitin impacts, a bright magical royal-treasure pickup, and a short triumphant medieval victory fanfare. The bespoke sound effects were generated for this project using ElevenLabs and then selected by the project author. The [prompt log](PROMPT_LOG.md) records the generation briefs and iteration notes; [asset attribution](ASSET_ATTRIBUTION.md) lists the resulting files.

## Gameplay Objective

Explore the six-room keep, use traversal and discovered rat tunnels, collect five crown fragments, and defeat the stronger guardians protecting two of them. Once the crown is restored, return to the Throne Room and make the finale choice. The two endings are described in-game.

## Audio Requirement Mapping

- **Reward:** `crown-fragment.mp3` plays when a unique crown fragment is collected.
- **Damage:** a `sword-hit` variant plays when the player actually loses HP; misses and damage prevented by invulnerability do not trigger this player-damage cue.
- **End:** `game-complete.mp3` plays on successful ending resolution.
- **Additional combat cues:** sword-swing variants play when an attack begins; sword-hit variants also provide outgoing confirmed-hit feedback.

## AI Tools and Models

The project records identify these tools and roles:

- **OpenAI Codex / ChatGPT:** game architecture, Three.js implementation, debugging, iterative prompt work, and documentation assistance. Multiple model configurations were used during development; exact model names and per-task assignments are not consistently recorded, so none are asserted here.
- **ElevenLabs:** generated the project sound effects from the briefs recorded in `PROMPT_LOG.md`; the project author curated the final selections.
- **Meshy:** used in the production rat-knight 3D model workflow, including generation/processing, topology/texturing preparation, rigging, and animation workflow, as recorded for this project. The exact Meshy model/features and settings are not preserved.
- **GitHub / GitHub Desktop:** repository version control, hosting, and project transfer between Windows and Mac development copies.

This inventory reflects the project records and author-provided development history; it does not infer unrecorded model versions or prompts. See [asset attribution and licensing](ASSET_ATTRIBUTION.md) for asset-specific notes.

## Final Tech Stack

- JavaScript with ES modules; HTML5 entry point and CSS presentation.
- Three.js **0.180.0** (declared `^0.180.0`); Vite **7.3.6** in the current lockfile (declared `^7.1.7`).
- WebGL rendering through Three.js; Web Audio API `AudioContext` for sound effects.
- glTF 2.0 / GLB player model loading with Three.js `GLTFLoader`; `THREE.AnimationMixer` for animation.
- Node.js and npm for local development and package scripts. The repository does not pin their exact versions; use the versions installed in your environment.

## Asset Attribution

See [ASSET_ATTRIBUTION.md](ASSET_ATTRIBUTION.md) for the model, audio, dependencies, procedural visuals, and licensing/provenance notes.

## Further Development

This is the current assignment submission milestone, not a declaration that the game is permanently finished. Supported directions for continued work include improving all-fours exploration locomotion, an environment/castle visual overhaul, final music, further visual and animation/emote polish, and continued encounter/boss polish.
