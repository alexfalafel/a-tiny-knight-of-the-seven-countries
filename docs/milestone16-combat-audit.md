# Milestone 16: combat feel and Royal Tonic

## Previous health and dodge

The three hearts were actual integer HP, not extra lives: maximum 3, every normal enemy, Beetle, Rat Knight and Dragon damage event removed 1. Damage immunity lasted 1.05 seconds; Q also granted immunity throughout its 0.24-second dodge. Zero HP set `alive=false` and showed the death overlay. R retried in the death room, reset surviving encounter state, and preserved crown/tunnel progression.

Q remains 0.24 seconds, with 0.72 seconds between starts and a target speed of 11 m/s. Nominal powered distance is 2.64 m; actual distance depends on existing velocity damping, obstacles and momentum after the dash. Its complete 0.24-second movement window remains invulnerable. No dodge locomotion, camera or lock-on rewrite.

## New health and healing

Central settings: `src/CombatConfig.js`.

- Maximum HP 100. Normal enemy damage 10. Damage immunity 0.65 seconds.
- Royal Tonic: 3 charges, 40 HP, capped at maximum HP.
- R heals while alive; R still retries while dead. These contexts do not conflict.
- One-second HEALING state; HP and charge commit together at 0.7 seconds.
- Before commit, damage cancels without charge consumption. After commit, the HP and charge transaction remains even if hit during the remaining action.
- Movement, attack, jump, climb interaction and dodge are disabled during healing. The player is vulnerable except for any already-active damage immunity. Standing idle is the temporary animation fallback.
- No healing at full HP, without charges, while climbing/dead/in a scripted finale/already healing, during an attack/dodge, or airborne. Requests made while climbing or in inactive/menu/scripted contexts are discarded.
- Retry/fresh start restore HP and charges. Major boss resets cancel healing, refill charges and clear lock-on. Completed tunnel travel refills charges. Tunnels cannot be used while either guardian, the Dragon, ordinary player combat, or healing is active.
- Compact bronze vitality bar with numeric HP, tonic count, HEALING label and a short golden pulse on commit.
- Dragon damage is mapped to 30 HP so changing units does not accidentally make its existing attacks deal only 1% damage. Its AI, attacks and progression are unchanged.

## Attack timing audit

All times are seconds. W / A / R means windup / active-state duration / recovery. Attack choice cooldown is additional to recovery, never included in it. Charge/lunge A is travel time. Rat melee damage is enabled only from 0.05 seconds into A through 0.035 seconds before A ends; old Rat melee was one sampled impact at a remaining timer of 0.17 (0.22 for heavy).

| Attack | Old W / A / R | New W / A / R | New damage |
|---|---|---|---:|
| Beetle swipe | .70 / .24 / .92 | .75 / .24 / 1.00 | 16 |
| Beetle charge | .82 / travel / .92 hit, 1.65 miss | 1.10 / travel / 1.50 hit, 1.75 miss | 24 |
| Beetle slam | 1.00 / .28 / .92 | 1.25 / .22 / 1.45 | 28 |
| Rat quick sword | No standalone quick attack; always opened a combo | .50 / .24 / .85 | 16 |
| Rat combo first | .58 / .32 / .20 linking pause | .70 / .26 / .25 linking pause | 16 |
| Rat combo second | .38 / .36 / .98 | .50 / .28 / 1.25 | 18 |
| Rat heavy | 1.00 direct, .72 after guard / .40 / 1.35 | 1.25 / .30 / 1.50 | 28 |
| Rat lunge | .62 / travel / 1.05 | .95 / travel / 1.35 | 24 |

All old damage entries were 1 of 3 HP. Guard is still 1.05 seconds before the Rat heavy windup. The two-swing combo's short linking pause is not its final punish window: the final 1.25-second recovery follows swing two, with no further follow-up.

Old Beetle charge duration: max(.35, min(10, distance+2.7)/9.5), speed 9.5 m/s. New: min(10, distance+1.5)/8, speed 8 m/s, maximum 1.25 seconds.

Old Rat lunge duration: max(.42, min(7.5, distance+1.35)/8.5), speed 8.5 m/s. New: min(6.5, distance+1)/7.5, speed 7.5 m/s, maximum .867 seconds.

### Tracking and attack selection

Previously both guardians snapped to the player's angle every windup frame. Rat additionally snapped at attack start; both traveling attacks recomputed their vector from the latest player position. Neither had an extra decision delay after recovery. The Beetle exposed its rear only after a missed charge or a stagger, making ordinary recovery hard to exploit.

Now turn speed is capped at 2.2 rad/s for Beetle, 2.6 rad/s for Rat. Tracking stops for the last .18 seconds of windup and stays off during active/recovery. Travel direction comes from committed yaw. Rat combo swing two retains the first swing's heading throughout its tell. Decision delay is .65 seconds for Beetle and .55 for Rat after the final recovery/stagger; bosses can turn during this delay but cannot select another attack.

All Beetle recoveries expose its existing rear weak point. The front shell still blocks damage. Existing hit reactions, short hitstop and stagger systems remain. Rat's 2.6-second stagger resistance prevents uninterrupted stun chains. Boss HP is unchanged: Beetle 10, Rat 18; player sword hits remain 1/1/2. Actual fight durations require human timing before increasing HP.

