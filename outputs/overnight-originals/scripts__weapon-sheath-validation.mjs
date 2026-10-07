import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createServer } from "vite";

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class { constructor(type, options = {}) { Object.assign(this, { type }, options); } };

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "silent" });
try {
  const { PlayerVisual, PLAYER_WEAPON_CONFIG, WEAPON_STATES } = await server.ssrLoadModule("/src/PlayerVisual.js");
  PlayerVisual.prototype.loadProductionModel = function () {};
  PlayerVisual.prototype.loadOptionalSword = function () {};
  PlayerVisual.prototype.reportLoadedModel = function () {};

  const gameplayRoot = new THREE.Group();
  const visual = new PlayerVisual(gameplayRoot);
  const bytes = readFileSync("public/assets/models/player/rat-knight.glb");
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "", resolve, reject,
  ));
  visual.installProductionModel(gltf);
  visual.animationController.setState("IDLE_ALL_FOURS");
  for (let frame = 0; frame < 120; frame++) visual.animationController.update(1 / 60);

  const { weapon: handSocket, weaponMount: handMount, backSheathSocket, backSheathCorrection } = visual.glbSockets;
  assert.equal(visual.glbSockets.rightHand.name, "mixamorigRightHand");
  assert.equal(handSocket.parent, visual.glbSockets.rightHand);
  assert.deepEqual(handSocket.position.toArray(), PLAYER_WEAPON_CONFIG.socket.position);
  assert.deepEqual(handSocket.rotation.toArray().slice(0, 3), PLAYER_WEAPON_CONFIG.socket.rotation);
  assert.deepEqual(handMount.position.toArray(), PLAYER_WEAPON_CONFIG.mount.position);
  assert.deepEqual(handMount.rotation.toArray().slice(0, 3), PLAYER_WEAPON_CONFIG.mount.rotation);
  assert.equal(backSheathSocket.name, "BackSheathSocket");
  assert.equal(backSheathSocket.parent.name, "mixamorigSpine2");
  assert.equal(backSheathCorrection.name, "BackSheathCorrection");
  assert.equal(backSheathCorrection.parent, backSheathSocket);

  const sameVisual = visual.weaponVisual;
  const sameSword = visual.sword;
  const handGrip = () => {
    gameplayRoot.updateMatrixWorld(true);
    return visual.weaponGripReference.getWorldPosition(new THREE.Vector3());
  };
  const bladeDirection = () => new THREE.Vector3(0, 1, 0).transformDirection(visual.sword.matrixWorld);
  const vectorDistance = (a, b) => a.distanceTo(b);

  visual.setWeaponState(WEAPON_STATES.SHEATHED, false);
  gameplayRoot.updateMatrixWorld(true);
  assert.equal(sameVisual.parent, backSheathCorrection);
  assert.equal(sameSword.parent, sameVisual);
  const backGrip = handGrip();
  const backDirection = bladeDirection();
  const backBoneOrigin = backSheathSocket.parent.getWorldPosition(new THREE.Vector3());
  const expectedBackDirection = new THREE.Vector3(-0.4, -Math.sqrt(1 - 0.4 ** 2), 0);
  assert(backDirection.dot(expectedBackDirection) > 0.98, `Back blade axis should lie diagonally down across the back: ${backDirection.toArray()}`);
  assert(backGrip.y > 0.9, "Back mount grip remains near the upper torso");
  const gripOffsetFromSpine = backGrip.z - backBoneOrigin.z;
  assert(gripOffsetFromSpine > 0.05 && gripOffsetFromSpine < 0.18, `Back grip stays close behind Spine2 without floating: ${gripOffsetFromSpine.toFixed(3)}m`);

  visual.setWeaponState(WEAPON_STATES.DRAWN, true);
  gameplayRoot.updateMatrixWorld(true);
  assert.equal(sameVisual.parent, handMount);
  const firstHandGrip = handGrip();
  const firstHandDirection = bladeDirection();
  const handSocketPosition = handSocket.position.toArray();
  const handSocketRotation = handSocket.rotation.toArray().slice(0, 3);
  const handMountPosition = handMount.position.toArray();
  const handMountRotation = handMount.rotation.toArray().slice(0, 3);

  for (let cycle = 0; cycle < 20; cycle++) {
    visual.setWeaponState(WEAPON_STATES.SHEATHED, false);
    gameplayRoot.updateMatrixWorld(true);
    assert.equal(sameVisual.parent, backSheathCorrection, `Cycle ${cycle + 1}: same visual returns to back`);
    assert.equal(sameSword.parent, sameVisual);
    assert(visual.weaponVisual.visible);
    assert.equal(visual.weaponVisual.children.length, 1, "Exactly one sword visual remains mounted");
    assert(vectorDistance(handGrip(), backGrip) < 1e-9, `Cycle ${cycle + 1}: back grip does not drift`);
    assert(vectorDistance(bladeDirection(), backDirection) < 1e-9, `Cycle ${cycle + 1}: back rotation does not drift`);

    visual.setWeaponState(WEAPON_STATES.DRAWN, true);
    gameplayRoot.updateMatrixWorld(true);
    assert.equal(sameVisual.parent, handMount, `Cycle ${cycle + 1}: same visual returns to hand`);
    assert(vectorDistance(handGrip(), firstHandGrip) < 1e-9, `Cycle ${cycle + 1}: hand grip does not drift`);
    assert(vectorDistance(bladeDirection(), firstHandDirection) < 1e-9, `Cycle ${cycle + 1}: hand orientation does not drift`);
  }
  assert.deepEqual(handSocket.position.toArray(), handSocketPosition);
  assert.deepEqual(handSocket.rotation.toArray().slice(0, 3), handSocketRotation);
  assert.deepEqual(handMount.position.toArray(), handMountPosition);
  assert.deepEqual(handMount.rotation.toArray().slice(0, 3), handMountRotation);

  const { PlayerController, STATES } = await server.ssrLoadModule("/src/PlayerController.js");
  const resolve = ({ state = STATES.RUN, combatTimer = 0, attackActive = false, externalCombatActive = false, inFinale = false, alive = true } = {}) => {
    const controller = Object.create(PlayerController.prototype);
    Object.assign(controller, { state, combatTimer, attackActive, externalCombatActive, inFinale, alive });
    return controller.resolveWeaponState();
  };
  for (const state of [STATES.RUN, STATES.AURA_WALK, STATES.AIRBORNE, STATES.DODGE, STATES.HEALING]) {
    assert.equal(resolve({ state }), WEAPON_STATES.SHEATHED, `${state} outside combat is sheathed`);
  }
  assert.equal(resolve({ state: STATES.EMOTING }), WEAPON_STATES.SHEATHED, "Emotes are always sheathed");
  assert.equal(resolve({ state: STATES.CLIMB }), WEAPON_STATES.SHEATHED, "Climb states are always sheathed");
  assert.equal(resolve({ state: STATES.RUN, inFinale: true }), WEAPON_STATES.SHEATHED, "Noncombat scripted finale is sheathed");
  assert.equal(resolve({ state: STATES.COMBAT, combatTimer: 1 }), WEAPON_STATES.DRAWN, "Combat timer draws the sword");
  assert.equal(resolve({ state: STATES.ATTACK, attackActive: true }), WEAPON_STATES.DRAWN, "Active attack draws the sword");
  assert.equal(resolve({ state: STATES.RUN, externalCombatActive: true }), WEAPON_STATES.DRAWN, "Lock-on or active boss context draws the sword");
  assert.equal(resolve({ state: STATES.DODGE, externalCombatActive: true }), WEAPON_STATES.DRAWN, "Combat dodge stays drawn");
  assert.equal(resolve({ state: STATES.RUN, inFinale: true, externalCombatActive: true }), WEAPON_STATES.DRAWN, "Active boss combat overrides scripted-finale sheathing");
  assert.equal(resolve({ state: STATES.COMBAT, combatTimer: 1, alive: false }), WEAPON_STATES.SHEATHED, "Dead players are sheathed");

  console.log(JSON.stringify({
    backBone: backSheathSocket.parent.name,
    backSocket: { position: backSheathSocket.position.toArray(), rotation: backSheathSocket.rotation.toArray().slice(0, 3) },
    backCorrection: { position: backSheathCorrection.position.toArray(), rotation: backSheathCorrection.rotation.toArray().slice(0, 3), scale: backSheathCorrection.scale.toArray() },
    backGripWorld: backGrip.toArray(), backBladeWorld: backDirection.toArray(),
    handSocket: { position: handSocket.position.toArray(), rotation: handSocket.rotation.toArray().slice(0, 3) },
    handMount: { position: handMount.position.toArray(), rotation: handMount.rotation.toArray().slice(0, 3) },
    swordObjects: visual.weaponVisual.children.length, transitions: 20, statePolicyChecks: 11,
    backTransformDrift: 0, handTransformDrift: 0,
  }, null, 2));
  console.log("PASS: production skeleton mounts, diagonal back orientation, unchanged hand transforms, single sword object, and 20 no-drift mount cycles.");
} finally {
  await server.close();
}
