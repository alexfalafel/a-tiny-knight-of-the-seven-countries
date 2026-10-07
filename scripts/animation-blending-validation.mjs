import assert from "node:assert/strict";
import * as THREE from "three";
import { createServer } from "vite";

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
try {
  const { PlayerAnimationController, playerAnimationBlendDuration, PLAYER_ANIMATION_CONFIG } = await server.ssrLoadModule("/src/PlayerAnimationController.js");
  const { PlayerVisual } = await server.ssrLoadModule("/src/PlayerVisual.js");
  PlayerVisual.prototype.loadProductionModel = function() {};
  PlayerVisual.prototype.loadOptionalSword = function() {};
  const { PlayerController } = await server.ssrLoadModule("/src/PlayerController.js");
  const clips = [
    "01a10fae-d4d5-72e5-ace6-cc830b78946c", "Running", "Walking", "Attack", "Triple_Combo_Attack",
    "01a10fb1-42e0-70de-9628-735b3ef4e968", "01a10fb1-fc3c-70a3-b564-88cda0588813",
    "01a10fb2-e41c-77fc-a7c5-2cc1ac53b709", "Alert",
  ].map((name, index) => new THREE.AnimationClip(name,
    name === "01a10fb1-42e0-70de-9628-735b3ef4e968" || name === "01a10fb1-fc3c-70a3-b564-88cda0588813" ? 2.042 : index === 2 ? 2 : 1, [
    new THREE.NumberKeyframeTrack(".position[y]", [0, 1], [index, index + 1]),
  ]));
  const root = new THREE.Group();
  const controller = new PlayerAnimationController(root, clips, { rootBoneName: "Root" });
  const step = (duration) => controller.update(duration);

  controller.setState("IDLE_ALL_FOURS"); step(.25);
  const idleAction = controller.currentAction;
  idleAction.time = .4;
  controller.setState("RUN_ALL_FOURS");
  assert.equal(controller.blendDuration, .18);
  assert.equal(controller.previousAction, idleAction);
  step(.06);
  assert(idleAction.getEffectiveWeight() > 0 && idleAction.getEffectiveWeight() < 1, "outgoing action fades smoothly");
  assert(controller.currentAction.getEffectiveWeight() > 0 && controller.currentAction.getEffectiveWeight() < 1, "incoming action fades smoothly");
  step(.2);
  assert.equal(controller.previousAction, null, "outgoing actions are stopped after their blend");
  assert.equal(idleAction.isRunning(), false);

  controller.setState("COMBAT_WALK"); step(.25);
  const walkAction = controller.currentAction;
  walkAction.time = .5;
  controller.setState("RUN_ALL_FOURS");
  assert(Math.abs(controller.currentAction.time - .25) < 1e-6, "gait phase maps between different clip lengths");
  step(.2);

  controller.setState("ATTACK_1");
  assert.equal(controller.blendDuration, .1, "locomotion enters attack quickly"); step(.12);
  controller.setState("ATTACK_2");
  assert.equal(controller.blendDuration, .08, "attack combo transition is short"); step(.03);
  const comboAction = controller.currentAction;
  const comboTime = comboAction.time;
  controller.setState("ATTACK_3");
  assert.equal(controller.currentAction, comboAction, "Attack 2 -> Attack 3 stays on the shared combo action");
  assert.notEqual(controller.previousAction?.getClip().name, "01a10fae-d4d5-72e5-ace6-cc830b78946c", "shared combo action never crossfades through Idle");
  assert.equal(controller.currentAction.time, comboTime, "shared combo action does not restart");
  controller.setState("ATTACK_1");
  assert.equal(controller.blendDuration, .1, "Attack 3 -> Attack 1 crossfades directly"); step(.2);
  controller.setState("IDLE_COMBAT");
  assert.equal(controller.blendDuration, .15, "attack release returns with a short blend"); step(.2);

  controller.setState("DODGE"); assert.equal(controller.blendDuration, .06); assert.equal(PLAYER_ANIMATION_CONFIG.dodge.playbackSpeedMultiplier, .45);
  assert.equal(PLAYER_ANIMATION_CONFIG.dodge.startOffset, .16);
  assert.equal(controller.playbackSpeed, 1.35, "production Dodge clip uses the configured 0.45 playback multiplier");
  assert.equal(controller.currentAction.time, .16, "Dodge starts at its configured evasive-motion offset");
  step(.05);
  assert(Math.abs(controller.currentAction.time - (.16 + .05 * controller.playbackSpeed)) < 1e-6, "Dodge advances naturally from the offset");
  const dodgeTime = controller.currentAction.time;
  controller.setState("DODGE");
  assert.equal(controller.currentAction.time, dodgeTime, "repeated DODGE state does not restart its clip");
  controller.setState("RUN_ALL_FOURS"); assert.equal(controller.blendDuration, .13); step(.2);
  controller.setState("DODGE"); assert.equal(controller.currentAction.time, .16, "a later legal Dodge starts fresh at its offset"); step(.2);
  controller.setState("RUN_ALL_FOURS"); step(.2);
  controller.setState("JUMP"); assert.equal(controller.blendDuration, .1); assert.equal(PLAYER_ANIMATION_CONFIG.jump.playbackSpeedMultiplier, .5);
  assert(Math.abs(controller.playbackSpeed - (2.042 / .66 * .5)) < 1e-9, "production Jump clip uses half of its previous playback rate"); step(.2);
  assert.equal(PLAYER_ANIMATION_CONFIG.jump.startOffset, .6);
  assert(Math.abs(controller.currentAction.time - .6 - .2 * controller.playbackSpeed) < 1e-6, "Jump advances from the takeoff offset at its configured speed");
  const jumpTime = controller.currentAction.time;
  controller.setState("JUMP");
  assert.equal(controller.currentAction.time, jumpTime, "repeated JUMP state does not reset its clip time");
  controller.setState("LAND"); assert.equal(controller.blendDuration, .15); step(.2);
  controller.setState("JUMP");
  assert.equal(controller.currentAction.time, .6, "a repeated jump after landing starts again at takeoff offset");

  controller.setState("DEATH"); assert.equal(controller.blendDuration, .07); step(.1);
  const deathAction = controller.currentAction;
  controller.setState("RUN_ALL_FOURS");
  assert.equal(controller.currentAction, deathAction, "Death cannot be interrupted before reset");
  controller.reset("IDLE_ALL_FOURS");
  assert.equal(controller.currentState, "IDLE_ALL_FOURS", "reset clears the Death latch");
  assert.equal(controller.currentAction.getEffectiveWeight(), 1, "reset action starts at full weight");

  assert.equal(playerAnimationBlendDuration("IDLE_ALL_FOURS", "AURA_WALK"), .23);
  assert.equal(playerAnimationBlendDuration("AURA_WALK", "IDLE_ALL_FOURS"), .23);
  assert.equal(playerAnimationBlendDuration("RUN_ALL_FOURS", "DODGE"), .06);
  assert.equal(playerAnimationBlendDuration("DODGE", "RUN_ALL_FOURS"), .13);

  const scene = new THREE.Scene();
  const player = new PlayerController(scene, new THREE.Vector3(), [], null);
  const dodgeEvents = [];
  player.visual.animationController = { setState: (state) => dodgeEvents.push(state), update() {} };
  const input = { keys: new Set(["KeyQ"]), consume(key) { return this.keys.delete(key); }, down() { return false; }, consumeAttack() { return false; }, attackHeld: false };
  const camera = { forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) };
  const originalMoveAndCollide = player.moveAndCollide.bind(player);
  player.moveAndCollide = (dt) => {
    assert.equal(dodgeEvents.at(-1), "DODGE", "accepted Q starts the visual action before the movement step");
    originalMoveAndCollide(dt);
  };
  player.update(1 / 60, input, camera);
  assert.equal(player.visualState, "DODGE");
  assert.equal(player.dodgeTimer, .24, "animation event leaves gameplay dodge duration unchanged");
  assert.equal(player.dodgeCooldown, .72, "animation event leaves gameplay cooldown unchanged");
  assert.deepEqual(player.dodgeDirection.toArray(), [0, 0, -1], "animation event preserves directional input");
  console.log("PASS: locomotion, combo, dodge, jump, landing, Death, phase sync, and same-action no-restart transitions validated.");
} finally {
  await server.close();
}
