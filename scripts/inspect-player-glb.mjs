import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Three's GLTFLoader is used for inspection just as it is in the browser.
// Node has no browser image decoder, so suppress only its expected blob URL
// texture-decode warnings; geometry, skin, animation and material parsing run.
globalThis.self = globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, options = {}) { this.type = type; Object.assign(this, options); }
};
const originalWarn = console.warn, originalError = console.error;
const filterTextureDecode = (original) => (...args) => {
  if (!String(args[0]).includes("Couldn't load texture blob:")) original(...args);
};
console.warn = filterTextureDecode(originalWarn);
console.error = filterTextureDecode(originalError);
const bytes = readFileSync('public/assets/models/player/rat-knight.glb');
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
let sourceJson = null;
for (let offset = 12; offset + 8 <= bytes.length;) {
  const chunkLength = bytes.readUInt32LE(offset);
  const chunkType = bytes.readUInt32LE(offset + 4);
  if (chunkType === 0x4e4f534a) {
    sourceJson = JSON.parse(bytes.toString('utf8', offset + 8, offset + 8 + chunkLength));
    break;
  }
  offset += 8 + chunkLength;
}
const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer, '', resolve, reject));
console.warn = originalWarn; console.error = originalError;

gltf.scene.updateWorldMatrix(true, true);
const bounds = new THREE.Box3().setFromObject(gltf.scene);
const size = bounds.getSize(new THREE.Vector3());
const nodes = [], bones = new Set(), skinnedMeshes = [], materials = new Set();
gltf.scene.traverse((object) => {
  nodes.push({ name: object.name || object.type, type: object.type, parent: object.parent?.name || null });
  if (object.isSkinnedMesh) {
    skinnedMeshes.push({ name: object.name, triangles: object.geometry.index?.count / 3 || object.geometry.attributes.position.count / 3 });
    for (const bone of object.skeleton.bones) bones.add(bone.name);
  }
  if (object.isMesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
});
const rootMotion = [];
for (const clip of gltf.animations) {
  const track = clip.tracks.find((candidate) => /(?:^|\.)mixamorigHips\.position$/i.test(candidate.name));
  if (!track || track.values.length < 3) continue;
  const values = track.values;
  let maxHorizontalMeters = 0;
  for (let i = 0; i < values.length; i += 3) maxHorizontalMeters = Math.max(maxHorizontalMeters, Math.hypot(values[i] - values[0], values[i + 2] - values[2]));
  if (maxHorizontalMeters > .05) rootMotion.push({ clip: clip.name, maxHorizontalMeters: Number(maxHorizontalMeters.toFixed(3)) });
}
const materialDefinitions = new Map((sourceJson?.materials || []).map((material) => [material.name, material]));
const materialReport = [...materials].map((material) => {
  // The Node-side GLTFLoader cannot decode browser blob images; use the GLB's
  // material JSON to report texture slots even when its image decoder is absent.
  const source = materialDefinitions.get(material.name);
  const pbr = source?.pbrMetallicRoughness;
  const textureSlots = {
    map: pbr?.baseColorTexture?.index,
    normalMap: source?.normalTexture?.index,
    roughnessMap: pbr?.metallicRoughnessTexture?.index,
    metalnessMap: pbr?.metallicRoughnessTexture?.index,
    emissiveMap: source?.emissiveTexture?.index,
  };
  const maps = Object.entries(textureSlots).filter(([, index]) => index !== undefined).map(([name]) => name);
  return { name: material.name, type: material.type, metalness: material.metalness, roughness: material.roughness,
    color: material.color?.getHexString(), maps, textureIndexes: Object.fromEntries(Object.entries(textureSlots).filter(([, index]) => index !== undefined)) };
});
const report = {
  asset: '/assets/models/player/rat-knight.glb', bytes: bytes.length,
  scene: gltf.scene.name, hierarchy: nodes, bones: [...bones],
  animations: gltf.animations.map((clip) => ({ name: clip.name, durationSeconds: Number(clip.duration.toFixed(3)), tracks: clip.tracks.length })),
  skinnedMeshes, materials: materialReport,
  bindBounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: size.toArray() },
  configuredScale: .7, scaledHeight: Number((size.y * .7).toFixed(3)),
  orientation: 'GLTF Y-up, zero authored scene/root yaw; gameplay and camera use Three.js -Z forward, verify visually in browser.',
  hipsHorizontalMotionBeforeNeutralization: rootMotion,
};
writeFileSync('docs/player-glb-inspection.json', JSON.stringify(report, null, 2));
console.info(`Found animations (${gltf.animations.length}):\n${gltf.animations.map((clip) => `- ${clip.name}`).join('\n')}`);
console.info(JSON.stringify({ scene: report.scene, nodes: nodes.length, bones: report.bones, skinnedMeshes, materials: report.materials, bindBounds: report.bindBounds, scaledHeight: report.scaledHeight, hipsHorizontalMotionBeforeNeutralization: rootMotion }, null, 2));

