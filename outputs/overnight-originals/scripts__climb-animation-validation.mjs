import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createServer } from "vite";

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class ProgressEvent { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } };

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
try {
  const { PLAYER_ANIMATION_CLIPS, PLAYER_ANIMATION_CONFIG, PlayerAnimationController, playerAnimationBlendDuration } = await server.ssrLoadModule("/src/PlayerAnimationController.js");
  const { PlayerVisual } = await server.ssrLoadModule("/src/PlayerVisual.js");
  PlayerVisual.prototype.loadProductionModel = function() {};
  PlayerVisual.prototype.loadOptionalSword = function() {};
  const { PlayerController } = await server.ssrLoadModule("/src/PlayerController.js");
  const { createTestLevel } = await server.ssrLoadModule("/src/TestLevel.js");
  const inspection = JSON.parse(readFileSync("docs/player-glb-inspection.json", "utf8"));
  const clips = Object.fromEntries(inspection.animations.map((clip) => [clip.name, clip.durationSeconds]));
  const expected = {
    CLIMB_UP: "climbing_up_wall",
    CLIMB_DOWN: "climbing_down_wall",
    CLIMB_LEFT: "Climb_Left_with_Both_Limbs_inplace",
    CLIMB_RIGHT: "Climb_Right_with_Both_Limbs_inplace",
  };
  for (const [state, name] of Object.entries(expected)) {
    assert.equal(PLAYER_ANIMATION_CLIPS[state], name);
    assert(clips[name] > 0, `${name} exists in the inspected production GLB`);
  }
  assert.deepEqual(Object.values(expected).map((name) => clips[name]), [2, 2, 1.208, 1.208]);
  assert.deepEqual(PLAYER_ANIMATION_CONFIG.climb, {
    upPlaybackSpeed: 1, downPlaybackSpeed: 1, leftPlaybackSpeed: 1,
    rightPlaybackSpeed: 1, idlePoseNormalizedTime: .335, directionHysteresis: .15,
  });
  assert.equal(playerAnimationBlendDuration("IDLE_ALL_FOURS", "CLIMB_IDLE"), .12);
  assert.equal(playerAnimationBlendDuration("CLIMB_IDLE", "CLIMB_UP"), .12);
  assert.equal(playerAnimationBlendDuration("CLIMB_UP", "CLIMB_LEFT"), .1);
  assert.equal(playerAnimationBlendDuration("CLIMB_LEFT", "FALL"), .12);

  const motionClips = Object.entries(expected).map(([state, name]) => new THREE.AnimationClip(name, clips[name], [
    new THREE.VectorKeyframeTrack("mixamorigHips.position", [0, clips[name]], [0, 0, 0, .12, .2, -.12]),
  ]));
  const animationRoot = new THREE.Group();
  const hips = new THREE.Object3D(); hips.name = "mixamorigHips"; animationRoot.add(hips);
  const animation = new PlayerAnimationController(animationRoot, motionClips);
  for (const [state, name] of Object.entries(expected)) {
    animation.setState(state);
    assert.equal(animation.currentClip, name);
    assert.equal(animation.playbackSpeed, 1);
    assert.equal(animation.currentAction.loop, THREE.LoopRepeat);
  }
  for (const clip of motionClips) {
    const values = clip.tracks[0].values;
    assert.equal(values[0], values[3], `${clip.name} Hips X root motion is neutralized`);
    assert.equal(values[2], values[5], `${clip.name} Hips Z root motion is neutralized`);
  }

  const glbBytes = readFileSync("public/assets/models/player/rat-knight.glb");
  const glbBuffer = glbBytes.buffer.slice(glbBytes.byteOffset, glbBytes.byteOffset + glbBytes.byteLength);
  const actualGltf = await new Promise((resolve, reject) => new GLTFLoader().parse(glbBuffer, "", resolve, reject));
  const actualAnimation = new PlayerAnimationController(actualGltf.scene, actualGltf.animations);
  for (const [state, name] of Object.entries(expected)) {
    actualAnimation.setState(state);
    assert.equal(actualAnimation.currentState, state);
    assert.equal(actualAnimation.currentClip, name, `${state} resolves to its production GLB clip`);
    assert.equal(actualAnimation.currentAction.loop, THREE.LoopRepeat, `${state} loops`);
    const action = actualAnimation.currentAction;
    actualAnimation.update(.04);
    const timeBeforeSameState = action.time;
    actualAnimation.setState(state);
    assert.equal(actualAnimation.currentAction, action, `${state} keeps the same action instance while held`);
    assert.equal(action.time, timeBeforeSameState, `${state} is not reset while held`);
  }
  actualAnimation.setState("CLIMB_IDLE");
  const frozenClimbAction = actualAnimation.currentAction;
  assert.equal(actualAnimation.currentState, "CLIMB_IDLE");
  assert.equal(actualAnimation.climbIdleSourceClipName, "climbing_up_wall");
  assert.equal(frozenClimbAction.getClip().name, "climbing_up_wall__frozen_cling_pose");
  assert.equal(frozenClimbAction.paused, true, "CLIMB_IDLE holds the dedicated frozen action");
  assert.equal(frozenClimbAction.loop, THREE.LoopOnce, "the cling pose is not set to loop");
  assert(Math.abs(frozenClimbAction.time - .67) < 1e-6, "the selected contact frame is at 0.67 seconds");
  actualAnimation.update(10);
  assert.equal(frozenClimbAction.time, .67, "a long idle does not advance or replay the frozen pose");
  actualAnimation.setState("CLIMB_UP");
  assert.notEqual(actualAnimation.currentAction, frozenClimbAction, "upward movement resumes on the live directional action");
  assert.equal(actualAnimation.currentAction.paused, false, "the live upward action is unpaused");
  actualAnimation.update(.2);
  assert(actualAnimation.currentAction.time > 0, "the upward clip advances after leaving the frozen idle");
  const actualRootMotion = [];
  for (const name of Object.values(expected)) {
    const clip = actualGltf.animations.find((entry) => entry.name === name);
    const hipsTrack = clip.tracks.find((track) => /(?:^|\.)mixamorigHips\.position$/i.test(track.name));
    assert(hipsTrack, `${name} has a Hips position track in the real GLB`);
    const verticalValues = [];
    for (let i = 1; i < hipsTrack.values.length; i += 3) verticalValues.push(hipsTrack.values[i]);
    const verticalRange = Math.max(...verticalValues) - Math.min(...verticalValues);
    const verticalEndpointDelta = verticalValues.at(-1) - verticalValues[0];
    const removed = actualAnimation.rootMotionRemoved.find((entry) => entry.clip === name);
    actualRootMotion.push({ name, duration: clip.duration, horizontalRemoved: removed?.maxMeters || 0, hipVerticalRange: Number(verticalRange.toFixed(3)), hipVerticalEndpointDelta: Number(verticalEndpointDelta.toFixed(3)) });
    assert(removed?.maxMeters > 0, `${name} horizontal Hips drift is neutralized by the production animation controller`);
  }

  const scene = new THREE.Scene();
  const level = createTestLevel(scene);
  const player = new PlayerController(scene, new THREE.Vector3(6.5, 0, -.5), level.rooms.get("greatHall").colliders, level.climbables);
  player.climbableSurfaces = level.climbablesForRoom("greatHall");
  player.group.rotation.y = -Math.PI / 2;
  player.visual.animationController = actualAnimation;
  const input = {
    keys: new Set(), pressed: new Set(), lastPressedDirection: null,
    down(code) { return this.keys.has(code); },
    consume(code) { const wasPressed = this.pressed.has(code); this.pressed.delete(code); return wasPressed; },
    consumeAttack() { return false; },
    press(code) { this.keys.add(code); this.pressed.add(code); this.lastPressedDirection = code; },
    release(code) { this.keys.delete(code); },
  };
  const camera = { forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) };
  player.auraWalk = true;
  player.update(1 / 60, input, camera);
  assert(player.nearbyClimbable, "the production Great Hall panel is in reach and facing-aligned");
  input.press("KeyE");
  if (input.consume("KeyE") && player.nearbyClimbable) player.beginClimb(player.nearbyClimbable);
  assert.equal(player.state, "CLIMB");
  assert.equal(player.climbTarget.object.userData.climbable, true, "E attaches to the real registered Great Hall climb panel");
  assert.equal(player.auraWalk, true, "climbing suppresses Aura animation without changing Aura mode");
  const directions = [
    ["KeyW", "UP"], ["KeyS", "DOWN"], ["KeyA", "LEFT"], ["KeyD", "RIGHT"],
    ["KeyW", "UP"], ["KeyA", "LEFT"], ["KeyW", "UP"], ["KeyD", "RIGHT"],
  ];
  for (const [key, direction] of directions) {
    input.keys.clear(); input.pressed.clear(); input.press(key);
    player.update(1 / 60, input, camera);
    assert.equal(player.climbInputDirection, direction);
    assert.equal(player.climbVisualState, `CLIMB_${direction}`);
    assert.equal(player.state, "CLIMB", "directional visual state does not replace gameplay CLIMB mode");
    player.updateVisual(1 / 60);
    assert.equal(actualAnimation.currentState, `CLIMB_${direction}`);
    assert.equal(actualAnimation.currentClip, expected[`CLIMB_${direction}`]);
  }
  const heldAction = actualAnimation.currentAction;
  const heldTime = heldAction.time;
  player.updateVisual(1 / 60);
  assert.equal(actualAnimation.currentAction, heldAction, "same directional state does not restart its action");
  assert(heldAction.time > heldTime, "held directional animation continues advancing");
  player.visualTransient = "DAMAGE"; player.visualTransientTimer = .38;
  player.updateVisual(1 / 60);
  assert.equal(player.visual.state, "CLIMB_RIGHT", "generic transient visuals cannot override an attached climb direction");
  input.keys.clear(); input.pressed.clear();
  player.update(1 / 60, input, camera);
  assert.equal(player.climbVisualState, "CLIMB_IDLE");
  player.updateVisual(1 / 60);
  assert.equal(actualAnimation.currentState, "CLIMB_IDLE");
  assert.equal(player.climbMoveSpeed, 2.35, "visual integration leaves gameplay climb speed unchanged");

  const swordVisibleBeforeClimbStateChecks = player.visual.weaponVisual.visible;
  for (const state of ["CLIMB_IDLE", "CLIMB_UP", "CLIMB_DOWN", "CLIMB_LEFT", "CLIMB_RIGHT"]) {
    player.visual.setAnimationState(state);
    assert.equal(player.visual.weaponVisual.visible, swordVisibleBeforeClimbStateChecks, `${state} leaves the existing sword visibility policy untouched`);
  }
  player.visual.setAnimationState("CLIMB_JUMP");
  assert.equal(player.visual.weaponVisual.visible, true, "sword returns immediately for climb-jump/airborne presentation");
  player.visual.setAnimationState("FALL");
  assert.equal(player.visual.weaponVisual.visible, true, "sword remains visible after detach");

  const staminaBeforeClimbJump = player.climbStamina;
  input.keys.clear(); input.pressed.clear(); input.press("Space");
  player.update(1 / 60, input, camera);
  assert.equal(player.state, "AIRBORNE");
  assert.equal(player.climbTarget, null);
  assert.equal(player.visualTransient, "CLIMB_JUMP");
  assert.equal(player.climbStamina, staminaBeforeClimbJump - 28, "existing climb-jump stamina cost remains unchanged");

  console.log(`Production GLB root motion: ${JSON.stringify(actualRootMotion)}`);
  console.log("PASS: GLB clip identity/duration, directional state mapping, playback, looping, root-motion cleanup, diagonal stability, Aura preservation, attach/detach blends, sword visibility, and climb-jump transition.");
} finally {
  await server.close();
}
