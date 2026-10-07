import * as THREE from 'three';
import { createTestLevel } from '../src/TestLevel.js';
import { writeFileSync } from 'node:fs';

// Structural counts, not GPU timings or a substitute for Chrome captures.
const scene = new THREE.Scene();
const level = createTestLevel(scene);
const metrics = {};
for (const [id, room] of level.rooms) {
  const geometries = new Set(), materials = new Set();
  let meshes = 0, triangles = 0, shadowCasters = 0, instances = 0;
  room.group.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    const count = object.isInstancedMesh ? object.count : 1;
    instances += count;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * count;
    shadowCasters += Number(object.castShadow);
  });
  const p = id === 'greatHall' ? level.spawn : room.spawn;
  const candidates = level.collidersNear(id, p, []);
  metrics[id] = { meshes, instances, triangles, geometries: geometries.size, materials: materials.size, shadowCasters,
    collisionCandidatesAtSpawn: candidates.length, collisionChecksForThreePasses: candidates.length * 3,
    climbables: level.climbablesForRoom(id).length };
}
const result = { kind: 'static scene structure; excludes actors, frustum and shadow render passes', rooms: metrics };
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
