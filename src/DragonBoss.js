import * as THREE from "three";
import { sharedGeometry } from "./SceneOptimization.js";

const clamp = THREE.MathUtils.clamp;
const STATE = Object.freeze({
  INACTIVE: "INACTIVE", DECISION: "DECISION", FIRE_TELEGRAPH: "FIRE_TELEGRAPH", FIRE_SWEEP: "FIRE_SWEEP",
  CLAW_TELEGRAPH: "CLAW_TELEGRAPH", CLAW_SLAM: "CLAW_SLAM", WING_TELEGRAPH: "WING_TELEGRAPH",
  WING_BLAST: "WING_BLAST", BITE_TELEGRAPH: "BITE_TELEGRAPH", BITE_SLAM: "BITE_SLAM",
  RECOVERY: "RECOVERY", VULNERABLE: "VULNERABLE", STAGGER: "STAGGER", PHASE_TRANSITION: "PHASE_TRANSITION",
  RETREAT: "RETREAT", DEATH: "DEATH", DEFEATED: "DEFEATED",
});

function ring(color, inner, outer, opacity = .6) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(sharedGeometry(THREE.RingGeometry, inner, outer, 32), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = .045;
  mesh.visible = false;
  return mesh;
}

export class DragonBoss {
  constructor(scene, { group, camera, keyLight }) {
    this.scene = scene; this.group = group; this.camera = camera; this.keyLight = keyLight;
    this.baseKeyIntensity = keyLight.intensity;
    this.name = "THE ASHEN DRAGON";
    this.id = "ashenDragon";
    this.lockHeight = 0;
    this.cameraDistance = 7.6;
    this.hitRange = 4.8;
    this.state = STATE.INACTIVE;
    this.currentAttack = "NONE";
    this.phase = 1;
    this.healthMax = 18; this.health = this.healthMax;
    this.stagger = 0; this.staggerThreshold = 8; this.forceVulnerable = false;
    this.activeDamageZone = "NONE"; this.playerHit = false;
    this.fightStarted = false; this.defeated = false; this.phaseTwoStarted = false;
    this.stateTimer = 0; this.attackResolved = false; this.windowAfterRecovery = 0;
    this.listeners = new Map(); this.attackIndex = 0;
    this.basePosition = group.userData.basePosition;
    this.attackTarget = new THREE.Vector3(); this.clawTarget = new THREE.Vector3(); this.delta = new THREE.Vector3();
    this.sweepCenter = 0; this.hitChecks = 0; this.deathElapsed = 0;
    this.cameraShake = 0;
    this.effectsEnabled = true;
    this.head = group.userData.head; this.eyes = group.userData.eyes; this.wings = group.userData.wings;
    this.claws = group.userData.claws; this.mouthGlow = group.userData.mouthGlow; this.emberMaterial = group.userData.emberMaterial;
    this.baseEyeGlow = this.emberMaterial.emissiveIntensity;
    this.baseEmberColor = this.emberMaterial.color.clone();
    this.originalY = this.basePosition.y;

    this.fireWarning = new THREE.Mesh(sharedGeometry(THREE.PlaneGeometry, 10.5, 3.3), new THREE.MeshBasicMaterial({ color: 0xff9d26, transparent: true, opacity: .23, side: THREE.DoubleSide, depthWrite: false }));
    this.fireWarning.rotation.x = -Math.PI / 2; this.fireWarning.position.set(38.1, .035, -31); this.fireWarning.visible = false; scene.add(this.fireWarning);
    this.fireStream = new THREE.Mesh(sharedGeometry(THREE.PlaneGeometry, 10.5, 3.3), new THREE.MeshBasicMaterial({ color: 0xff4c19, transparent: true, opacity: .48, side: THREE.DoubleSide, depthWrite: false }));
    this.fireStream.rotation.x = -Math.PI / 2; this.fireStream.position.set(38.1, .055, -31); this.fireStream.visible = false; scene.add(this.fireStream);
    this.clawTelegraph = ring(0xffa13c, 1.65, 2.05, .8); scene.add(this.clawTelegraph);
    this.clawImpact = ring(0xff4427, .3, 2.55, .88); scene.add(this.clawImpact);
    this.clawVisual = new THREE.Group(); scene.add(this.clawVisual);
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x171a1b, roughness: .5, metalness: .2 });
    const clawPalm = new THREE.Mesh(sharedGeometry(THREE.SphereGeometry, 1, 12, 10), clawMat); clawPalm.scale.set(1.3, .72, 1.55); this.clawVisual.add(clawPalm);
    const talonGeometry = sharedGeometry(THREE.ConeGeometry, .2, 1.05, 6);
    for (const x of [-.8, -.27, .27, .8]) {
      const talon = new THREE.Mesh(talonGeometry, clawMat); talon.position.set(x, -.46, -.58); talon.rotation.x = Math.PI; this.clawVisual.add(talon);
    }
    this.clawVisual.visible = false;
    this.gustRings = [];
    const gustMat = new THREE.MeshBasicMaterial({ color: 0xd7d3c1, transparent: true, opacity: .38, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const gust = new THREE.Mesh(sharedGeometry(THREE.TorusGeometry, 2.1 + i * .8, .12, 5, 20), gustMat);
      gust.position.set(this.basePosition.x - 3.5, 1.1 + i * .65, this.basePosition.z); gust.rotation.y = Math.PI / 2; gust.visible = false;
      scene.add(gust); this.gustRings.push(gust);
    }
    this.smoke = new THREE.Group(); this.group.add(this.smoke);
    this.smokeMaterial = new THREE.MeshStandardMaterial({ color: 0x222425, transparent: true, opacity: .4, roughness: 1, depthWrite: false });
    const smokeGeometry = sharedGeometry(THREE.SphereGeometry, 1, 8, 6);
    this.smokePuffs = [];
    for (let i = 0; i < 6; i++) {
      const puff = new THREE.Mesh(smokeGeometry, this.smokeMaterial); puff.position.set((i - 2.5) * .8, 1 + (i % 3) * .45, (i % 2) * 1.1); puff.scale.setScalar(.8 + (i % 3) * .35); puff.visible = false; this.smoke.add(puff); this.smokePuffs.push(puff);
    }
    this.smoke.visible = false;
    this.group.visible = false;
  }

  get isDead() { return this.defeated || this.state === STATE.DEATH || this.health <= 0; }
  get isDying() { return this.state === STATE.DEATH; }
  get isActive() { return this.fightStarted && !this.isDead && this.state !== STATE.INACTIVE; }
  get isHostile() { return this.isActive; }

  setEffectsEnabled(enabled) {
    this.effectsEnabled = enabled;
    this.smoke.visible = enabled && this.isDying;
    if (!enabled) for (const puff of this.smokePuffs) puff.visible = false;
  }
  get vulnerable() { return this.forceVulnerable || this.state === STATE.VULNERABLE || this.state === STATE.STAGGER; }

  on(name, listener) {
    let listeners = this.listeners.get(name);
    if (!listeners) { listeners = new Set(); this.listeners.set(name, listeners); }
    listeners.add(listener); return () => listeners.delete(listener);
  }

  emit(name, payload = {}) { const listeners = this.listeners.get(name); if (listeners) for (const listener of listeners) listener(payload); }

  setState(state, duration = 0) {
    this.state = state; this.stateTimer = duration;
    this.emit("stateChanged", { id: this.id, state, attack: this.currentAttack, phase: this.phase });
  }

  activate() {
    this.resetFight();
    this.fightStarted = true; this.group.visible = true;
    this.group.position.copy(this.basePosition);
    this.group.userData.anatomy.visible = true;
    this.setState(STATE.DECISION, .45);
    return true;
  }

  resetFight() {
    this.fightStarted = false; this.defeated = false; this.phase = 1; this.phaseTwoStarted = false;
    this.health = this.healthMax; this.stagger = 0; this.staggerThreshold = 8; this.attackIndex = 0;
    this.currentAttack = "NONE"; this.activeDamageZone = "NONE"; this.attackResolved = false; this.windowAfterRecovery = 0;
    this.deathElapsed = 0; this.stateTimer = 0; this.playerHit = false; this.group.visible = false;
    this.group.position.copy(this.basePosition); this.group.rotation.set(0, 0, 0);
    this.group.userData.anatomy.visible = true; this.group.userData.anatomy.rotation.set(0, Math.PI / 2, 0);
    this.head.rotation.set(0, 0, 0); this.mouthGlow.visible = false; this.smoke.visible = false; this.smokeMaterial.opacity = .4;
    for (const puff of this.smokePuffs) puff.visible = false;
    this.fireWarning.visible = false; this.fireStream.visible = false; this.clawTelegraph.visible = false; this.clawImpact.visible = false; this.clawVisual.visible = false;
    for (const gust of this.gustRings) gust.visible = false;
    for (const wing of this.wings) wing.rotation.set(0, 0, 0);
    this.emberMaterial.emissiveIntensity = this.baseEyeGlow;
    this.emberMaterial.color.set(0xd4311e);
    this.keyLight.intensity = this.baseKeyIntensity;
  }

  update(dt, player) {
    this.playerHit = false;
    if (this.state === STATE.DEATH) { this.updateDeath(dt); return; }
    if (!this.fightStarted || this.defeated) return;
    if (!player.alive) return;
    this.stateTimer = Math.max(0, this.stateTimer - dt);
    const p = player.group.position;
    this.turnHeadToward(p, dt);
    if (this.vulnerable && !player.inCombat) player.auraWalk = true;
    if (this.forceVulnerable) {
      if (this.state !== STATE.VULNERABLE && this.state !== STATE.STAGGER) this.openVulnerableWindow(9999, p.z);
      this.updateAppearance(); return;
    }
    switch (this.state) {
      case STATE.DECISION:
        if (this.stateTimer <= 0) this.chooseAttack(p);
        break;
      case STATE.FIRE_TELEGRAPH: this.updateFireTelegraph(); break;
      case STATE.FIRE_SWEEP: this.updateFireSweep(dt, player); break;
      case STATE.CLAW_TELEGRAPH: this.updateClawTelegraph(); break;
      case STATE.CLAW_SLAM: this.updateClawSlam(player); break;
      case STATE.WING_TELEGRAPH: this.updateWingTelegraph(); break;
      case STATE.WING_BLAST: this.updateWingBlast(player); break;
      case STATE.BITE_TELEGRAPH: this.updateBiteTelegraph(); break;
      case STATE.BITE_SLAM: this.updateBiteSlam(player); break;
      case STATE.RECOVERY:
        if (this.stateTimer <= 0) {
          if (this.windowAfterRecovery > 0) this.openVulnerableWindow(this.windowAfterRecovery, this.attackTarget.z);
          else this.beginRetreat();
        }
        break;
      case STATE.VULNERABLE:
        if (this.stateTimer <= 0) this.beginRetreat();
        break;
      case STATE.STAGGER:
        if (this.stateTimer <= 0) this.beginRetreat();
        break;
      case STATE.PHASE_TRANSITION:
        if (this.stateTimer <= 0) { this.group.position.copy(this.basePosition); this.setState(STATE.DECISION, .25); }
        break;
      case STATE.RETREAT: this.updateRetreat(dt); break;
    }
    this.updateAppearance();
  }

  chooseAttack(playerPosition) {
    const dx = playerPosition.x - this.group.position.x, dz = playerPosition.z - this.group.position.z;
    const close = dx * dx + dz * dz < 8.5 * 8.5;
    let attack;
    if (close && this.attackIndex % 3 === 2) attack = "CLAW";
    else if (this.phase === 2 && this.attackIndex % 4 === 0) attack = "WING";
    else attack = this.attackIndex % 3 === 0 ? "FIRE" : "BITE";
    this.attackIndex++;
    this.attackTarget.set(playerPosition.x, 0, clamp(playerPosition.z, -38.5, -22.5));
    if (attack === "FIRE") this.beginFire();
    else if (attack === "CLAW") this.beginClaw(playerPosition);
    else if (attack === "WING") this.beginWing();
    else this.beginBite(playerPosition);
  }

  beginFire() {
    this.currentAttack = "FIRE_SWEEP"; this.attackResolved = false; this.activeDamageZone = "FIRE_SWEEP_TELEGRAPH";
    this.mouthGlow.visible = true; this.head.rotation.x = -.18;
    this.fireWarning.visible = true; this.fireStream.visible = false;
    this.fireWarning.position.set(38.1, .04, -35.5);
    this.setState(STATE.FIRE_TELEGRAPH, 1.25);
  }

  updateFireTelegraph() {
    this.fireWarning.material.opacity = .18 + Math.sin(performance.now() * .015) * .08;
    this.mouthGlow.visible = true; this.head.rotation.x = -.22;
    if (this.stateTimer <= 0) {
      this.activeDamageZone = "FIRE_SWEEP"; this.fireWarning.visible = false; this.fireStream.visible = true;
      this.setState(STATE.FIRE_SWEEP, 2.5);
    }
  }

  updateFireSweep(dt, player) {
    const progress = clamp(1 - this.stateTimer / 2.5, 0, 1);
    this.sweepCenter = THREE.MathUtils.lerp(-35.5, -23.8, progress);
    this.fireStream.position.set(38.1, .055, this.sweepCenter);
    this.fireStream.material.opacity = .35 + Math.sin(performance.now() * .04) * .09;
    this.mouthGlow.visible = true;
    const p = player.group.position;
    if (!this.attackResolved && p.x >= 33.1 && p.x <= 42 && Math.abs(p.z - this.sweepCenter) <= 1.45) {
      this.attackResolved = true;
      this.activeDamageZone = "FIRE HIT";
      this.playerHit = true;
      this.camera?.triggerShake(.24, .24);
    }
    if (this.stateTimer <= dt) {
      this.fireStream.visible = false; this.mouthGlow.visible = false; this.head.rotation.x = 0;
      this.windowAfterRecovery = 2.8; this.activeDamageZone = "NONE";
      this.setState(STATE.RECOVERY, .65);
    }
  }

  beginClaw(playerPosition) {
    this.currentAttack = "CLAW_SLAM"; this.attackResolved = false;
    this.clawTarget.set(clamp(playerPosition.x + .65, 32.5, 41.1), 0, clamp(playerPosition.z, -38.5, -22.5));
    this.clawTelegraph.position.set(this.clawTarget.x, .05, this.clawTarget.z); this.clawTelegraph.visible = true;
    this.clawVisual.position.set(this.clawTarget.x, 3.5, this.clawTarget.z); this.clawVisual.visible = true;
    this.activeDamageZone = "CLAW_SLAM_TELEGRAPH";
    this.setState(STATE.CLAW_TELEGRAPH, 1.0);
  }

  updateClawTelegraph() {
    this.clawTelegraph.material.opacity = .45 + Math.sin(performance.now() * .018) * .3;
    this.clawVisual.position.y = 3.0 + Math.sin(performance.now() * .009) * .18;
    if (this.stateTimer <= 0) {
      this.activeDamageZone = "CLAW_SLAM"; this.clawImpact.position.set(this.clawTarget.x, .055, this.clawTarget.z); this.clawImpact.visible = true;
      this.camera?.triggerShake(.17, .25); this.setState(STATE.CLAW_SLAM, .42);
    }
  }

  updateClawSlam(player) {
    const p = player.group.position;
    const t = 1 - this.stateTimer / .42;
    this.clawVisual.position.y = THREE.MathUtils.lerp(3, .72, clamp(t * 2.1, 0, 1));
    if (!this.attackResolved && this.stateTimer <= .23) {
      this.attackResolved = true;
      const dx = p.x - this.clawTarget.x, dz = p.z - this.clawTarget.z;
      if (dx * dx + dz * dz <= 2.15 * 2.15) {
        this.activeDamageZone = "CLAW HIT";
        this.playerHit = true; this.camera?.triggerShake(.42, .38);
      }
    }
    if (this.stateTimer <= .04) {
      this.clawTelegraph.visible = false; this.clawImpact.visible = false; this.clawVisual.visible = false;
      if (!this.attackResolved || this.activeDamageZone !== "CLAW HIT") { this.attackResolved = false; this.openVulnerableWindow(2.4, p.z); }
      else { this.activeDamageZone = "NONE"; this.setState(STATE.RECOVERY, 1.0); }
    }
  }

  beginWing() {
    this.currentAttack = "WING_BLAST"; this.attackResolved = false; this.activeDamageZone = "WING_BLAST_TELEGRAPH";
    for (const gust of this.gustRings) gust.visible = true;
    this.wings[0].rotation.z = -.36; this.wings[1].rotation.z = .36;
    this.setState(STATE.WING_TELEGRAPH, .95);
  }

  updateWingTelegraph() {
    for (let i = 0; i < this.gustRings.length; i++) this.gustRings[i].scale.setScalar(.85 + i * .18 + Math.sin(performance.now() * .01) * .08);
    if (this.stateTimer <= 0) { this.activeDamageZone = "WING_BLAST"; this.setState(STATE.WING_BLAST, .32); }
  }

  updateWingBlast(player) {
    if (!this.attackResolved) {
      this.attackResolved = true;
      const p = player.group.position;
      if (p.x > 31 && p.x < 42 && Math.abs(p.z + 31) < 9 && player.dodgeTimer <= 0) {
        const push = player.dodgeTimer > 0 ? 1.0 : 2.45;
        p.x = clamp(p.x - push, 28, 41.1);
        player.velocity.x = Math.min(player.velocity.x, -3.2);
        player.velocity.z = clamp(player.velocity.z + Math.sign(p.z || 1) * .9, -4.5, 4.5);
      }
      this.camera?.triggerShake(.32, .42);
    }
    if (this.stateTimer <= 0) {
      for (const gust of this.gustRings) gust.visible = false;
      this.wings[0].rotation.z = 0; this.wings[1].rotation.z = 0;
      this.activeDamageZone = "NONE"; this.windowAfterRecovery = 2.2; this.setState(STATE.RECOVERY, .72);
    }
  }

  beginBite(playerPosition) {
    this.currentAttack = "HEAD_SLAM_BITE"; this.attackResolved = false;
    this.attackTarget.set(playerPosition.x, 0, clamp(playerPosition.z, -38.5, -22.5));
    this.activeDamageZone = "HEAD_SLAM_TELEGRAPH"; this.mouthGlow.visible = true;
    this.group.position.set(this.basePosition.x + 2.2, this.basePosition.y + .8, this.attackTarget.z - .3);
    this.head.rotation.x = -.34;
    this.setState(STATE.BITE_TELEGRAPH, 1.2);
  }

  updateBiteTelegraph() {
    this.group.position.x = THREE.MathUtils.lerp(this.group.position.x, this.basePosition.x + 2.2, .12);
    if (this.stateTimer <= 0) {
      this.activeDamageZone = "HEAD_SLAM"; this.camera?.triggerShake(.16, .2);
      this.setState(STATE.BITE_SLAM, .52);
    }
  }

  updateBiteSlam(player) {
    const progress = clamp(1 - this.stateTimer / .52, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    this.group.position.set(THREE.MathUtils.lerp(this.basePosition.x + 2.2, 40.15, eased), THREE.MathUtils.lerp(this.basePosition.y + .8, 1.95, eased), THREE.MathUtils.lerp(this.attackTarget.z - .3, this.attackTarget.z + .5, eased));
    if (!this.attackResolved && this.stateTimer <= .25) {
      this.attackResolved = true;
      const p = player.group.position;
      const dx = p.x - this.group.position.x, dz = p.z - this.group.position.z;
      if (dx * dx + dz * dz <= 2.75 * 2.75) {
        this.activeDamageZone = "HEAD_SLAM HIT"; this.playerHit = true;
      }
      this.camera?.triggerShake(.48, .45);
    }
    if (this.stateTimer <= .035) {
      this.mouthGlow.visible = false; this.head.rotation.x = 0;
      this.openVulnerableWindow(3.3, this.group.position.z);
    }
  }

  openVulnerableWindow(duration, z) {
    this.attackTarget.z = clamp(z, -38.5, -22.5);
    this.group.position.set(40.15, 1.95, this.attackTarget.z);
    this.activeDamageZone = "NONE"; this.attackResolved = false;
    this.currentAttack = "HEAD RECOVERY";
    this.emberMaterial.emissiveIntensity = this.phase === 2 ? 3.4 : 2.6;
    this.emberMaterial.color.set(0xff5b23);
    this.setState(STATE.VULNERABLE, duration);
    this.emit("vulnerable", { duration });
  }

  beginRetreat() {
    this.activeDamageZone = "NONE"; this.currentAttack = "NONE";
    this.mouthGlow.visible = false; this.head.rotation.x = 0;
    this.setState(STATE.RETREAT, .8);
  }

  updateRetreat(dt) {
    const t = 1 - this.stateTimer / .8;
    const eased = t * t * (3 - 2 * t);
    this.group.position.lerpVectors(this.group.position, this.basePosition, 1 - Math.exp(-3 * dt));
    this.emberMaterial.color.lerp(this.baseEmberColor, Math.min(1, dt * 3));
    this.emberMaterial.emissiveIntensity = THREE.MathUtils.lerp(this.phase === 2 ? 3.4 : 2.6, this.baseEyeGlow, eased);
    if (this.stateTimer <= 0) {
      this.group.position.copy(this.basePosition); this.windowAfterRecovery = 0;
      this.setState(STATE.DECISION, this.phase === 2 ? .42 : .62);
    }
  }

  turnHeadToward(position, dt) {
    const dx = position.x - this.group.position.x, dz = position.z - this.group.position.z;
    const localYaw = clamp(Math.atan2(dz, -dx), -.42, .42);
    this.head.rotation.y = THREE.MathUtils.damp(this.head.rotation.y, localYaw, 2.6, dt);
  }

  updateAppearance() {
    const glows = this.state === STATE.FIRE_TELEGRAPH || this.state === STATE.FIRE_SWEEP || this.state === STATE.BITE_TELEGRAPH || this.state === STATE.BITE_SLAM;
    this.mouthGlow.visible = glows;
    this.emberMaterial.emissiveIntensity = this.vulnerable ? (this.phase === 2 ? 3.4 : 2.6) : this.phase === 2 ? 2.8 : this.baseEyeGlow;
    if (this.vulnerable) this.emberMaterial.color.set(0xff5b23);
    else if (this.phase !== 2 && this.state !== STATE.RETREAT) this.emberMaterial.color.copy(this.baseEmberColor);
    const wingPose = this.state === STATE.WING_TELEGRAPH || this.state === STATE.WING_BLAST;
    if (!wingPose && !this.isDead) { this.wings[0].rotation.z = THREE.MathUtils.damp(this.wings[0].rotation.z, 0, 4, .016); this.wings[1].rotation.z = THREE.MathUtils.damp(this.wings[1].rotation.z, 0, 4, .016); }
  }

  setForcedVulnerable(enabled) {
    this.forceVulnerable = enabled;
    if (enabled && this.fightStarted && !this.isDead) this.openVulnerableWindow(9999, this.group.position.z);
    else if (!enabled && this.state === STATE.VULNERABLE) this.beginRetreat();
  }

  checkSwordVolume(start, end) {
    const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
    const lengthSq = dx * dx + dy * dy + dz * dz;
    if (lengthSq < .001) return { hit: false, vulnerable: false };
    const cx = this.group.position.x - start.x, cy = this.group.position.y - start.y, cz = this.group.position.z - start.z;
    const t = clamp((cx * dx + cy * dy + cz * dz) / lengthSq, 0, 1);
    const ex = start.x + dx * t - this.group.position.x, ey = start.y + dy * t - this.group.position.y, ez = start.z + dz * t - this.group.position.z;
    const radius = this.vulnerable ? 2.55 : 1.72;
    this.hitChecks++;
    return { hit: ex * ex + ey * ey + ez * ez <= radius * radius, vulnerable: this.vulnerable, localX: ex, localZ: ez };
  }

  receiveSwordHit({ damage, comboStep }) {
    if (this.isDead) return { hit: false, vulnerable: false, damage: 0 };
    if (!this.vulnerable) return { hit: true, vulnerable: false, damage: 0, hitStop: .035 };
    const dealt = Math.max(1, damage);
    this.health = Math.max(0, this.health - dealt);
    this.stagger += comboStep === 2 ? 3 : 1;
    this.emit("health", { health: this.health, maximum: this.healthMax });
    if (this.health === 0) {
      this.defeated = true; this.fightStarted = false; this.currentAttack = "DEFEATED"; this.activeDamageZone = "NONE";
      this.fireWarning.visible = false; this.fireStream.visible = false; this.clawTelegraph.visible = false; this.clawImpact.visible = false; this.clawVisual.visible = false;
      for (const gust of this.gustRings) gust.visible = false;
      this.smoke.visible = this.effectsEnabled; this.deathElapsed = 0; this.camera?.triggerShake(.62, .85); this.setState(STATE.DEATH, 2.8);
      this.emit("deathStarted", { id: this.id });
    } else if (this.stagger >= this.staggerThreshold && this.state === STATE.VULNERABLE) {
      this.stagger = 0; this.staggerThreshold += 4;
      this.setState(STATE.STAGGER, 2.25); this.camera?.triggerShake(.28, .35);
      this.emit("stagger", { id: this.id });
    }
    if (this.phase === 1 && !this.phaseTwoStarted && this.health <= this.healthMax * .5) {
      this.phase = 2; this.phaseTwoStarted = true; this.group.position.set(this.basePosition.x + 2.2, this.basePosition.y + .9, this.basePosition.z);
      this.emberMaterial.emissiveIntensity = 3.8; this.keyLight.intensity = Math.min(3.0, this.keyLight.intensity + .45);
      if (this.state !== STATE.DEATH) this.setState(STATE.PHASE_TRANSITION, 1.65);
      this.camera?.triggerShake(.54, .7); this.emit("phaseChanged", { phase: 2 });
    }
    return { hit: true, vulnerable: true, damage: dealt, hitStop: comboStep === 2 ? .095 : .065, defeated: this.defeated };
  }

  updateDeath(dt) {
    this.deathElapsed += dt;
    const p = clamp(this.deathElapsed / 2.8, 0, 1);
    this.group.position.x = THREE.MathUtils.lerp(this.basePosition.x, this.basePosition.x + 2.1, p);
    this.group.position.y = THREE.MathUtils.lerp(this.basePosition.y, 1.45, p);
    this.head.rotation.x = -.18 * p;
    this.wings[0].rotation.z = THREE.MathUtils.lerp(0, -.65, p);
    this.wings[1].rotation.z = THREE.MathUtils.lerp(0, .65, p);
    if (this.effectsEnabled) {
      for (let i = 0; i < this.smokePuffs.length; i++) {
        const puff = this.smokePuffs[i]; puff.visible = p > i * .12;
        puff.position.y = 1 + (i % 3) * .45 + p * (1.8 + i * .22);
        puff.material.opacity = Math.max(0, .4 * (1 - p));
      }
    }
    if (p >= 1) {
      this.group.visible = true; this.defeated = true; this.setState(STATE.DEFEATED);
      this.emit("defeated", { id: this.id });
    }
  }

  toggle() { this.emit("debug", { state: this.state, phase: this.phase, health: this.health }); }
}

export { STATE as DRAGON_STATES };
