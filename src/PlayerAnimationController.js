import * as THREE from "three";

// Exact clip names discovered in assets/models/player/rat-knight.glb.
// The UUID-named custom clips are identified by their pose/motion tracks in
// docs/player-glb-inspection.json; gameplay never depends on display labels.
export const PLAYER_ANIMATION_CLIPS = Object.freeze({
  IDLE_ALL_FOURS: "01a10fae-d4d5-72e5-ace6-cc830b78946c", // custom idle; pack has no all-fours idle
  RUN_ALL_FOURS: "Running", // humanoid upright run, accepted for this milestone
  IDLE_COMBAT: "01a10fae-d4d5-72e5-ace6-cc830b78946c", // separate state; reuse custom idle until a combat idle exists
  COMBAT_WALK: "Walking",
  AURA_WALK: "Walking",
  ATTACK_1: "Attack",
  ATTACK_2: "Triple_Combo_Attack",
  ATTACK_3: "Triple_Combo_Attack",
  DODGE: "01a10fb1-42e0-70de-9628-735b3ef4e968",
  JUMP: "01a10fb1-fc3c-70a3-b564-88cda0588813",
  FALL: "Alert",
  LAND: "01a10fae-d4d5-72e5-ace6-cc830b78946c",
  CLIMB_IDLE: "climbing_up_wall",
  CLIMB_UP: "climbing_up_wall",
  CLIMB_DOWN: "climbing_down_wall",
  CLIMB_LEFT: "Climb_Left_with_Both_Limbs_inplace",
  CLIMB_RIGHT: "Climb_Right_with_Both_Limbs_inplace",
  CLIMB_JUMP: "01a10fb1-fc3c-70a3-b564-88cda0588813",
  DAMAGE: "Alert",
  DEATH: "01a10fb2-e41c-77fc-a7c5-2cc1ac53b709",
  KNEEL: "01a10fb4-abe5-7736-9785-3578dbd64869",
  SIT_THRONE: "Chair_Sit_Idle_M",
});

const LOOP_STATES = new Set([
  "IDLE_ALL_FOURS", "RUN_ALL_FOURS", "IDLE_COMBAT", "COMBAT_WALK", "AURA_WALK",
  "FALL", "CLIMB_IDLE", "CLIMB_UP", "CLIMB_DOWN", "CLIMB_LEFT", "CLIMB_RIGHT",
]);
const HOLD_FINAL_STATES = new Set(["DEATH", "KNEEL", "SIT_THRONE"]);
const LOOP = THREE.LoopRepeat;
const ONCE = THREE.LoopOnce;
const normalizedName = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

// Visual-only multipliers. These scale the existing clip-duration timing;
// they do not affect movement, jump physics, dodge distance, or combat timers.
export const PLAYER_ANIMATION_CONFIG = Object.freeze({
  jump: Object.freeze({ playbackSpeedMultiplier: .5, startOffset: .6 }),
  dodge: Object.freeze({ playbackSpeedMultiplier: .45, startOffset: .16 }),
  climb: Object.freeze({
    upPlaybackSpeed: 1,
    downPlaybackSpeed: 1,
    leftPlaybackSpeed: 1,
    rightPlaybackSpeed: 1,
    idlePoseNormalizedTime: .335,
    directionHysteresis: .15,
  }),
});

// These blend durations affect only the handoff between clips. Playback rates
// remain controlled by speedFor(), so combat and movement timing are unchanged.
export const PLAYER_ANIMATION_BLEND_DURATIONS = Object.freeze({
  "IDLE_ALL_FOURS>RUN_ALL_FOURS": .18,
  "RUN_ALL_FOURS>IDLE_ALL_FOURS": .2,
  "IDLE_ALL_FOURS>AURA_WALK": .23,
  "AURA_WALK>IDLE_ALL_FOURS": .23,
  "IDLE_ALL_FOURS>COMBAT_WALK": .2,
  "COMBAT_WALK>IDLE_ALL_FOURS": .18,
  "IDLE_COMBAT>COMBAT_WALK": .15,
  "COMBAT_WALK>IDLE_COMBAT": .15,
  "COMBAT_WALK>RUN_ALL_FOURS": .15,
  "RUN_ALL_FOURS>COMBAT_WALK": .15,
  "AURA_WALK>RUN_ALL_FOURS": .2,
  "RUN_ALL_FOURS>AURA_WALK": .2,
  "COMBAT_WALK>AURA_WALK": .2,
  "AURA_WALK>COMBAT_WALK": .2,
  "IDLE_COMBAT>RUN_ALL_FOURS": .18,
  "RUN_ALL_FOURS>IDLE_COMBAT": .18,
  "ATTACK_1>ATTACK_2": .08,
  "ATTACK_2>ATTACK_3": .08,
  "ATTACK_3>ATTACK_1": .1,
});

