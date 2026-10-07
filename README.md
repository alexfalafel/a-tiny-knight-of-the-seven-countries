# A Tiny Knight of the 7 Countries

This Three.js browser prototype now contains the complete graybox game loop: six castle rooms, traversal and climbing, crown progression, rat-tunnel fast travel, three bosses, both throne endings, and a production-ready player character visual pipeline. The player loads the supplied production model at `public/assets/models/player/rat-knight.glb`. The model loader and semantic animation mapping keep the fallback playable when the asset or individual clips are missing.

## Run locally

Install Node.js, then from the project folder run:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Use `npm run build` to create the deployable static site in `dist/`; `index.html` is the entry point.

## Controls

- Click the game or **Click to Begin** to capture the mouse; press **Esc** to release it.
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
- **2 / 3** play the bow / kneel emotes; repeat the key to cancel.
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

The player visuals are grouped separately from the controller. The procedural rat-knight is retained as a loading/error fallback. Camera obstruction uses cached level collision bounds. See `docs/OVERNIGHT_QA_REPORT.md` for the stabilization results and remaining manual checks.
