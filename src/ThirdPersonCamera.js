import * as THREE from "three";

export const MIN_CAMERA_PITCH = -0.08;
export const MAX_CAMERA_PITCH = 0.82;

const CAMERA_TARGET_HEIGHT = 0.58;
const CAMERA_COLLISION_RADIUS = 0.18;
const CAMERA_WALL_MARGIN = 0.12;

function segmentBoxEntry(start, end, box, radius) {
  let minT = 0;
  let maxT = 1;
  const startX = start.x, startY = start.y, startZ = start.z;
  const deltaX = end.x - startX, deltaY = end.y - startY, deltaZ = end.z - startZ;
  for (let axis = 0; axis < 3; axis++) {
    const origin = axis === 0 ? startX : axis === 1 ? startY : startZ;
    const delta = axis === 0 ? deltaX : axis === 1 ? deltaY : deltaZ;
    const low = (axis === 0 ? box.minX : axis === 1 ? box.minY : box.minZ) - radius;
    const high = (axis === 0 ? box.maxX : axis === 1 ? box.maxY : box.maxZ) + radius;
    if (Math.abs(delta) < 1e-8) {
      if (origin < low || origin > high) return Infinity;
      continue;
    }
    let first = (low - origin) / delta;
    let last = (high - origin) / delta;
    if (first > last) { const swap = first; first = last; last = swap; }
    minT = Math.max(minT, first);
    maxT = Math.min(maxT, last);
    if (minT > maxT) return Infinity;
  }
  return minT >= 0 && minT <= 1 ? minT : Infinity;
}

export class ThirdPersonCamera {
  constructor(camera, target = null) {
    this.camera = camera;
    this.target = target;
    this.yaw = 0;
    this.pitch = 0.2;
    this.distance = 4.6;
    this.currentDistance = this.distance;
    this.desiredDistance = this.distance;
    this.actualDistance = this.distance;
    this.cameraObstructed = false;
    this.collisionChecks = 0;
    this.collisionQuery = null;
    this.collisionCandidates = [];
    this.position = new THREE.Vector3();
    this.desiredPosition = new THREE.Vector3();
    this.fullDesiredPosition = new THREE.Vector3();
    this.anchor = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this.forwardVector = new THREE.Vector3();
    this.rightVector = new THREE.Vector3();
    this.actualRayEnd = new THREE.Vector3();
    this.shakeTimer = 0; this.shakeDuration = 0; this.shakeStrength = 0;
    this.impactImpulseDirection = new THREE.Vector3();
    this.impactImpulseTimer = 0; this.impactImpulseDuration = 0; this.impactImpulseStrength = 0;
  }

  setCollisionQuery(query) { this.collisionQuery = query; }

