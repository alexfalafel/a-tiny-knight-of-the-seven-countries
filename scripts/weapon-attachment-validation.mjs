import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createServer } from 'vite';

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class { constructor(type, options = {}) { Object.assign(this, { type }, options); } };
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' });
try {
  const { PlayerVisual, PLAYER_WEAPON_CONFIG } = await server.ssrLoadModule('/src/PlayerVisual.js');
  PlayerVisual.prototype.loadProductionModel = function() {};
  PlayerVisual.prototype.loadOptionalSword = function() {};
  PlayerVisual.prototype.reportLoadedModel = function() {};
  const root = new THREE.Group(), visual = new PlayerVisual(root);
  const bytes = readFileSync('public/assets/models/player/rat-knight.glb');
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().register(() => ({ name: "HeadlessValidationTextures", loadTexture: () => Promise.resolve(new THREE.Texture()) })).parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', resolve, reject));
  root.position.z = 9.5;
  visual.installProductionModel(gltf);
  visual.setWeaponState("DRAWN", true);
  visual.animationController.update(.4);
  root.updateMatrixWorld(true);
  const { rightHand, weapon, weaponMount, weaponVisual } = visual.glbSockets;
  assert.equal(rightHand?.name, 'mixamorigRightHand', 'Use the actual production skeleton hand bone');
  assert.equal(weapon.parent, rightHand);
  assert.equal(weapon.name, 'WeaponSocket');
  assert.deepEqual(weapon.position.toArray(), PLAYER_WEAPON_CONFIG.socket.position);
  assert.deepEqual(weapon.rotation.toArray().slice(0, 3), PLAYER_WEAPON_CONFIG.socket.rotation);
  assert.equal(weaponMount.name, 'WeaponMount');
  assert.equal(weaponMount.parent, weapon);
  assert.equal(weaponVisual.name, 'WeaponVisual');
  assert.equal(weaponVisual.parent, weaponMount);
  assert.equal(visual.weaponVisual.parent, weaponMount);
  assert.equal(visual.sword.name, 'ProceduralKnightSword');
  assert.equal(visual.sword.parent, visual.weaponVisual);
  assert.equal(visual.sword.scale.x, PLAYER_WEAPON_CONFIG.fallback.modelTransform.scale);
  assert.equal(weaponMount.rotation.z, PLAYER_WEAPON_CONFIG.mount.rotation[2]);

  const handPosition = new THREE.Vector3(), mountOrigin = new THREE.Vector3();
  const worldGrip = () => {
    visual.importedModel.updateMatrixWorld(true);
    rightHand.getWorldPosition(handPosition);
    return weaponMount.getWorldPosition(mountOrigin).clone();
  };
  worldGrip();
  const gripGap = handPosition.distanceTo(mountOrigin);
  assert(gripGap > .09, 'Grip is beyond wrist origin in the rendered palm');
  visual.updateWeaponDebug();
  assert(visual.weaponDebug.palmGripDistance < 1e-6, 'Actual skinned palm center matches visible handle center');
  const blade = new THREE.Vector3(0,1,0).transformDirection(visual.sword.matrixWorld);
  assert(blade.toArray().every(Number.isFinite), 'Authored blade transform stays finite');
  const bladeFaceNormal = new THREE.Vector3(0,0,1).transformDirection(visual.sword.matrixWorld);
  const playerForward = new THREE.Vector3(0,0,-1);
  assert(blade.dot(playerForward) > .95, "approved idle blade points along player forward");
  // Forward/roll were subsequently approved; do not reimpose obsolete sword-down calibration.
  console.log('IDLE MEASUREMENT',JSON.stringify({palm:visual.weaponDebug.palmPosition.toArray(),grip:visual.weaponDebug.gripPosition.toArray(),distance:visual.weaponDebug.palmGripDistance,blade:blade.toArray(),bladeFaceNormal:bladeFaceNormal.toArray(),worldDown:[0,-1,0],playerForward:playerForward.toArray(),forwardDot:blade.dot(playerForward),faceDot:bladeFaceNormal.dot(playerForward)}));
  assert(visual.weaponVisual.position.length() < 1e-8, 'WeaponVisual starts at the mount grip origin');
  let visibleWeaponVisuals = 0;
  visual.root.traverse(object => {
    if (object.name !== 'WeaponVisual') return;
    let visible = object.visible;
    for (let parent=object.parent; parent; parent=parent.parent) visible &&= parent.visible;
    if (visible) visibleWeaponVisuals++;
  });
  assert.equal(visibleWeaponVisuals,1,'Only one weapon visual is in a visible scene branch');
  console.log(JSON.stringify({ hand: rightHand.name, hierarchy: 'mixamorigRightHand/WeaponSocket/WeaponMount/WeaponVisual',
    socket: { position: weapon.position.toArray(), rotation: weapon.rotation.toArray().slice(0,3), scale: weapon.scale.toArray() },
    mount: { position: weaponMount.position.toArray(), rotation: weaponMount.rotation.toArray().slice(0,3), scale: weaponMount.scale.toArray() },
    externalModelPath: PLAYER_WEAPON_CONFIG.externalModelPath, gripDistanceFromHand: gripGap }));

  const states = ['IDLE_ALL_FOURS','RUN_ALL_FOURS','AURA_WALK','IDLE_COMBAT','COMBAT_WALK','ATTACK_1','ATTACK_2','ATTACK_3','DODGE','JUMP','DEATH'];
  for (const state of states) {
    visual.setAnimationState(state, { moving: state.includes('WALK') || state.includes('RUN'), attackStep: Number(state.at(-1)) - 1 || 0, elapsed:0 });
    let maximumGap = 0;
    const frames = Math.ceil(visual.animationController.currentAction.getClip().duration * 60 / visual.animationController.playbackSpeed) + 15;
    for (let frame=0; frame<frames; frame++) {
      visual.animationController.update(1/60);
      visual.importedModel.updateMatrixWorld(true);
      visual.updateWeaponDebug();
      maximumGap = Math.max(maximumGap, visual.weaponDebug.palmGripDistance);
      assert(maximumGap < .003, state + ": full clip palm alignment");
    }
    assert.notEqual(visual.animationController.currentClip,'none',`${state}: production clip must be active`);
    const grip = worldGrip();
    assert.equal(visual.sword.parent, visual.weaponVisual, `${state}: sword remains under WeaponVisual`);
    assert.equal(visual.weaponVisual.parent, weaponMount, `${state}: WeaponVisual remains under WeaponMount`);
    assert(visual.weaponVisual.visible, `${state}: weapon remains visible`);
    assert([...grip.toArray()].every(Number.isFinite));
    visual.updateWeaponDebug();
    assert(visual.weaponDebug.palmGripDistance < .003, state + ': mesh palm remains aligned within 3 mm');
    console.log(state + ' full-clip maximum palm gap mm: ' + (maximumGap*1000).toFixed(6));
  }
  visual.setWeaponState('SHEATHED', false); visual.setAnimationState('CLIMB_UP'); assert(visual.weaponVisual.visible);
  assert.equal(visual.weaponVisual.parent, visual.backSheathCorrection);
  visual.setAnimationState('COMBAT_WALK'); assert(visual.weaponVisual.visible);
  visual.setAnimationState('SIT_THRONE'); assert(visual.weaponVisual.visible);
  visual.setAnimationState('IDLE_COMBAT'); assert(visual.weaponVisual.visible);

  visual.setWeaponState('DRAWN', true);
  const emptyExternal = new THREE.Group();
  visual.replaceSword(emptyExternal);
  assert.equal(visual.sword.name, 'ProceduralKnightSword', 'An empty/broken external model leaves the fallback weapon active');

  const external = new THREE.Group();
  external.add(new THREE.Mesh(new THREE.BoxGeometry(.1, .9, .2), new THREE.MeshStandardMaterial()));
  const authoredGrip = new THREE.Object3D(); authoredGrip.name="SwordGripPoint"; authoredGrip.position.set(.02,-.3,.01); external.add(authoredGrip);
  visual.replaceSword(external);
  assert.equal(visual.sword.name, 'ImportedSwordRoot');
  assert.equal(external.parent, visual.externalSwordRoot);
  assert.equal(visual.externalSwordRoot.parent, visual.weaponVisual);
  for (const [dimension, expected] of Object.entries({ width: .1, height: .9, depth: .2, largestDimension: .9 })) {
    assert(Math.abs(visual.weaponBounds[dimension] - expected) < 1e-6, `${dimension}: report imported GLB bounds accurately`);
  }
  assert(Math.abs(visual.weaponAutoScaleFactor - PLAYER_WEAPON_CONFIG.targetLength / .9) < 1e-6);
  assert.equal(visual.weaponVisual.children.length, 1, 'External import replaces the procedural fallback instead of duplicating it');
  assert.equal(typeof visual.adjustWeaponModel, 'undefined');
  assert.equal(typeof visual.saveWeaponCalibration, 'undefined');
  assert.equal(visual.weaponGripReference.name, 'SwordGripPoint');
  const importedGrip=visual.weaponGripReference.getWorldPosition(new THREE.Vector3());
  assert(importedGrip.distanceTo(weaponMount.getWorldPosition(new THREE.Vector3())) < 1e-6);
  console.log(`PASS: ${states.length} animated states follow the fixed WeaponSocket/WeaponMount hierarchy; external bounds normalize to target length, replace fallback, and use fixed model corrections without manual overrides.`);
} finally { await server.close(); }