Existing crouch/raised-body/weapon poses remain the telegraphs. Beetle swipe now uses attack progress for a deliberate windup and sweep, replacing wall-clock shaking. Slam's visible ring matches its new 2.35 m radius.

## Hitbox audit

These are inexpensive planar attack primitives with vertical overlap checks, not mesh-level collision. One hit event is permitted per swing or traveling attack.

| Attack | Old footprint | New footprint |
|---|---|---|
| Beetle swipe | Radius 2.75, local Z < .4 | Radius 2.35, local Z <= .15, half-width 1.3 |
| Beetle charge | Radius 1.95 | Radius 1.5 |
| Beetle slam | Radius 3.1 | Radius 2.35; feet must be within .35 m of boss ground |
| Rat quick/combo | Radius 3.45, local Z < .72, half-width 1.8 | Radius 2.9, local Z <= .15, half-width 1.15 quick / 1.25 combo |
| Rat heavy | Radius 4, local Z < .72, half-width 2.05 | Radius 3.25, local Z <= .15, half-width 1.3 |
| Rat lunge | Radius 1.45 | Radius 1.1 |

Previously these attacks ignored vertical separation. New overlap bands above boss ground: Beetle .15–1.65 m, Rat melee .35–2.35 m, Rat lunge .30–2.20 m. Player height participates in the overlap. Smaller footprints reduce phantom side/rear hits; visual sword-to-hitbox alignment still needs human observation through full attack sequences.

Existing F4 sword/Beetle debug geometry is preserved and off by default. F3 now adds HP, charges, heal elapsed/commit state, damage immunity, boss phase/timer, W/A/R tuning, cooldown, tracking flag and distance. No new normal-play debug geometry.

## Validation and limits

`node scripts/combat-validation.mjs` passed: numeric HP, damage immunity, R input, commitment, movement/action restrictions, before/after-commit interruption, overheal cap, empty charges, forbidden states, death/reset, dodge immunity, capped tracking, direction commitment, finite two-hit combo, one hit per swing, vertical hit rejection, recovery, decision delay and boss reset.

Browser smoke checks used the in-app browser, not a real-Chrome performance benchmark:

- Begin, vitality bar, tonic count and normal 10-HP damage worked.
- Observed R enter HEALING and, outside the encounter, HP go from 28 to 68 while charges went from 3 to 2.
- Entered Beetle with existing F6 shortcut; observed charge/swipe damage and F3 decision cooldown, with Beetle lock-on and boss bar active.
- Used existing F7 safe Rat arena entry and Q input. This is not a completed Rat fight or validation of its difficulty.
- No console errors/warnings captured during those checks.
- No real-Chrome FPS claim is made. Pointer-lock camera control, complete fight difficulty, hitbox/pose agreement and full regression playthrough still require human testing.

`npm run build` passed (existing >500 kB bundle advisory).

## Exact human playtest

1. In real Chrome, begin a fresh game. Confirm 100 HP / 3 tonics. Take a normal hit: 90 HP. Press R: stand still for 1 s, heal at .7 s, cap at 100, spend exactly one charge. Check the golden pulse.
2. Start R just before a hit. Before .7 s, it must cancel and retain the charge. After .7 s, restored HP and spent charge must remain. Try attack, Q, Space and E during healing. Test zero charges/full health/climbing and scripted finales.
3. Reach the Armory normally (F6 is an existing development shortcut). Lock on with Tab/middle mouse. Strafe, dodge the committed swipe/charge, circle behind during every recovery and hit the exposed rear. Jump the slam. Try healing after a missed charge. Confirm no tunnel escape/refill during the encounter.
4. Reach Royal Chambers (F7 places the player at its safe entry; walk into the arena). Lock on. Compare quick .5 s and delayed heavy 1.25 s tells. Circle behind committed attacks. Count exactly two combo swings, then punish during 1.25 s recovery. Sidestep the lunge and heal during recovery. Check actual sword contact against damage timing.
5. Die to each boss, press R, and confirm 100 HP / 3 charges, boss restored, lock-on cleared, no stale healing/combo. Reset by leaving the arena and verify refill only after boss reset. Travel through a discovered tunnel outside combat and verify refill.
6. Check attack animation, Q's visible timing, camera near walls, lock-on strafing, existing boss health bars, normal enemy bar, stairs, jump, climbing, Aura and crown/ending progression. Foot/rug systems were not edited.
7. Record real Chrome FPS/console, victory time and deaths over several attempts. Target Beetle 60–120 s and Rat 90–180 s; judge whether missed attacks give reliable openings and healing feels risky but practical. These difficulty targets have not been established by the automated checks.

## Files

Runtime: CombatConfig.js, PlayerController.js, BossController.js, ArmoredBeetleBoss.js, ArmoredRatKnightBoss.js, main.js, style.css, index.html. Tests: scripts/combat-validation.mjs. Audit and controls: this document and README.md. Pre-edit source copies are retained in work/milestone16-before.

No changes to player scale, collider sizes, foot IK, rug contact, camera collision, map, lock-on implementation, Aura implementation, climbing locomotion, crown progression, assets or audio.
