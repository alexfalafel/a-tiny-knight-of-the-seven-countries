import * as THREE from "three";

export const LOCK_ON_MAX_DISTANCE = 16;
export const LOCK_ON_BREAK_DISTANCE = 19;
export const LOCK_ON_BREAK_GRACE = .35;

const SCREEN_CENTER_WEIGHT = 2.4;
const DISTANCE_WEIGHT = .55;
const FACING_WEIGHT = .75;

export class CombatTargetRegistry {
  constructor(maxDistance = LOCK_ON_MAX_DISTANCE) {
    this.targets = [];
    this.targetsByRoom = new Map();
    this.target = null;
    this.targetRoomId = null;
    this.maxDistance = maxDistance;
    this.breakDistance = Math.max(LOCK_ON_BREAK_DISTANCE, maxDistance + 1);
    this.breakGrace = LOCK_ON_BREAK_GRACE;
    this.outOfRangeTime = 0;
    this.targetDistance = 0;
    this.lastCandidateCount = 0;
    this.direction = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.projectedPosition = new THREE.Vector3();
  }

  register(target, roomId) {
    this.targets.push({ target, roomId });
    if (!this.targetsByRoom.has(roomId)) this.targetsByRoom.set(roomId, []);
    this.targetsByRoom.get(roomId).push(target);
    return target;
  }

  toggle(player, roomId, camera = null) {
    if (this.target) { this.clear(); return null; }
    const p = player.group.position;
    this.forward.set(-Math.sin(player.group.rotation.y), 0, -Math.cos(player.group.rotation.y));
    camera?.updateMatrixWorld();
    let best = null;
    let bestScore = Infinity;
    this.lastCandidateCount = 0;
    for (const target of this.targetsByRoom.get(roomId) || []) {
      this.lastCandidateCount++;
      if (!this.isSelectable(target)) continue;
      this.direction.set(target.group.position.x - p.x, 0, target.group.position.z - p.z);
      const distanceSq = this.direction.lengthSq();
      if (distanceSq < .25 || distanceSq > this.maxDistance * this.maxDistance) continue;
      const inverseDistance = 1 / Math.sqrt(distanceSq);
      const facing = this.forward.dot(this.direction) * inverseDistance;
      if (facing < -.15) continue;

      let centerScore = (1 - facing) * .5;
      if (camera) {
        const height = target.lockHeight || .8;
        this.projectedPosition.set(target.group.position.x, target.group.position.y + height, target.group.position.z).project(camera);
        if (this.projectedPosition.z < -1 || this.projectedPosition.z > 1
          || Math.abs(this.projectedPosition.x) > 1.25 || Math.abs(this.projectedPosition.y) > 1.25) continue;
        centerScore = this.projectedPosition.x * this.projectedPosition.x + this.projectedPosition.y * this.projectedPosition.y;
      }
      const facingScore = 1 - Math.max(-1, Math.min(1, facing));
      const score = centerScore * SCREEN_CENTER_WEIGHT
        + Math.sqrt(distanceSq) / this.maxDistance * DISTANCE_WEIGHT
        + facingScore * FACING_WEIGHT;
      if (score < bestScore) { best = target; bestScore = score; }
    }
    if (best) {
      this.target = best;
      this.targetRoomId = roomId;
      this.outOfRangeTime = 0;
      this.targetDistance = Math.sqrt(best.group.position.distanceToSquared(p));
    }
    return this.target;
  }

  isSelectable(target) {
    return Boolean(target?.group?.visible && target.group.parent && !target.isDead && target.health !== 0 && target.isHostile);
  }

  update(player, roomId, dt = 1 / 60) {
    if (!this.target) return null;
    const target = this.target;
    if (roomId !== this.targetRoomId || !player.alive || !target.group?.parent || !target.group.visible || target.isDead || target.health === 0) {
      this.clear();
      return null;
    }
    const dx = target.group.position.x - player.group.position.x;
    const dy = target.group.position.y - player.group.position.y;
    const dz = target.group.position.z - player.group.position.z;
    this.targetDistance = Math.hypot(dx, dy, dz);
    // Let a locked, living enemy remain selected through its brief disengage
    // state; release it only after crossing the wider break range for a grace.
    this.outOfRangeTime = this.targetDistance > this.breakDistance ? this.outOfRangeTime + dt : 0;
    if (this.outOfRangeTime >= this.breakGrace) {
      this.clear();
      return null;
    }
    return target;
  }

  clear() {
    this.target = null;
    this.targetRoomId = null;
    this.outOfRangeTime = 0;
    this.targetDistance = 0;
  }
}
