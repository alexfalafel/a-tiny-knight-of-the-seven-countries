import * as THREE from "three";

// Only explicitly registered surfaces are considered by the short-range interaction check.
export class ClimbableRegistry {
  constructor() { this.surfaces = []; this.lastChecks = 0; }

  register(object, { origin, normal, horizontal, halfWidth, topY, attachDistance = .52, landing = null }) {
    object.userData.climbable = true;
    if (!object.name) object.name = `Climbable ${this.surfaces.length + 1}`;
    const surface = {
      object,
      origin: new THREE.Vector3(...origin),
      normal: new THREE.Vector3(...normal).normalize(),
      horizontal: new THREE.Vector3(...horizontal).normalize(),
      halfWidth,
      topY,
      attachDistance,
      landing,
    };
    this.surfaces.push(surface);
    return surface;
  }

  findFacing(position, yaw, surfaces = this.surfaces) {
    this.lastChecks = 0;
    const facingX = -Math.sin(yaw);
    const facingZ = -Math.cos(yaw);
    let best = null;
    let bestScore = Infinity;
    for (const surface of surfaces) {
      this.lastChecks++;
      const dx = position.x - surface.origin.x;
      const dy = position.y - surface.origin.y;
      const dz = position.z - surface.origin.z;
      const distance = dx * surface.normal.x + dz * surface.normal.z;
      const horizontal = dx * surface.horizontal.x + dz * surface.horizontal.z;
      const facing = facingX * -surface.normal.x + facingZ * -surface.normal.z;
      if (distance < .18 || distance > surface.attachDistance + .95 || facing < .42) continue;
      if (Math.abs(horizontal) > surface.halfWidth + .65 || dy < -.25 || dy > surface.topY - surface.origin.y + .45) continue;
      const score = Math.abs(distance - surface.attachDistance) + Math.max(0, Math.abs(horizontal) - surface.halfWidth) * 1.5;
      if (score < bestScore) { best = surface; bestScore = score; }
    }
    return best;
  }
}
