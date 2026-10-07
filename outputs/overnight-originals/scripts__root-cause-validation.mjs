import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFallbackRig, PlayerVisual } from '../src/PlayerVisual.js';
import { PlayerController } from '../src/PlayerController.js';
import { ThirdPersonCamera } from '../src/ThirdPersonCamera.js';
import { createTestLevel } from '../src/TestLevel.js';
import { DormantGroup } from '../src/SceneOptimization.js';
import { SceneInventory } from '../src/PerformanceDiagnostics.js';
import { InputManager } from '../src/InputManager.js';
import { EnemyController } from '../src/EnemyController.js';
import { CombatEncounter } from '../src/CombatEncounter.js';
import { ArmoredBeetleBoss } from '../src/ArmoredBeetleBoss.js';
import { ArmoredRatKnightBoss } from '../src/ArmoredRatKnightBoss.js';
import { FinaleSequence } from '../src/FinaleSequence.js';
import { ProgressionManager } from '../src/ProgressionManager.js';
import { EndingProgression } from '../src/EndingProgression.js';
import { RoomManager } from '../src/RoomManager.js';

function vertexSummary(root) {
  root.updateMatrixWorld(true);
  const byMaterial = new Map(), point = new THREE.Vector3();
  root.traverse(object => {
    if (!object.isMesh) return;
    const json = object.material.toJSON(); delete json.uuid;
    const key = JSON.stringify(json);
    let entry = byMaterial.get(key);
    if (!entry) byMaterial.set(key, entry = { count: 0, sum: new THREE.Vector3(), bounds: new THREE.Box3() });
    const position = object.geometry.attributes.position, indices = object.geometry.index;
    for (let i = 0; i < (indices?.count || position.count); i++) {
      point.fromBufferAttribute(position, indices ? indices.getX(i) : i).applyMatrix4(object.matrixWorld);
      entry.count++; entry.sum.add(point); entry.bounds.expandByPoint(point);
    }
  });
  return byMaterial;
}
const original = createFallbackRig(new THREE.Group(), { batch: false });
const batched = createFallbackRig(new THREE.Group());
original.sheathSocket.add(original.sword); batched.sheathSocket.add(batched.sword);
for (let pose = 0; pose < 12; pose++) {
  for (const rig of [original, batched]) {
    rig.torso.rotation.set(pose * .13, 0, pose * .03);
    rig.head.rotation.x = pose * .08;
    rig.limbPivots.forEach((limb, i) => { limb.pivot.rotation.x = pose * .05 + i * .4; });
    rig.tailSegments.forEach((segment, i) => { segment.rotation.y = pose * .03 + i * .01; });
    if (pose % 2) rig.weaponSocket.add(rig.sword); else rig.sheathSocket.add(rig.sword);
  }
  const before = vertexSummary(original.root), after = vertexSummary(batched.root);
  assert.equal(before.size, after.size);
  for (const [key, a] of before) {
    const b = after.get(key); assert(b); assert.equal(a.count, b.count);
    assert(a.sum.distanceTo(b.sum) < .01);
    assert(a.bounds.min.distanceTo(b.bounds.min) < .00001);
    assert(a.bounds.max.distanceTo(b.bounds.max) < .00001);
  }
}
console.log('PASS rigid batches: identical triangles/materials and world bounds across 12 articulated poses and sword reparenting');

// Listener setup/disposal with native EventTarget; no browser rendering simulated.
class CountedTarget extends EventTarget {
  constructor() { super(); this.listeners = new Set(); }
  addEventListener(type, handler) { super.addEventListener(type, handler); this.listeners.add(handler); }
  removeEventListener(type, handler) { super.removeEventListener(type, handler); this.listeners.delete(handler); }
}
globalThis.window = new CountedTarget(); globalThis.document = new CountedTarget();
for (let i = 0; i < 20; i++) { const manager = new InputManager({}, () => {}); manager.dispose(); }
assert.equal(window.listeners.size + document.listeners.size, 0);
console.log('PASS 20 InputManager setup/disposal cycles leave zero listeners');