const LOCOMOTION_STATES = new Set([
  "IDLE_ALL_FOURS", "RUN_ALL_FOURS", "IDLE_COMBAT", "COMBAT_WALK", "AURA_WALK",
]);
const GAIT_STATES = new Set(["RUN_ALL_FOURS", "COMBAT_WALK", "AURA_WALK"]);

export function playerAnimationBlendDuration(fromState, toState) {
  if (fromState === "EMOTING" && toState === "EMOTING") return .16;
  if (toState === "EMOTING" || fromState === "EMOTING") return .2;
  if (fromState?.startsWith("CLIMB_") || toState?.startsWith("CLIMB_")) {
    if (fromState?.startsWith("CLIMB_") && toState?.startsWith("CLIMB_")) {
      return fromState === "CLIMB_IDLE" || toState === "CLIMB_IDLE" ? .12 : .1;
    }
    return .12;
  }
  const configured = PLAYER_ANIMATION_BLEND_DURATIONS[`${fromState}>${toState}`];
  if (configured !== undefined) return configured;
  if (toState === "DEATH") return .07;
  if (toState === "DODGE") return .06;
  if (fromState === "DODGE") return .13;
  if (toState === "JUMP" || toState === "CLIMB_JUMP") return .1;
  if (fromState === "JUMP" || fromState === "FALL" || fromState === "CLIMB_JUMP") return .15;
  if (toState?.startsWith("ATTACK_")) return fromState?.startsWith("ATTACK_") ? .08 : .1;
  if (fromState?.startsWith("ATTACK_")) return .15;
  if (LOCOMOTION_STATES.has(fromState) && LOCOMOTION_STATES.has(toState)) return .18;
  return .14;
}

function removeRootMotion(clips, rootBoneName) {
  const rootKey = normalizedName(`${rootBoneName}.position`);
  const verticalRootMotionClips = new Set(["climbingupwall", "climbingdownwall"]);
  const removed = [];
  for (const clip of clips) {
    for (const track of clip.tracks) {
      if (normalizedName(track.name) !== rootKey || track.values.length < 3) continue;
      const values = track.values;
      const firstX = values[0], firstY = values[1], firstZ = values[2];
      const removeVerticalDrift = verticalRootMotionClips.has(normalizedName(clip.name));
      let maxHorizontalTravel = 0, maxVerticalTravel = 0;
      for (let i = 0; i < values.length; i += 3) {
        const dx = values[i] - firstX, dz = values[i + 2] - firstZ;
        maxHorizontalTravel = Math.max(maxHorizontalTravel, Math.hypot(dx, dz));
        maxVerticalTravel = Math.max(maxVerticalTravel, Math.abs(values[i + 1] - firstY));
        values[i] = firstX;
        if (removeVerticalDrift) values[i + 1] = firstY;
        values[i + 2] = firstZ;
      }
      if (maxHorizontalTravel > .05 || (removeVerticalDrift && maxVerticalTravel > .05)) {
        removed.push({ clip: clip.name, maxMeters: maxHorizontalTravel, maxVerticalMeters: removeVerticalDrift ? maxVerticalTravel : 0 });
      }
    }
  }
  return removed;
}

