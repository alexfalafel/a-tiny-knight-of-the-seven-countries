// Resource inventories run on demand / at diagnostic refresh rate, never per draw.
export const PERFORMANCE_BUDGETS = Object.freeze({
  drawCalls: 150, activeLights: 6, shadowLights: 1, visibleRooms: 2,
  updatingRooms: 1, collisionChecks: 200, raycasts: 4, defaultPixelRatio: 1,
});

export class SceneInventory {
  constructor() {
    this.materials = new Set(); this.geometries = new Set(); this.stats = {};
  }
  read(scene) {
    this.materials.clear(); this.geometries.clear();
    Object.assign(this.stats, { objects: 0, meshes: 0, visibleMeshes: 0, skinnedMeshes: 0,
      instancedMeshes: 0, activeLights: 0, inactiveLights: 0, shadowLights: 0, visibleShadowCasters: 0 });
    this.visit(scene, true);
    this.stats.materials = this.materials.size; this.stats.geometries = this.geometries.size;
    return this.stats;
  }
  visit(object, parentVisible) {
    const visible = parentVisible && object.visible, stats = this.stats;
    stats.objects++;
    if (object.isMesh) {
      stats.meshes++; if (visible) stats.visibleMeshes++;
      if (object.isSkinnedMesh) stats.skinnedMeshes++;
      if (object.isInstancedMesh) stats.instancedMeshes++;
      if (visible && object.castShadow) stats.visibleShadowCasters++;
    }
    if (object.geometry) this.geometries.add(object.geometry);
    if (Array.isArray(object.material)) for (const material of object.material) this.materials.add(material);
    else if (object.material) this.materials.add(object.material);
    if (object.isLight) {
      if (visible) { stats.activeLights++; if (object.castShadow) stats.shadowLights++; }
      else stats.inactiveLights++;
    }
    for (const child of object.children) this.visit(child, visible);
  }
}

export function formatSnapshot(stats, context) {
  const violations = [];
  for (const key of ['drawCalls', 'activeLights', 'shadowLights', 'visibleRooms', 'updatingRooms', 'collisionChecks', 'raycasts']) {
    if (stats[key] > PERFORMANCE_BUDGETS[key]) violations.push(`${key}: ${stats[key]} > ${PERFORMANCE_BUDGETS[key]}`);
  }
  return [
    '=== PERFORMANCE SNAPSHOT ===', `Room: ${stats.activeRoom}`,
    `FPS (250 ms window): ${stats.fps.toFixed(1)}; latest frame: ${stats.frameMs.toFixed(2)} ms`,
    `Draw calls: ${stats.drawCalls}; triangles: ${stats.triangles}; explicit render calls/frame: 1`,
    `Object3D: ${stats.objects}; meshes total/visible: ${stats.meshes}/${stats.visibleMeshes}`,
    `SkinnedMesh: ${stats.skinnedMeshes}; InstancedMesh: ${stats.instancedMeshes}`,
    `Materials: ${stats.materials}; geometry resources: ${stats.geometries}; uploaded geometries: ${stats.uploadedGeometries}; textures: ${stats.textures}`,
    `Lights active/inactive: ${stats.activeLights}/${stats.inactiveLights}; shadow lights: ${stats.shadowLights}; visible shadow casters: ${stats.visibleShadowCasters}`,
    `Rooms total/visible/updating: ${stats.totalRooms}/${stats.visibleRooms}/${stats.updatingRooms}`,
    `Static colliders total: ${stats.staticColliders}; collision checks/frame: ${stats.collisionChecks}; raycasts/frame: ${stats.raycasts}; objects/raycast: 0`,
    `Enemies: ${stats.activeEnemies}; bosses: ${stats.activeBosses}; particle emitters: ${stats.activeParticles}; rendered point primitives (mesh VFX excluded): ${stats.particlePrimitives}`,
    `Player meshes/materials/shadow casters: ${stats.playerMeshes}/${stats.playerMaterials}/${stats.playerShadowCasters}`,
    `Player visible visual meshes/materials: ${stats.playerVisualMeshes}/${stats.playerVisualMaterials}; GLB skinned meshes/triangles/materials/shadow casters: ${stats.playerCharacterMeshes}/${stats.playerCharacterTriangles}/${stats.playerCharacterMaterials}/${stats.playerCharacterShadowCasters}`,
    `Canvas: ${context.canvasWidth} x ${context.canvasHeight}; CSS/window: ${context.canvasCssWidth} x ${context.canvasCssHeight}; DPR: ${context.pixelRatio}; device DPR: ${context.devicePixelRatio}`,
    `Renderer: ${context.rendererSettings}`,
    `Budgets: ${JSON.stringify(PERFORMANCE_BUDGETS)}`,
    `Budget exceedances: ${violations.join('; ') || 'none'}`,
    `User agent: ${context.userAgent}`, `GPU: ${context.webglRenderer}`,
    'One frame is diagnostic, not proof of sustained FPS. Send the K capture too.',
  ].join('\n');
}
