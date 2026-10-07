# Prompt Log

## Milestone 1 — Foundation, graybox hall, movement, and camera

Create the foundation for **A Tiny Knight of the 7 Countries** as a lightweight Three.js browser game. Establish one primitive Great Hall scale test room and a placeholder rat model. Implement camera relative four legged running, smooth responsive movement, gravity grounded jumping, cooldown dodge, toggleable slow upright Aura Walk, and a smooth mouse controlled third person camera with pointer lock and pitch limits. Add basic collisions for the hall's major objects, a launch instruction overlay, and README instructions. Keep architecture ready to add future player states and replace the placeholder model. Exclude combat, enemies, bosses, crown fragments, climbing, audio, finished artwork, and additional rooms from this milestone.

## Milestone 2 — Core melee combat prototype

Extend the existing player states with upright combat and attack states, a visible primitive sword, and a buffered three-hit combo. Add one reusable beetle enemy with a simple detect, telegraph, lunge, recovery, health, and death loop. Use a single forward-arc hit test per swing, temporary player and enemy health UI, dodge invulnerability, hit feedback, and a retry flow. Preserve movement, Aura Walk, cached hall collision, and F3 performance metrics. Do not add lock-on, climbing, more rooms, finished assets, or audio.

## Milestone 3 — Climbing and stamina

Add a reusable registry for explicitly marked climbable surfaces, contextual E attach/detach, four-direction surface movement, an all-limbs climbing pose, Space leap away, grip-loss falling, and a circular green climbing stamina indicator that follows the player. Add a tablecloth with a tabletop mantle and a wall banner to the existing Great Hall. Preserve combat, movement, Aura Walk, retry, camera control, and F3 metrics. Do not add rooms, lock-on, audio, finished models, or unrelated systems.

## Milestone 4 — Crown fragments and core progression

Add five reusable gold crown fragments at Great Hall test-route locations for ground pickup, tabletop climbing, a raised traversal pedestal, the beetle area, and the banner climb. Track unique fragment IDs in a progression manager, show a five-piece crown HUD, and provide a short pickup pause, toast, fragment rise, and pooled gold particle burst. When all five are found, pause controls briefly for a symbolic crown reconstruction and direct the player toward the Throne Room. Preserve progress through death/retry; a full reload begins a new test run. Do not add new rooms, bosses, audio, final UI, or future story systems.

## Milestone 5 — Castle framework, Throne Room, and rat-tunnel fast travel

Build six logically grouped primitive graybox rooms (Great Hall, Royal Kitchen, Armory, Dungeon, Royal Chambers, Throne Room) with compact corridors, room-specific cached collision and climbable data, and a physical sword throne. Put one crown fragment in each gameplay room, keep the existing unique IDs and reconstruction flow, and add one reusable rat tunnel per room. Approaching tunnels discovers them; E opens a menu limited to discovered destinations, with the Throne Room unlocked on crown completion. Travel uses a brief fade and preserves health and progression. The throne reports missing crown progress or acknowledges its return after 5/5. Keep the beetle as the Great Hall test encounter, mark future room guardians in comments, and leave bosses, art, audio, and ending content for later milestones.

## Milestone 6 — Armored Beetle Crown Guardian

Add a reusable boss controller and a primitive armored beetle guardian in the existing Armory. Activate it when the player enters the arena, show boss health, and implement telegraphed charge, swipe, and slam attacks with one player-damage window per attack. Shell hits deal no damage and show spark feedback; a missed charge exposes the rear weak point, where full sword damage and combo-weighted stagger apply. On defeat, persist the guardian state in progression and unlock the existing Armory fragment. Retry an undefeated fight at the Armory entrance with restored player health and a reset boss; preserve a defeated boss through retry and fast travel. Keep all other systems and later bosses out of scope.

## Milestone 10 — Production player character and animation pipeline

Separated the stable PlayerController gameplay root from a swappable PlayerVisual child. Added a detailed procedural silver rat-knight fallback and a one-time GLTFLoader path for `public/assets/models/player/rat-knight.glb`. A single optional AnimationMixer maps semantic movement, combat, climb, damage, death, and ending states through configurable clip aliases with graceful nearest-clip/procedural fallbacks. Added semantic crown and weapon sockets, a stable camera target, and final-model asset guidance. The game remains playable without the GLB. No new gameplay mechanics or environment art were added.

## Milestone 10.1 — Aura Walk and combat stance refinement

Separated the fallback's regal Aura Walk and low combat guard into distinct blended procedural poses. Refined the rat silhouette, facial proportions, connected neck, hind legs, segmented tail, streamlined silver armor, restrained ivory cloth, and sword placement. Added a development-only F2 pose cycle that pauses encounters for inspection. No gameplay mechanics, colliders, bosses, rooms, or camera behavior changed.
