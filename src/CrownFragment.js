import * as THREE from "three";

const shardShape = new THREE.Shape();
shardShape.moveTo(-.28, -.17);
shardShape.lineTo(.25, -.17);
shardShape.lineTo(.2, .04);
shardShape.lineTo(.08, .16);
shardShape.lineTo(.025, .02);
shardShape.lineTo(-.08, .2);
shardShape.lineTo(-.145, .035);
shardShape.lineTo(-.25, .12);
shardShape.closePath();

const shardGeometry = new THREE.ExtrudeGeometry(shardShape, {
  depth: .075,
  bevelEnabled: true,
  bevelSegments: 1,
  steps: 1,
  bevelSize: .018,
  bevelThickness: .018,
});
const jewelGeometry = new THREE.OctahedronGeometry(.075, 0);
const jewelMaterial = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
const goldColors = [0xffd866, 0xe9b83d, 0xffe18a, 0xf3c54f, 0xffd36a];

export class CrownFragment {
  constructor(scene, { id, roomId, position, triggerRadius = 1.2 }) {
    this.id = id;
    this.roomId = roomId;
    this.collected = false;
    this.triggerRadius = triggerRadius;
    this.triggerRadiusSquared = triggerRadius * triggerRadius;
    this.worldPosition = new THREE.Vector3(...position);
    this.phase = id * 1.31;
    this.elapsed = 0;
    this.collectionElapsed = 0;
    this.collectionDuration = .55;
    this.collectionAnimating = false;

    this.object = new THREE.Group();
    this.object.userData.type = "crownFragment";
    this.object.userData.fragmentId = id;
    this.object.userData.collected = false;
    this.object.position.copy(this.worldPosition);
    const material = new THREE.MeshStandardMaterial({
      color: goldColors[(id - 1) % goldColors.length],
      emissive: 0x5b3b05,
      emissiveIntensity: .68,
      metalness: .74,
      roughness: .26,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const shard = new THREE.Mesh(shardGeometry, material);
    shard.castShadow = false;
    this.object.add(shard);
    const jewel = new THREE.Mesh(jewelGeometry, jewelMaterial);
    jewel.position.set(.02, .105, .09);
    this.object.add(jewel);
    this.material = material;
    this.scene = scene;
    scene.add(this.object);
  }

  tryCollect(playerPosition) {
    if (this.collected) return false;
    const dx = playerPosition.x - this.worldPosition.x;
    const dy = playerPosition.y - this.worldPosition.y;
    const dz = playerPosition.z - this.worldPosition.z;
    if (dx * dx + dy * dy + dz * dz > this.triggerRadiusSquared) return false;
    this.collected = true;
    this.object.userData.collected = true;
    this.collectionAnimating = true;
    this.collectionElapsed = 0;
    return true;
  }

  update(dt) {
    if (this.collected) {
      if (!this.collectionAnimating) return;
      this.collectionElapsed += dt;
      const t = Math.min(1, this.collectionElapsed / this.collectionDuration);
      this.object.position.y = this.worldPosition.y + t * .8;
      this.object.scale.setScalar(1 - t * .52);
      this.material.opacity = 1 - t;
      if (t >= 1) {
        this.collectionAnimating = false;
        this.object.visible = false;
      }
      return;
    }
    this.elapsed += dt;
    this.object.position.y = this.worldPosition.y + Math.sin(this.elapsed * 1.7 + this.phase) * .1;
    this.object.rotation.y += dt * .58;
    this.object.rotation.z = Math.sin(this.elapsed + this.phase) * .08;
  }

  reset() {
    this.collected = false;
    this.object.userData.collected = false;
    this.collectionAnimating = false;
    this.collectionElapsed = 0;
    this.object.visible = true;
    this.object.position.copy(this.worldPosition);
    this.object.scale.setScalar(1);
    this.object.rotation.set(0, 0, 0);
    this.material.opacity = 1;
  }
}
