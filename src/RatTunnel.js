import * as THREE from "three";

export class RatTunnel {
  constructor({ id, roomId, position, spawn }) {
    this.id = id;
    this.roomId = roomId;
    this.position = position.isVector3 ? position : new THREE.Vector3(...position);
    this.spawn = spawn.isVector3 ? spawn : new THREE.Vector3(...spawn);
  }

  isNear(playerPosition, radius = 2.2) {
    const dx = playerPosition.x - this.position.x;
    const dz = playerPosition.z - this.position.z;
    return dx * dx + dz * dz <= radius * radius;
  }
}