  update(dt, mouse, playerPosition, climbing = false, lockTarget = null, roomId = "greatHall") {
    this.yaw -= mouse.x * 0.0024;
    this.pitch = THREE.MathUtils.clamp(this.pitch - mouse.y * 0.002, MIN_CAMERA_PITCH, MAX_CAMERA_PITCH);
    if (lockTarget) {
      const dx = lockTarget.group.position.x - playerPosition.x;
      const dz = lockTarget.group.position.z - playerPosition.z;
      const lockYaw = Math.atan2(-dx, -dz);
      const delta = THREE.MathUtils.euclideanModulo(lockYaw - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
      this.yaw += delta * (1 - Math.exp(-2.6 * dt));
    }

    const targetDistance = lockTarget ? (lockTarget.cameraDistance || 5.2) : this.distance;
    this.desiredDistance = targetDistance;
    const pitchCos = Math.cos(this.pitch);
    this.anchor.set(playerPosition.x, playerPosition.y + CAMERA_TARGET_HEIGHT, playerPosition.z);
    this.direction.set(Math.sin(this.yaw) * pitchCos, Math.sin(this.pitch), Math.cos(this.yaw) * pitchCos).normalize();
    this.fullDesiredPosition.copy(this.anchor).addScaledVector(this.direction, targetDistance);
    this.collisionCandidates.length = 0;
    if (this.collisionQuery) this.collisionQuery(roomId, playerPosition, this.collisionCandidates);
    this.cameraObstructed = false;
    this.collisionChecks = 0;
    const safeDistance = this.getSafeDistance(this.anchor, this.fullDesiredPosition, targetDistance);
    const shrinking = safeDistance < this.currentDistance;
    this.currentDistance = THREE.MathUtils.damp(this.currentDistance, safeDistance, shrinking ? 30 : 4.5, dt);

    this.desiredPosition.copy(this.anchor).addScaledVector(this.direction, this.currentDistance);
    this.position.lerp(this.desiredPosition, 1 - Math.exp(-12 * dt));
    // Keep the smoothed camera point inside the swept collision path too.
    this.actualRayEnd.copy(this.position);
    const actualLength = this.anchor.distanceTo(this.actualRayEnd);
    const actualSafeDistance = this.getSafeDistance(this.anchor, this.actualRayEnd, actualLength);
    if (actualSafeDistance < actualLength) {
      const direction = this.actualRayEnd.sub(this.anchor).normalize();
      this.position.copy(this.anchor).addScaledVector(direction, actualSafeDistance);
    }
    this.actualDistance = this.anchor.distanceTo(this.position);

    if (lockTarget) {
      const target = lockTarget.group.position;
      this.lookTarget.set((playerPosition.x + target.x) * .5, (playerPosition.y + target.y + (lockTarget.lockHeight || 1.1)) * .5 + .25, (playerPosition.z + target.z) * .5);
    } else this.lookTarget.set(playerPosition.x, playerPosition.y + (climbing ? .78 : CAMERA_TARGET_HEIGHT - .06), playerPosition.z);
    this.applyCameraShake(dt);
    this.camera.lookAt(this.lookTarget);
  }

  getSafeDistance(start, end, distance) {
    let firstHit = 1;
    for (const box of this.collisionCandidates) {
      this.collisionChecks++;
      const hit = segmentBoxEntry(start, end, box, CAMERA_COLLISION_RADIUS);
      if (hit < firstHit) firstHit = hit;
    }
    if (firstHit >= 1) return distance;
    this.cameraObstructed = true;
    return Math.max(.25, firstHit * distance - CAMERA_WALL_MARGIN);
  }

  updateCinematic(dt, position, lookTarget) {
    const smooth = 1 - Math.exp(-4.8 * dt);
    this.position.lerp(position, smooth);
    this.lookTarget.lerp(lookTarget, smooth);
    this.applyCameraShake(dt);
    this.camera.lookAt(this.lookTarget);
  }

  triggerShake(strength = .2, duration = .3) {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeDuration = Math.max(this.shakeDuration, duration);
    this.shakeTimer = Math.max(this.shakeTimer, duration);
  }

  triggerImpactImpulse(hitDirection, strength = .014, duration = .12, maxStrength = .028) {
    const safeStrength = THREE.MathUtils.clamp(strength, 0, maxStrength);
    if (safeStrength >= this.impactImpulseStrength || this.impactImpulseTimer <= 0) {
      this.impactImpulseDirection.copy(hitDirection || this.forwardVector.set(0, 0, -1));
      this.impactImpulseDirection.y = 0;
      if (this.impactImpulseDirection.lengthSq() < .0001) this.impactImpulseDirection.set(0, 0, -1);
      this.impactImpulseDirection.normalize().negate();
      this.impactImpulseStrength = safeStrength;
      this.impactImpulseDuration = Math.max(.001, duration);
    }
    this.impactImpulseTimer = Math.max(this.impactImpulseTimer, duration);
  }

  applyCameraShake(dt) {
    this.camera.position.copy(this.position);
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      const fade = this.shakeDuration > 0 ? this.shakeTimer / this.shakeDuration : 0;
      const t = performance.now() * .06;
      this.camera.position.x += Math.sin(t * 1.17) * this.shakeStrength * fade;
      this.camera.position.y += Math.sin(t * 1.63) * this.shakeStrength * fade * .7;
      if (this.shakeTimer === 0) this.shakeStrength = 0;
    }
    if (this.impactImpulseTimer > 0) {
      const fade = this.impactImpulseDuration > 0 ? this.impactImpulseTimer / this.impactImpulseDuration : 0;
      this.camera.position.addScaledVector(this.impactImpulseDirection, this.impactImpulseStrength * fade);
      this.impactImpulseTimer = Math.max(0, this.impactImpulseTimer - dt);
      if (this.impactImpulseTimer === 0) this.impactImpulseStrength = 0;
    }
  }

  resetForPlayer() {
    this.pitch = .2; this.yaw = 0; this.currentDistance = this.distance;
    this.desiredDistance = this.distance; this.actualDistance = this.distance; this.cameraObstructed = false;
    this.shakeTimer = 0; this.shakeDuration = 0; this.shakeStrength = 0;
    this.impactImpulseTimer = 0; this.impactImpulseDuration = 0; this.impactImpulseStrength = 0;
    this.impactImpulseDirection.set(0, 0, 0);
  }

  get forward() { return this.forwardVector.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  get right() { return this.rightVector.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
}
