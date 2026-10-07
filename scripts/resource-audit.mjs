import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { createTestLevel } from '../src/TestLevel.js';
import { PlayerVisual } from '../src/PlayerVisual.js';
import { PlayerController } from '../src/PlayerController.js';
import { EnemyController } from '../src/EnemyController.js';
import { ArmoredBeetleBoss } from '../src/ArmoredBeetleBoss.js';
import { ArmoredRatKnightBoss } from '../src/ArmoredRatKnightBoss.js';
import { createDragonQueen, createDragonSilhouette } from '../src/FinaleCharacters.js';
import { DragonBoss } from '../src/DragonBoss.js';
import { CrownFragment } from '../src/CrownFragment.js';
import { GoldParticleBurst } from '../src/GoldParticleBurst.js';
import { SceneInventory } from '../src/PerformanceDiagnostics.js';

PlayerVisual.prototype.loadProductionModel = function () {};
const scene = new THREE.Scene(), level = createTestLevel(scene);
const player = new PlayerController(scene, level.spawn, level.collidersNear, level.climbables);
new EnemyController(scene, new THREE.Vector3(3.4, 0, 4.6));
new ArmoredBeetleBoss(scene, { spawn: level.armoryBossSpawn, arenaBounds: level.armoryArenaBounds });
new ArmoredRatKnightBoss(scene, { spawn: level.royalChambersBossSpawn, arenaBounds: level.royalChambersArenaBounds });
createDragonQueen(scene);
new DragonBoss(scene, { group: createDragonSilhouette(scene), camera: {}, keyLight: { intensity: 2.6 } });
for (const spawn of level.fragmentSpawns) new CrownFragment(scene, spawn);
new GoldParticleBurst(scene);
const inventory = new SceneInventory(); inventory.read(scene);
const duplicates = (items, signature) => {
  const groups = new Map();
  for (const item of items) {
    const key = signature(item); if (!key) continue;
    let group = groups.get(key); if (!group) groups.set(key, group = []);
    group.push(item);
  }
  return [...groups].filter(([, group]) => group.length > 1).map(([signature, group]) => ({ count: group.length, signature }));
};
const report = {
  scope: 'Setup resource inventory excludes main.js debug meshes, actor wrapper groups and global lights; not a rendered frame or FPS benchmark.',
  inventory: inventory.stats,
  player: new SceneInventory().read(player.group),
  duplicateMaterials: duplicates(inventory.materials, material => { const json = material.toJSON(); delete json.uuid; delete json.name; return JSON.stringify(json); }),
  duplicatePrimitiveGeometries: duplicates(inventory.geometries, geometry => geometry.parameters ? JSON.stringify({ type: geometry.type, ...geometry.parameters }) : null),
  rooms: [...level.rooms.values()].map(room => ({ id: room.id, meshes: new SceneInventory().read(room.group).meshes,
    instanced: (() => { const parts = []; room.group.traverse(object => { if (object.isInstancedMesh) parts.push({ instances: object.count, color: object.material.color.getHexString() }); }); return parts; })() })),
};
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
