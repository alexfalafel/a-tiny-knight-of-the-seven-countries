import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTestLevel } from '../src/TestLevel.js';
import { PerformanceCapture } from '../src/PerformanceCapture.js';
import { BenchmarkMatrix } from '../src/BenchmarkMatrix.js';
import { PlayerController } from '../src/PlayerController.js';
import { PlayerVisual } from '../src/PlayerVisual.js';
import { ThirdPersonCamera } from '../src/ThirdPersonCamera.js';

const scene = new THREE.Scene(), level = createTestLevel(scene), candidates = [];
for (const room of level.rooms.values()) {
  for (let x = room.bounds.minX; x <= room.bounds.maxX; x += 3) {
    for (let z = room.bounds.minZ; z <= room.bounds.maxZ; z += 3) {
      level.collidersNear(room.id, { x, z }, candidates);
      assert(candidates.every(box => box.roomIds.includes(room.id)));
      assert.equal(new Set(candidates).size, candidates.length);
    }
  }
  assert.equal(level.climbablesForRoom(room.id), room.climbables);
  for (const surface of room.climbables) assert(surface.object.parent);
  room.group.traverse(object => {
    if (object === level.throneCrown || object.parent === level.throneCrown) return;
    assert.equal(object.matrixAutoUpdate, false);
    if (object.isInstancedMesh) assert(object.boundingBox && !object.boundingBox.isEmpty());
  });
}
assert.equal(level.throneCrown.matrixAutoUpdate, true);
for (const connector of level.connections) {
  for (const roomId of [connector.from, connector.to]) {
    level.collidersNear(roomId, { x: connector.center[0], z: connector.center[1] }, candidates);
    assert(connector.colliders.every(box => candidates.includes(box)));
  }
}

const capture = new PerformanceCapture();
capture.start({}, 1);
for (let i = 0; i < 60; i++) {
  capture.record(1000 / 60, { ui: 1, render: 2 }, { drawCalls: 100, activeRoom: 'greatHall' }, capture.startedAt + i * 16);
}
const report = capture.finish(capture.startedAt + 1000);
assert(Math.abs(report.averageFps - 60) < .001);
assert.equal(report.statSummary.drawCalls.average, 100);
assert.equal(report.subsystemAverages.ui, 1);

let config = { shadows: true, localLights: true, pixelRatioIndex: 1, currentRoomOnly: false, hideUi: false, particles: true, propsVisible: true };
const original = { ...config };
let text = '';
const mock = { active: false, start() { this.active = true; }, cancel() { this.active = false; } };
const matrix = new BenchmarkMatrix({
  capture: mock, snapshot: () => ({ ...config }), apply: settings => { config = { ...settings }; },
  context: () => ({ activeRoom: 'greatHall' }), status: () => {}, complete: report => { text = report; }, format: () => '',
});
matrix.start();
for (let i = 0; i < 8; i++) {
  matrix.tick(i * 6000, null);
  assert(Object.keys(original).filter(key => config[key] !== original[key]).length <= 1);
  assert(matrix.tick(i * 6000 + 750, null));
  mock.active = false;
  matrix.accept({ averageFps: 60 + i, onePercentLowFps: 50 });
}
matrix.tick(49000, null);
assert.deepEqual(config, original);
assert(text.includes('DECORATIVE PROPS OFF'));
assert(!matrix.active);
matrix.start(); matrix.tick(0, null); matrix.cancel('test');
assert.deepEqual(config, original);

// Controller regression checks only, NOT a browser FPS benchmark. Keep the real
// procedural rig; skip the browser-only asynchronous GLB fetch in this Node test.
PlayerVisual.prototype.loadProductionModel = function () {};
const player = new PlayerController(scene, level.spawn, level.collidersNear, level.climbables);
player.climbableSurfaces = level.climbablesForRoom('greatHall');
const camera = new ThirdPersonCamera(new THREE.PerspectiveCamera());
const pressed = new Set(), held = new Set();
const input = {
  down: key => held.has(key),
  consume: key => { const value = pressed.has(key); pressed.delete(key); return value; },
  consumeAttack: () => false,
};
for (const scenario of ['idle', 'W', 'WA', 'camera', 'jump', 'dodge', 'aura']) {
  player.reset(); held.clear(); pressed.clear();
  if (scenario !== 'idle') held.add('KeyW');
  if (scenario === 'WA') held.add('KeyA');
  let maximumChecks = 0;
  for (let frame = 0; frame < 600; frame++) {
    if (frame % 60 === 0) {
      if (scenario === 'jump') pressed.add('Space');
      if (scenario === 'dodge') pressed.add('KeyQ');
      if (scenario === 'aura') pressed.add('Period');
    }
    player.collisionChecks = 0;
    player.update(1 / 60, input, camera);
    player.updateVisual(1 / 60);
    camera.update(1 / 60, { x: scenario === 'camera' ? 2 : 0, y: 0 }, player.group.position);
    maximumChecks = Math.max(maximumChecks, player.collisionChecks);
    assert(player.group.position.toArray().every(Number.isFinite));
    assert(player.collisionChecks < 100);
  }
  if (scenario !== 'idle') assert(player.group.position.distanceTo(level.spawn) > .1);
  console.log(`Controller ${scenario}: 600 steps passed; maximum collision checks ${maximumChecks}`);
}
console.log('PASS: room/connector collisions, climb identities, static matrices/bounds, movable crown, controller movement, capture aggregation, eight matrix modes, restoration and cancellation.');
