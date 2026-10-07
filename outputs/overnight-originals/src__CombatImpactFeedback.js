import * as THREE from "three";
import { COMBAT_IMPACT } from "./CombatConfig.js";

const PROFILE_NAMES = new Set(Object.keys(COMBAT_IMPACT.particles.profiles));

export class CombatImpactFeedback {
  constructor(scene, player, camera) {
    this.player = player;
    this.camera = camera;
    this.enabled = true;
    this.lastAttackSerial = -1;
    this.lastHitTarget = "none";
    this.lastProfile = "none";
    this.lastVfx = "none";
    this.lastSfx = "none";
    this.lastTargetFlinching = false;
    this.activeParticleCount = 0;
    this.writeIndex = 0;

    const count = COMBAT_IMPACT.particles.poolSize;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.remainingLife = new Float32Array(count);
    this.initialLife = new Float32Array(count);
    this.gravity = new Float32Array(count);
    this.colorR = new Float32Array(count);
    this.colorG = new Float32Array(count);
    this.colorB = new Float32Array(count);
    this.geometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.colorAttribute = new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute("position", this.positionAttribute);
    this.geometry.setAttribute("color", this.colorAttribute);
    this.geometry.setDrawRange(0, count);
    this.points = new THREE.Points(this.geometry, new THREE.PointsMaterial({
      color: 0xffffff,
      size: .075,
      sizeAttenuation: true,
      transparent: true,
      opacity: .9,
      depthWrite: false,
      vertexColors: true,
    }));
    this.points.name = "CombatImpactParticlePool";
    this.points.visible = false;
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.particleCapacity = count;
    this.direction = new THREE.Vector3();
    this.randomDirection = new THREE.Vector3();
  }

  profileFor(targetType) {
    return PROFILE_NAMES.has(targetType) ? targetType : "GENERIC";
  }

  handleConfirmedHit(hit) {
    if (!hit?.target || !hit.confirmedDamage || !(hit.damage > 0)) return false;
    if (hit.attackSerial === this.lastAttackSerial) return false;
    this.lastAttackSerial = hit.attackSerial;

    const attackIndex = THREE.MathUtils.clamp(hit.attackIndex || 1, 1, 3);
    const hitStop = COMBAT_IMPACT.hitStopSeconds[attackIndex - 1];
    const profile = this.profileFor(hit.targetType || hit.target.impactType);
    const reaction = COMBAT_IMPACT.reactions[profile];
    const cameraImpulse = COMBAT_IMPACT.camera.strengths[attackIndex - 1];

    this.player.impactHitStopTimer = Math.max(this.player.impactHitStopTimer || 0, hitStop);
    this.camera.triggerImpactImpulse(hit.hitDirection, cameraImpulse, COMBAT_IMPACT.camera.duration, COMBAT_IMPACT.camera.maxStrength);
    if (!hit.target.isDead && hit.target.status !== "DEAD") {
      this.lastTargetFlinching = Boolean(hit.target.requestImpactFlinch?.({
        duration: reaction.duration,
        holdDuration: hitStop,
        strength: reaction.strength * (attackIndex === 3 ? 1.12 : 1),
        direction: hit.hitDirection,
      }));
    } else {
      this.lastTargetFlinching = false;
    }

    const particleProfile = COMBAT_IMPACT.particles.profiles[profile];
    const particleCount = Math.min(
      COMBAT_IMPACT.particles.maxPerHit,
      particleProfile.count + (attackIndex === 3 ? COMBAT_IMPACT.particles.attack3Bonus : 0),
    );
    this.burst(hit.hitPoint, hit.hitDirection, particleProfile, particleCount);

    const sfxHook = COMBAT_IMPACT.sfxHooks[profile];
    this.emitSfxHook(sfxHook, { profile, attackIndex, target: hit.target });
    this.lastHitTarget = hit.target.name || hit.target.id || hit.target.constructor?.name || "enemy";
    this.lastProfile = profile;
    this.lastVfx = particleProfile.name;
    this.lastSfx = sfxHook;
    return true;
  }

  burst(position, direction, profile, count) {
    if (!this.enabled || !position || !profile) return;
    this.direction.copy(direction || this.randomDirection.set(0, 0, -1)).normalize();
    const capacity = this.particleCapacity;
    for (let particle = 0; particle < count; particle++) {
      const slot = this.writeIndex++ % capacity;
      const index = slot * 3;
      const replacingActiveParticle = this.remainingLife[slot] > 0;
      const colorHex = profile.colors[particle % profile.colors.length];
      this.positions[index] = position.x;
      this.positions[index + 1] = position.y;
      this.positions[index + 2] = position.z;

      const spread = .62;
      this.randomDirection.set(
        this.direction.x + (Math.random() - .5) * spread,
        this.direction.y + .18 + Math.random() * .42,
        this.direction.z + (Math.random() - .5) * spread,
      ).normalize();
      const speed = profile.speed * (.72 + Math.random() * .5);
      this.velocities[index] = this.randomDirection.x * speed;
      this.velocities[index + 1] = this.randomDirection.y * speed;
      this.velocities[index + 2] = this.randomDirection.z * speed;
      this.remainingLife[slot] = profile.lifetime;
      this.initialLife[slot] = profile.lifetime;
      this.gravity[slot] = profile.gravity;
      this.colorR[slot] = ((colorHex >> 16) & 255) / 255;
      this.colorG[slot] = ((colorHex >> 8) & 255) / 255;
      this.colorB[slot] = (colorHex & 255) / 255;
      if (!replacingActiveParticle) this.activeParticleCount++;
    }
    this.points.visible = this.activeParticleCount > 0;
    this.positionAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
  }

  update(dt) {
    if (!this.enabled || this.activeParticleCount === 0) return;
    let active = 0;
    for (let slot = 0; slot < this.particleCapacity; slot++) {
      let life = this.remainingLife[slot];
      if (life <= 0) continue;
      life = Math.max(0, life - dt);
      this.remainingLife[slot] = life;
      const index = slot * 3;
      if (life > 0) {
        this.velocities[index + 1] -= this.gravity[slot] * dt;
        this.positions[index] += this.velocities[index] * dt;
        this.positions[index + 1] += this.velocities[index + 1] * dt;
        this.positions[index + 2] += this.velocities[index + 2] * dt;
        const fade = life / this.initialLife[slot];
        this.colors[index] = this.colorR[slot] * fade;
        this.colors[index + 1] = this.colorG[slot] * fade;
        this.colors[index + 2] = this.colorB[slot] * fade;
        active++;
      } else {
        this.colors[index] = this.colors[index + 1] = this.colors[index + 2] = 0;
      }
    }
    this.activeParticleCount = active;
    this.points.visible = active > 0;
    this.positionAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
  }

  emitSfxHook(cue, detail) {
    if (!cue || typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
    window.dispatchEvent(new CustomEvent("tiny-knight:sfx", {
      detail: { cue, profile: detail.profile, attackIndex: detail.attackIndex, targetId: detail.target.id || detail.target.name || null },
    }));
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.enabled) return;
    this.remainingLife.fill(0);
    this.activeParticleCount = 0;
    this.points.visible = false;
  }
}
