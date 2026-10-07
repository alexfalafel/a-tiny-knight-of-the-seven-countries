import * as THREE from "three";
import { sharedGeometry } from "./SceneOptimization.js";

const STATES = { IDLE: "IDLE", HOSTILE: "HOSTILE", TELEGRAPH: "TELEGRAPH", ATTACK: "ATTACK", RECOVERY: "RECOVERY", DEAD: "DEAD" };

function addSphere(parent, material, position, scale) {
  const mesh = new THREE.Mesh(sharedGeometry(THREE.SphereGeometry, 1, 14, 10), material);
  mesh.position.set(...position); mesh.scale.set(...scale); mesh.castShadow = false; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

export class EnemyController {
  constructor(scene, spawn) {
    this.name = "HALL BEETLE"; this.impactType = "CHITIN"; this.impactPointHeight = .48; this.impactPointOffset = .3;
    this.spawn = spawn.clone(); this.group = new THREE.Group(); this.group.position.copy(spawn); scene.add(this.group);
    this.visualRoot = new THREE.Group(); this.visualRoot.name = "EnemyVisualRoot"; this.group.add(this.visualRoot);
    const shellMaterial = new THREE.MeshStandardMaterial({ color: 0x46533d, roughness: .7, metalness: .12 });
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x302d25, roughness: .9 });
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xc7553b, emissive: 0x44130c, roughness: .42 });
    this.shell = addSphere(this.visualRoot, shellMaterial, [0, .48, .13], [.47, .34, .62]);
    addSphere(this.visualRoot, bodyMaterial, [0, .37, -.3], [.34, .27, .42]);
    addSphere(this.visualRoot, shellMaterial, [0, .38, -.57], [.27, .22, .25]);
    for (const x of [-.18, .18]) addSphere(this.visualRoot, eyeMaterial, [x, .48, -.76], [.055, .055, .045]);
    const legGeometry = sharedGeometry(THREE.CapsuleGeometry, .045, .31, 2, 6);
    for (const side of [-1, 1]) for (const z of [-.32, 0, .32]) {
      const leg = new THREE.Mesh(legGeometry, bodyMaterial);
      leg.position.set(side * .39, .2, z); leg.rotation.z = side * .95; leg.rotation.x = z * 1.2; leg.castShadow = false; this.visualRoot.add(leg);
    }
    this.healthMax = 8; this.health = this.healthMax; this.status = STATES.IDLE; this.timer = 0;
    this.detectionRange = 9; this.disengageRange = 14; this.attackRange = 2.15;
    this.playerHit = false; this.recoilX = 0; this.recoilZ = 0; this.flashTimer = 0; this.recentDamageTimer = 0;
    this.attackDirection = new THREE.Vector3(); this.attackResolved = false;
    this.attackRemaining = 0;
    this.impactFlinchTimer = 0; this.impactFlinchDuration = 0; this.impactFlinchHold = 0; this.impactFlinchStrength = 0;
    this.impactFlinchDirection = new THREE.Vector3(); this.impactLocalDirection = new THREE.Vector3();
    this.baseShellColor = shellMaterial.color.clone(); this.telegraphColor = new THREE.Color(0xd5863f);
  }

  get isHostile() { return this.status !== STATES.IDLE && this.status !== STATES.DEAD; }

  update(dt, player) {
    this.playerHit = false;
    if (this.status === STATES.DEAD) return;
    this.updateImpactFlinch(dt);
    const dx = player.group.position.x - this.group.position.x;
    const dz = player.group.position.z - this.group.position.z;
    const distance = Math.hypot(dx, dz);
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.recentDamageTimer = Math.max(0, this.recentDamageTimer - dt);
    this.recoilX *= Math.max(0, 1 - dt * 7); this.recoilZ *= Math.max(0, 1 - dt * 7);
    this.group.position.x += this.recoilX * dt; this.group.position.z += this.recoilZ * dt;
    if (this.status === STATES.IDLE) {
      if (distance <= this.detectionRange) this.status = STATES.HOSTILE;
      else { this.updateAppearance(); return; }
    }
    if (distance > this.disengageRange) { this.status = STATES.IDLE; this.timer = 0; this.updateAppearance(); return; }
    if (distance > .001) this.group.rotation.y = Math.atan2(-dx, -dz);

    switch (this.status) {
      case STATES.HOSTILE:
        if (distance <= this.attackRange) { this.status = STATES.TELEGRAPH; this.timer = .78; this.attackResolved = false; }
        else {
          const speed = 1.75 * dt / distance;
          this.group.position.x += dx * speed; this.group.position.z += dz * speed;
        }
        break;
      case STATES.TELEGRAPH:
        this.timer -= dt;
        if (this.timer <= 0) {
          this.attackDirection.set(dx, 0, dz);
          if (this.attackDirection.lengthSq() > .001) this.attackDirection.normalize();
          this.attackRemaining = Math.max(0, distance - .65);
          this.status = STATES.ATTACK; this.timer = .38; this.attackResolved = false;
        }
        break;
      case STATES.ATTACK:
        {
          const travel = Math.min(this.attackRemaining, 7.2 * dt);
          this.group.position.x += this.attackDirection.x * travel;
          this.group.position.z += this.attackDirection.z * travel;
          this.attackRemaining -= travel;
        }
        this.timer -= dt;
        if (!this.attackResolved && this.timer <= .2) {
          this.attackResolved = true;
          const px = player.group.position.x - this.group.position.x;
          const pz = player.group.position.z - this.group.position.z;
          this.playerHit = px * px + pz * pz <= 1.8 * 1.8;
        }
        if (this.timer <= 0) { this.status = STATES.RECOVERY; this.timer = .82; }
        break;
      case STATES.RECOVERY:
        this.timer -= dt;
        if (this.timer <= 0) this.status = STATES.HOSTILE;
        break;
    }
    this.updateAppearance();
  }

  updateAppearance() {
    if (this.flashTimer > 0) this.shell.material.color.setHex(0xffe0a8);
    else if (this.status === STATES.TELEGRAPH) this.shell.material.color.copy(this.telegraphColor);
    else this.shell.material.color.copy(this.baseShellColor);
    const crouch = this.status === STATES.TELEGRAPH ? .88 + Math.sin((.78 - this.timer) * 20) * .08 : 1;
    this.shell.scale.y = .34 * crouch;
  }

  receiveHit(damage, direction, knockback) {
    if (this.status === STATES.DEAD) return false;
    this.health = Math.max(0, this.health - damage);
    this.flashTimer = .14; this.recentDamageTimer = 3; this.recoilX += direction.x * knockback; this.recoilZ += direction.z * knockback;
    if (this.health === 0) { this.status = STATES.DEAD; this.group.visible = false; }
    else { this.status = STATES.RECOVERY; this.timer = Math.max(this.timer, knockback > 1.5 ? .55 : .3); }
    this.updateAppearance();
    return true;
  }

  requestImpactFlinch({ duration, holdDuration, strength, direction }) {
    if (this.status === STATES.DEAD) return false;
    this.impactFlinchDuration = duration;
    this.impactFlinchTimer = duration;
    this.impactFlinchHold = holdDuration;
    this.impactFlinchStrength = strength;
    this.impactFlinchDirection.copy(direction);
    const c = Math.cos(this.group.rotation.y), s = Math.sin(this.group.rotation.y);
    this.impactLocalDirection.set(c * direction.x - s * direction.z, 0, s * direction.x + c * direction.z);
    this.updateImpactFlinch(0);
    return true;
  }

  updateImpactFlinch(dt) {
    if (this.impactFlinchHold > 0) this.impactFlinchHold = Math.max(0, this.impactFlinchHold - dt);
    else this.impactFlinchTimer = Math.max(0, this.impactFlinchTimer - dt);
    const envelope = this.impactFlinchDuration > 0
      ? Math.sin(Math.min(1, this.impactFlinchTimer / this.impactFlinchDuration) * Math.PI / 2)
      : 0;
    this.visualRoot.position.x = this.impactLocalDirection.x * this.impactFlinchStrength * envelope;
    this.visualRoot.position.z = this.impactLocalDirection.z * this.impactFlinchStrength * envelope;
    this.visualRoot.rotation.z = -this.impactLocalDirection.x * .08 * envelope;
  }

  reset() {
    this.group.position.copy(this.spawn); this.group.rotation.set(0, 0, 0); this.group.visible = true;
    this.health = this.healthMax; this.status = STATES.IDLE; this.timer = 0; this.playerHit = false;
    this.recoilX = 0; this.recoilZ = 0; this.flashTimer = 0; this.recentDamageTimer = 0; this.attackResolved = false;
    this.attackRemaining = 0;
    this.impactFlinchTimer = 0; this.impactFlinchDuration = 0; this.impactFlinchHold = 0; this.impactFlinchStrength = 0;
    this.visualRoot.position.set(0, 0, 0); this.visualRoot.rotation.set(0, 0, 0);
    this.updateAppearance();
  }
}

export { STATES as ENEMY_STATES };
