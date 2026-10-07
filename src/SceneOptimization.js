import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Immutable procedural geometry only. Call from setup; animated objects change
// their transforms, not these buffers. Curves/custom mutable buffers stay separate.
const primitiveCache = new Map();
export function sharedGeometry(Geometry, ...parameters) {
  const key = `${Geometry.name}:${JSON.stringify(parameters)}`;
  let geometry = primitiveCache.get(key);
  if (!geometry) { geometry = new Geometry(...parameters); primitiveCache.set(key, geometry); }
  return geometry;
}

// Three's Object3D.updateMatrixWorld walks invisible descendants too. These
// explicit room/rig boundaries sleep until visible again; gameplay state stays.
export class DormantGroup extends THREE.Group {
  updateMatrixWorld(force) {
    if (this.visible) super.updateMatrixWorld(force);
  }
}

// Initialization only. Merge rigid pieces within each animation pivot, never
// across a Group/socket boundary. Preserve exact vertices, normals and materials.
export function batchRigidParts(root) {
  const groups = new Map();
  const matrix = new THREE.Matrix4();
  const collect = (object, parentMatrix) => {
    if (!object.isMesh || object.isSkinnedMesh || object.isInstancedMesh || Array.isArray(object.material)) {
      if (object.isGroup) batchRigidParts(object);
      return;
    }
    // Don't discard sockets or non-mesh children of a rigid mesh.
    if (object.children.some(child => !child.isMesh)) return;
    object.updateMatrix();
    const transform = new THREE.Matrix4().multiplyMatrices(parentMatrix, object.matrix);
    const key = `${object.material.id}/${object.castShadow}/${object.receiveShadow}/${object.visible}`;
    let batch = groups.get(key);
    if (!batch) groups.set(key, batch = []);
    batch.push({ object, transform });
    for (const child of object.children) collect(child, transform);
  };
  for (const child of [...root.children]) collect(child, matrix);
  for (const parts of groups.values()) {
    if (parts.length < 2) continue;
    const geometries = parts.map(({ object, transform }) => {
      const geometry = object.geometry.clone().applyMatrix4(transform);
      // All primitive inputs use position/normal/uv; keep indexed topology.
      return geometry;
    });
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) throw new Error('Rigid batching received incompatible geometry attributes');
    merged.computeBoundingSphere();
    const first = parts[0].object;
    const mesh = new THREE.Mesh(merged, first.material);
    mesh.name = `${root.name || 'Rigid'}-material-batch`;
    mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow; mesh.visible = first.visible;
    mesh.matrixAutoUpdate = false;
    // A mesh child that isn't itself merged must retain its original transform.
    for (const { object, transform } of parts) {
      for (const child of [...object.children]) {
        if (parts.some(part => part.object === child)) continue;
        child.updateMatrix();
        child.matrix.premultiply(transform);
        child.matrix.decompose(child.position, child.quaternion, child.scale);
        root.add(child);
      }
      object.removeFromParent();
    }
    root.add(mesh);
  }
}