PlayerVisual.prototype.loadProductionModel = function () {}; // Only skip browser GLB I/O.
const scene = new THREE.Scene(), level = createTestLevel(scene);
const player = new PlayerController(scene, level.spawn, level.collidersNear, level.climbables);
const camera = new ThirdPersonCamera(new THREE.PerspectiveCamera());
const progression = new ProgressionManager(), endings = new EndingProgression();
const rooms = new RoomManager(level.rooms, level.tunnels, progression, level.connections);
const enemy = new EnemyController(scene, new THREE.Vector3(0, 0, 7.5));
const beetle = new ArmoredBeetleBoss(scene, { spawn: level.armoryBossSpawn, arenaBounds: level.armoryArenaBounds });
const rat = new ArmoredRatKnightBoss(scene, { spawn: level.royalChambersBossSpawn, arenaBounds: level.royalChambersArenaBounds });
const uiNode = () => ({ textContent: '', innerHTML: '', style: {}, querySelector: () => uiNode(), classList: { add() {}, remove() {}, toggle() {} } });
const ui = Object.fromEntries(['choice', 'endingText', 'results', 'secretResults', 'endingDim', 'bossHealth', 'resultCrown', 'resultBeetle', 'resultRat', 'secretResultCrown', 'secretResultBeetle', 'secretResultRat', 'secretResultDragon'].map(key => [key, uiNode()]));
const input = { consume: () => false, consumeAttack: () => false, down: () => false, clear() {}, clearActions() {} };
const finale = new FinaleSequence({ scene, player, camera, progression, endings, throneCrown: level.throneCrown, keyLight: new THREE.DirectionalLight(), input, ui });
const sleeping = new DormantGroup(); scene.add(sleeping);
sleeping.add(beetle.group, rat.group, finale.queen, finale.dragon); sleeping.visible = false;
for (const room of level.rooms.values()) room.group.visible = room.id === 'greatHall';
let visits = 0;
const normalUpdate = THREE.Object3D.prototype.updateMatrixWorld;
THREE.Object3D.prototype.updateMatrixWorld = function(force) { visits++; return normalUpdate.call(this, force); };
scene.updateMatrixWorld(true); const sleepingVisits = visits;
const dormantUpdate = DormantGroup.prototype.updateMatrixWorld;
DormantGroup.prototype.updateMatrixWorld = THREE.Object3D.prototype.updateMatrixWorld;
visits = 0; scene.updateMatrixWorld(true); const awakeVisits = visits;
DormantGroup.prototype.updateMatrixWorld = dormantUpdate;
THREE.Object3D.prototype.updateMatrixWorld = normalUpdate;
assert(sleepingVisits < awakeVisits);
const hiddenWorld = beetle.group.matrixWorld.clone(); beetle.group.position.x += 2;
scene.updateMatrixWorld(true); assert(beetle.group.matrixWorld.equals(hiddenWorld));
sleeping.visible = true; scene.updateMatrixWorld(true); assert(!beetle.group.matrixWorld.equals(hiddenWorld));
console.log(`PASS sleeping hierarchy visits ${awakeVisits} -> ${sleepingVisits}; wake restores current transforms (test scene excludes main UI/debug nodes)`);

const combat = new CombatEncounter(player, enemy);
player.group.rotation.y = 0; player.attackImpactSerial = 1;
assert(combat.resolveAttack([enemy])); assert.equal(enemy.health, 7);
const surface = level.climbablesForRoom('greatHall')[0];
player.reset(); player.group.position.copy(surface.origin).addScaledVector(surface.normal, .6);
player.beginClimb(surface);
assert.equal(player.climbTarget, surface);
for (let i = 0; i < 60; i++) player.updateClimbing(1 / 60, input);
assert.equal(player.state, 'CLIMB'); player.detachFromClimb(); assert.notEqual(player.state, 'CLIMB');
for (const room of level.rooms.values()) {
  player.teleport(room.spawn); rooms.currentRoomId = room.id;
  const tunnel = rooms.nearbyTunnel(level.rooms.get(room.id).tunnel.position, room.id);
  assert(tunnel); rooms.discover(tunnel);
}
assert(rooms.destinations().length >= 5);
for (const boss of [beetle, rat]) {
  player.teleport(boss.spawn); player.group.position.z += 3;
  for (let i = 0; i < 240; i++) boss.update(1 / 60, player);
  assert(boss.isActive); boss.resetToIdle();
}
console.log('PASS combat damage, climb/detach, all-room tunnel discovery/travel spawns, both guardians update/reset');

progression.prepareFinaleDebugState(); player.teleport(level.throneRoomDebugSpawn);
assert(finale.start());
for (let i = 0; i < 600 && !finale.choiceReady; i++) { finale.update(1 / 60); player.updateVisual(1 / 60); }
assert(finale.choiceReady); finale.chooseGive();
for (let i = 0; i < 1200 && finale.phase !== 'GOOD_RESULTS'; i++) { finale.update(1 / 60); player.updateVisual(1 / 60); }
assert.equal(finale.phase, 'GOOD_RESULTS');
// Reinitialize branch state using existing debug/reset entry point; same rig/crown.
endings.reset(); finale.phase = 'IDLE'; finale.choiceReady = false;
player.teleport(level.throneRoomDebugSpawn); assert(finale.start());
for (let i = 0; i < 600 && !finale.choiceReady; i++) finale.update(1 / 60);
finale.chooseClaim();
for (let i = 0; i < 1200 && !finale.dragonBoss.isActive; i++) { finale.update(1 / 60); player.updateVisual(1 / 60); }
assert(finale.dragonBoss.isActive);
for (let i = 0; i < 600; i++) finale.dragonBoss.update(1 / 60, player);
finale.dragonBoss.setForcedVulnerable(true);
for (let i = 0; i < 30 && !finale.dragonBoss.isDead; i++) finale.dragonBoss.receiveSwordHit({ damage: 3, comboStep: 2 });
assert(finale.dragonBoss.isDead);
endings.dragonDefeated = true; endings.completeSecret(); finale.startDragonDeath();
for (let i = 0; i < 3600 && finale.phase !== 'SECRET_RESULTS'; i++) { finale.update(1 / 60); player.updateVisual(1 / 60); }
assert.equal(finale.phase, 'SECRET_RESULTS');
console.log('PASS both throne choices, dragon activation/AI/death, good and Tiny King ending sequences with batched rig');
console.log('Final scene inventory (test scene, not browser frame):', new SceneInventory().read(scene));
