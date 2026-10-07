import * as THREE from "three";

export class GoldParticleBurst {
  constructor(scene, count = 28) {
    this.count = count;
    this.duration = .72;
    this.elapsed = 0;
    this.active = false;
    this.enabled = true;
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setDrawRange(0, count);
    this.material = new THREE.PointsMaterial({
      color: 0xffd55c,
      size: .095,
      sizeAttenuation: true,
      transparent: true,
      opacity: .95,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.visible = false;
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(position) {
    if (!this.enabled) return;
    this.elapsed = 0;
    this.active = true;
    this.points.visible = true;
    const data = this.geometry.attributes.position;
    for (let i = 0; i < this.count; i++) {
      const index = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const speed = .7 + Math.random() * 2.1;
      this.positions[index] = position.x;
      this.positions[index + 1] = position.y;
      this.positions[index + 2] = position.z;
      this.velocities[index] = Math.cos(angle) * speed;
      this.velocities[index + 1] = .7 + Math.random() * 2.4;
      this.velocities[index + 2] = Math.sin(angle) * speed;
    }
    data.needsUpdate = true;
    this.material.opacity = .95;
  }

  update(dt) {
    if (!this.active || !this.enabled) return;
    this.elapsed += dt;
    const age = Math.min(1, this.elapsed / this.duration);
    for (let i = 0; i < this.count; i++) {
      const index = i * 3;
      this.velocities[index + 1] -= 4.8 * dt;
      this.positions[index] += this.velocities[index] * dt;
      this.positions[index + 1] += this.velocities[index + 1] * dt;
      this.positions[index + 2] += this.velocities[index + 2] * dt;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.material.opacity = .95 * (1 - age);
    if (age >= 1) {
      this.active = false;
      this.points.visible = false;
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) { this.active = false; this.points.visible = false; }
  }
}