export class PlayerAnimationController {
  constructor(root, clips, { rootBoneName = "mixamorig:Hips" } = {}) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
    this.stateActions = new Map();
    this.clips = clips;
    this.clipsByName = new Map(clips.map((clip) => [normalizedName(clip.name), clip]));
    this.currentAction = null;
    this.currentState = null;
    this.currentAnimationKey = null;
    this.currentEmote = null;
    this.currentClip = "none";
    this.playbackSpeed = 1;
    this.previousAction = null;
    this.blendTarget = null;
    this.blendDuration = 0;
    this.blendElapsed = 0;
    this.deathLatched = false;
    this.rootMotionRemoved = removeRootMotion(clips, rootBoneName);
    this.climbGameplayActive = false;
    this.climbInputX = 0;
    this.climbInputY = 0;
    this.climbInputDirection = "NONE";
    this.climbSurfaceName = "none";
    this.swordHiddenForClimb = false;
    for (const [state, exactClipName] of Object.entries(PLAYER_ANIMATION_CLIPS)) {
      const clip = this.clipsByName.get(normalizedName(exactClipName));
      if (!clip) continue;
      let action = this.actions.get(clip);
      if (!action) {
        action = this.mixer.clipAction(clip);
        this.actions.set(clip, action);
      }
      this.stateActions.set(state, action);
    }
    // CLIMB_IDLE uses a separate action for a frozen, mid-cycle contact pose
    // from the production upward climb clip. A distinct clip/action lets the
    // live directional action crossfade into the held pose without restarting
    // or mutating the directional action itself.
    const climbUpClip = this.clipsByName.get(normalizedName(PLAYER_ANIMATION_CLIPS.CLIMB_UP));
    this.climbIdleSourceClipName = climbUpClip?.name || "none";
    this.climbIdlePoseTime = climbUpClip
      ? THREE.MathUtils.clamp(
        climbUpClip.duration * PLAYER_ANIMATION_CONFIG.climb.idlePoseNormalizedTime,
        0,
        Math.max(0, climbUpClip.duration - 1e-4),
      )
      : 0;
    if (climbUpClip) {
      this.climbIdlePoseClip = climbUpClip.clone();
      this.climbIdlePoseClip.name = `${climbUpClip.name}__frozen_cling_pose`;
      const idleAction = this.mixer.clipAction(this.climbIdlePoseClip);
      this.actions.set(this.climbIdlePoseClip, idleAction);
      this.stateActions.set("CLIMB_IDLE", idleAction);
    }
    if (import.meta.env?.DEV) {
      console.info(`[PlayerAnimation] Found animations (${clips.length}): ${clips.map((clip) => clip.name).join(" | ")}`);
      console.info(`[PlayerAnimation] Root translation neutralized: ${this.rootMotionRemoved.map((item) => `${item.clip} (horizontal ${item.maxMeters.toFixed(2)}m${item.maxVerticalMeters ? `, vertical ${item.maxVerticalMeters.toFixed(2)}m` : ""})`).join("; ") || "none"}`);
    }
  }

  resolve(state) {
    let candidate = state;
    const visited = new Set();
    while (candidate && !visited.has(candidate)) {
      visited.add(candidate);
      const action = this.stateActions.get(candidate);
      if (action) return action;
      candidate = ({
        IDLE_ALL_FOURS: null, RUN_ALL_FOURS: "IDLE_ALL_FOURS", IDLE_COMBAT: "IDLE_ALL_FOURS",
        COMBAT_WALK: "IDLE_COMBAT", AURA_WALK: "COMBAT_WALK",
        ATTACK_1: "IDLE_COMBAT", ATTACK_2: "ATTACK_1", ATTACK_3: "ATTACK_2",
        DODGE: "RUN_ALL_FOURS", JUMP: "RUN_ALL_FOURS", FALL: "IDLE_COMBAT", LAND: "IDLE_ALL_FOURS",
        CLIMB_IDLE: "IDLE_COMBAT", CLIMB_UP: "CLIMB_IDLE", CLIMB_DOWN: "CLIMB_IDLE",
        CLIMB_LEFT: "CLIMB_IDLE", CLIMB_RIGHT: "CLIMB_IDLE", CLIMB_SIDE: "CLIMB_IDLE", CLIMB_JUMP: "JUMP",
        DAMAGE: "IDLE_COMBAT", DEATH: null, KNEEL: "IDLE_COMBAT", SIT_THRONE: "KNEEL",
      })[candidate];
    }
    return null;
  }

  hasClip(clipName) { return Boolean(clipName && this.clipsByName.has(normalizedName(clipName))); }

  actionForClip(clipName) {
    const clip = this.clipsByName.get(normalizedName(clipName));
    if (!clip) return null;
    let action = this.actions.get(clip);
    if (!action) { action = this.mixer.clipAction(clip); this.actions.set(clip, action); }
    return action;
  }

  speedFor(state, action) {
    if (state === "AURA_WALK") return .7;
    if (state === "ATTACK_1") return action.getClip().duration / .48;
    if (state === "ATTACK_2" || state === "ATTACK_3") return action.getClip().duration / (.54 + .82);
    if (state === "DODGE") return Math.min(3, action.getClip().duration / .24) * PLAYER_ANIMATION_CONFIG.dodge.playbackSpeedMultiplier;
    if (state === "JUMP") return action.getClip().duration / .66 * PLAYER_ANIMATION_CONFIG.jump.playbackSpeedMultiplier;
    if (state === "CLIMB_UP") return PLAYER_ANIMATION_CONFIG.climb.upPlaybackSpeed;
    if (state === "CLIMB_DOWN") return PLAYER_ANIMATION_CONFIG.climb.downPlaybackSpeed;
    if (state === "CLIMB_LEFT") return PLAYER_ANIMATION_CONFIG.climb.leftPlaybackSpeed;
    if (state === "CLIMB_RIGHT") return PLAYER_ANIMATION_CONFIG.climb.rightPlaybackSpeed;
    return 1;
  }

  setState(state, { emote = null } = {}) {
    if (this.deathLatched && state !== "DEATH") return;
    const animationKey = state === "EMOTING" ? emote?.clip || null : state;
    if (state === this.currentState && animationKey === this.currentAnimationKey) return;
    if (state === "DEATH") this.deathLatched = true;
    const previousState = this.currentState;
    const next = state === "EMOTING" ? this.actionForClip(animationKey) : this.resolve(state);
    if (state === "EMOTING" && !next) return;
    this.currentState = state;
    this.currentAnimationKey = animationKey;
    this.currentEmote = state === "EMOTING" ? emote : null;
    const holdsClimbIdlePose = state === "CLIMB_IDLE" && Boolean(this.climbIdlePoseClip);
    const speed = next ? (holdsClimbIdlePose ? 0 : this.speedFor(state === "EMOTING" ? "EMOTING" : state, next)) : 1;
    if (next === this.currentAction) {
      this.playbackSpeed = speed;
      if (next) {
        next.timeScale = holdsClimbIdlePose ? 1 : speed;
        if (holdsClimbIdlePose) {
          next.time = this.climbIdlePoseTime;
          next.paused = true;
        } else {
          next.paused = false;
        }
        const looping = state === "EMOTING" ? emote.loopMode === "REPEAT" : LOOP_STATES.has(state) && !holdsClimbIdlePose;
        next.setLoop(looping ? LOOP : ONCE, looping ? Infinity : 1);
        next.clampWhenFinished = state === "EMOTING" ? emote.behavior === "HOLD_POSE" : HOLD_FINAL_STATES.has(state);
      }
      return;
    }
    const previous = this.currentAction;
    // Keep at most one outgoing action during a blend. A rapid state change
    // retires the older fade before beginning the next crossfade.
    if (this.previousAction && this.previousAction !== previous) {
      this.previousAction.stop();
      this.previousAction = null;
    }
    if (next) {
      next.enabled = true;
      next.reset();
      if (state === "JUMP") {
        next.time = THREE.MathUtils.clamp(PLAYER_ANIMATION_CONFIG.jump.startOffset, 0, Math.max(0, next.getClip().duration - 1e-4));
      } else if (state === "DODGE") {
        next.time = THREE.MathUtils.clamp(PLAYER_ANIMATION_CONFIG.dodge.startOffset, 0, Math.max(0, next.getClip().duration - 1e-4));
      } else if (holdsClimbIdlePose) {
        next.time = this.climbIdlePoseTime;
      }
      next.timeScale = holdsClimbIdlePose ? 1 : speed;
      next.paused = false;
      const looping = state === "EMOTING" ? emote.loopMode === "REPEAT" : LOOP_STATES.has(state) && !holdsClimbIdlePose;
      next.setLoop(looping ? LOOP : ONCE, looping ? Infinity : 1);
      next.clampWhenFinished = state === "EMOTING" ? emote.behavior === "HOLD_POSE" : HOLD_FINAL_STATES.has(state);
      const previousCanBlend = previous && (previous.isRunning() || (previous.enabled && previous.paused));
      if (previousCanBlend) {
        // Keep gait phase when changing between locomotion clips (for example
        // Walk -> Run); attacks and other one-shots always begin at clip time 0.
        if (GAIT_STATES.has(previousState) && GAIT_STATES.has(state)) {
          const previousDuration = previous.getClip().duration;
          const nextDuration = next.getClip().duration;
          if (previousDuration > 0 && nextDuration > 0) {
            const normalizedPhase = ((previous.time % previousDuration) + previousDuration) % previousDuration / previousDuration;
            next.time = normalizedPhase * nextDuration;
          }
        }
        const duration = playerAnimationBlendDuration(previousState, state);
        next.play();
        if (holdsClimbIdlePose) next.paused = true;
        previous.crossFadeTo(next, duration, false);
        this.previousAction = previous;
        this.blendDuration = duration;
        this.blendElapsed = 0;
        this.blendTarget = next.getClip().name;
      } else {
        next.setEffectiveWeight(1).play();
        if (holdsClimbIdlePose) next.paused = true;
        this.previousAction = null;
        this.blendDuration = 0;
        this.blendElapsed = 0;
        this.blendTarget = null;
      }
    } else if (previous) {
      // If a clip is unavailable (for example before a production rig loads),
      // do not leave its old action running after the state has been cleared.
      previous.stop();
      this.previousAction = null;
      this.blendDuration = 0;
      this.blendElapsed = 0;
      this.blendTarget = null;
    }
    this.currentAction = next;
    this.currentClip = next?.getClip().name || "none";
    this.playbackSpeed = speed;
  }

  update(dt) {
    this.mixer.update(dt);
    if (!this.previousAction) return;
    this.blendElapsed += Math.max(0, dt);
    if (this.blendElapsed >= this.blendDuration) {
      this.previousAction.stop();
      this.previousAction = null;
      this.blendElapsed = this.blendDuration;
      this.blendTarget = null;
    }
  }

  reset(state = "IDLE_ALL_FOURS") {
    this.mixer.stopAllAction();
    for (const action of this.actions.values()) { action.reset(); action.enabled = false; }
    this.currentAction = null;
    this.currentState = null;
    this.currentAnimationKey = null;
    this.currentEmote = null;
    this.currentClip = "none";
    this.playbackSpeed = 1;
    this.previousAction = null;
    this.blendTarget = null;
    this.blendDuration = 0;
    this.blendElapsed = 0;
    this.deathLatched = false;
    this.setState(state);
    this.mixer.update(0);
  }

  isCurrentEmoteFinished() {
    if (this.currentState !== "EMOTING" || this.currentEmote?.behavior !== "ONE_SHOT") return false;
    const action = this.currentAction;
    if (!action) return true;
    return action.paused || (!action.isRunning() && action.time >= action.getClip().duration - 1e-3);
  }

  debugText() {
    const remaining = Math.max(0, this.blendDuration - this.blendElapsed);
    const dodging = this.currentState === "DODGE";
    const climbSpeed = this.climbGameplayActive ? `${this.playbackSpeed.toFixed(2)}x` : "inactive";
    const climbPlaying = Boolean(this.climbGameplayActive && this.currentState?.startsWith("CLIMB_") && this.currentAction?.isRunning());
    const climbAnimationState = this.climbGameplayActive ? this.currentState || "pending" : "inactive";
    const liveClimbClip = this.climbGameplayActive ? this.currentClip : "none";
    const climbPoseTime = this.climbGameplayActive && this.currentState === "CLIMB_IDLE" ? `${this.currentAction?.time.toFixed(3) || "0.000"}s${this.currentAction?.paused ? " (frozen)" : ""}` : "n/a";
    return `Animation        ${this.currentState || "PENDING"}\nAnimation clip   ${this.currentClip}\nPlayback speed   ${this.playbackSpeed.toFixed(2)}x\nClimb Gameplay Active ${Boolean(this.climbGameplayActive)}\nClimb Input X ${this.climbInputX.toFixed(0)}\nClimb Input Y ${this.climbInputY.toFixed(0)}\nClimb Direction ${this.climbGameplayActive ? this.climbInputDirection : "NONE"}\nClimb Anim State ${climbAnimationState}\nClimb Clip ${liveClimbClip}\nClimb Clip Playing ${climbPlaying}\nClimb Idle Pose Time ${climbPoseTime}\nClimb Playback Speed ${climbSpeed}\nClimb Surface ${this.climbSurfaceName || "none"}\nSword Hidden for Climb ${Boolean(this.swordHiddenForClimb)}\nPrevious action  ${this.previousAction?.getClip().name || "none"}\nBlend target     ${this.blendTarget || "none"}\nBlend remaining  ${remaining.toFixed(3)}s\nAction weight    ${this.currentAction?.getEffectiveWeight().toFixed(2) || "0.00"}\nOutgoing weight  ${this.previousAction?.getEffectiveWeight().toFixed(2) || "0.00"}\nDodge clip time  ${dodging ? `${this.currentAction?.time.toFixed(2) || "0.00"}s` : "inactive"}\nDodge start      ${PLAYER_ANIMATION_CONFIG.dodge.startOffset.toFixed(2)}s\nDodge rate       ${PLAYER_ANIMATION_CONFIG.dodge.playbackSpeedMultiplier.toFixed(2)}x multiplier`;
  }
}
