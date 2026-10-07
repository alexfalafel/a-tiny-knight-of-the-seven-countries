import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' });
try {
  const { PlayerVisual } = await server.ssrLoadModule('/src/PlayerVisual.js');
  PlayerVisual.prototype.loadProductionModel = function () {};
  PlayerVisual.prototype.loadOptionalSword = function () {};
  const { PlayerController } = await server.ssrLoadModule('/src/PlayerController.js');
  const { createTestLevel } = await server.ssrLoadModule('/src/TestLevel.js');
  const scene = new THREE.Scene();
  const level = createTestLevel(scene);
  const player = new PlayerController(scene, new THREE.Vector3(0, 0, 9.5), level.collidersNear, null);
  player.visual.footContactSurfaces = level.footContactSurfaces;
  const worldPosition = new THREE.Vector3();
  const shadowY = () => {
    scene.updateMatrixWorld(true);
    return player.shadow.getWorldPosition(worldPosition).y;
  };
  const sample = (x, y, z) => {
    player.group.position.set(x, y, z);
    player.velocity.set(0, 0, 0);
    player.moveAndCollide(0);
    return shadowY();
  };

  assert(Math.abs(sample(5, 0, 9.5) - .015) < 1e-6, 'bare floor shadow height');
  assert(Math.abs(sample(0, 0, 9.5) - .0775) < 1e-6, 'shadow should follow the visible Great Hall rug top');
  assert(Math.abs(sample(0, 1.5, 9.5) - .0775) < 1e-6, 'jumping above the rug should keep the shadow on the rug');

  const stairZ = 5.5;
  const stairTop = Math.ceil((6.6 - stairZ) / 1.15) * .28;
  assert(Math.abs(sample(0, stairTop + 1, stairZ) - (stairTop + .015)) < 1e-6, 'jump above stairs should keep shadow on the current stair');
  assert(Math.abs(sample(0, 2.2, 0) - 1.145) < 1e-6, 'jump above dais should keep shadow on the dais');

  player.collisionQuery = null;
  player.colliders = [{ minX: -1, maxX: 1, minY: 0, maxY: 1.4, minZ: -1, maxZ: 1, supportTop: true }];
  assert(Math.abs(sample(0, 2.4, 0) - 1.415) < 1e-6, 'airborne shadow should use the highest cached support box');
  player.colliders = [];

  sample(5, 0, 9.5);
  for (const state of ['IDLE_ALL_FOURS', 'RUN_ALL_FOURS', 'JUMP', 'DODGE', 'ATTACK_1', 'CLIMB_UP']) {
    player.group.position.y = state === 'IDLE_ALL_FOURS' || state === 'RUN_ALL_FOURS' ? 0 : 3;
    player.visualState = state;
    player.updateVisual(1 / 60);
    assert(Math.abs(shadowY() - .015) < 1e-6, `${state} must not lift the ground shadow`);
  }
  player.group.position.set(5.5, 0, 9.5);
  player.syncGroundShadowHeight();
  assert(Math.abs(shadowY() - .015) < 1e-6, 'horizontal movement should keep the shadow grounded');

  console.log('PASS: floor, rug, stairs, dais, cached support box, jump-height cancellation, and horizontal following.');
} finally {
  await server.close();
}
