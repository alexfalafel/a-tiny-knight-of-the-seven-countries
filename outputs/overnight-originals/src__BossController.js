import * as THREE from "three";

export const BOSS_STATES = Object.freeze({
  IDLE: "IDLE", INTRO: "INTRO", APPROACH: "APPROACH", ENGAGED: "ENGAGED", GUARD: "GUARD",
  TELEGRAPH: "TELEGRAPH", ATTACK: "ATTACK", ATTACK_1: "ATTACK_1", ATTACK_2: "ATTACK_2",
  HEAVY_ATTACK: "HEAVY_ATTACK", LUNGE: "LUNGE", RECOVERY: "RECOVERY", STAGGER: "STAGGER", DEAD: "DEAD",
});

export class BossController {
  constructor(scene, { id, name, spawn, arenaBounds, health }) {
    this.id = id;
    this.name = name;
    this.spawn = spawn.clone();
    this.arenaBounds = arenaBounds;
    this.healthMax = health;
    this.health = health;
    this.state = BOSS_STATES.IDLE;
    this.stateTimer = 0;
    this.attackType = "NONE";
    this.playerHit = false; this.attackCooldown = 0; this.trackingEnabled = false; this.distanceToPlayer = 0;
    this.listeners = new Map();
    this.group = new THREE.Group();
    this.group.name = `${id}Boss`;
    this.group.position.copy(this.spawn);
    this.visuals = new THREE.Group();
    this.group.add(this.visuals);
    this.impactVisualRoot = new THREE.Group();
    this.impactVisualRoot.name = "BossImpactVisualRoot";
    this.visuals.add(this.impactVisualRoot);
    this.impactFlinchTimer = 0;
    this.impactFlinchDuration = 0;
    this.impactFlinchHold = 0;
    this.impactFlinchStrength = 0;
    this.impactLocalDirection = new THREE.Vector3();
    scene.add(this.group);
  }

  finalizeImpactVisuals() {
    for (const child of [...this.visuals.children]) {
      if (child !== this.impactVisualRoot) this.impactVisualRoot.add(child);
    }
  }

  requestImpactFlinch({ duration, holdDuration, strength, direction }) {
    if (this.isDead || [BOSS_STATES.STAGGER, BOSS_STATES.DEAD, BOSS_STATES.TELEGRAPH,
      BOSS_STATES.ATTACK, BOSS_STATES.ATTACK_1, BOSS_STATES.ATTACK_2,
      BOSS_STATES.HEAVY_ATTACK, BOSS_STATES.LUNGE].includes(this.state)) return false;
    this.impactFlinchDuration = duration;
    this.impactFlinchTimer = duration;
    this.impactFlinchHold = holdDuration;
    this.impactFlinchStrength = strength;
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
    this.impactVisualRoot.position.x = this.impactLocalDirection.x * this.impactFlinchStrength * envelope;
    this.impactVisualRoot.position.z = this.impactLocalDirection.z * this.impactFlinchStrength * envelope;
    this.impactVisualRoot.rotation.z = -this.impactLocalDirection.x * .055 * envelope;
  }

  get isDead() { return this.state === BOSS_STATES.DEAD; }
  get isActive() { return this.state !== BOSS_STATES.IDLE && !this.isDead; }
  get isHostile() { return this.isActive; }
  get combatPhase() {
    if (this.state === BOSS_STATES.TELEGRAPH) return "WINDUP";
    if ([BOSS_STATES.ATTACK, BOSS_STATES.ATTACK_1, BOSS_STATES.ATTACK_2, BOSS_STATES.HEAVY_ATTACK, BOSS_STATES.LUNGE].includes(this.state)) return "ACTIVE";
    if (this.state === BOSS_STATES.RECOVERY || this.state === BOSS_STATES.STAGGER) return "RECOVERY";
    return "DECISION";
  }

  on(eventName, listener) {
    let listeners = this.listeners.get(eventName);
    if (!listeners) { listeners = new Set(); this.listeners.set(eventName, listeners); }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  emit(eventName, payload) {
    const listeners = this.listeners.get(eventName);
    if (listeners) for (const listener of listeners) listener(payload);
  }

  setState(state, duration = 0) {
    this.state = state;
    this.stateTimer = duration;
    this.emit("stateChanged", { id: this.id, state, attackType: this.attackType });
  }

  face(position, dt = Infinity, turnSpeed = Infinity) {
    const dx = position.x - this.group.position.x;
    const dz = position.z - this.group.position.z;
    if (dx * dx + dz * dz > .0001) {
      const delta = THREE.MathUtils.euclideanModulo(Math.atan2(-dx, -dz) - this.group.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      this.group.rotation.y += THREE.MathUtils.clamp(delta, -turnSpeed * dt, turnSpeed * dt);
    }
  }

  clampToArena() {
    const p = this.group.position;
    p.x = THREE.MathUtils.clamp(p.x, this.arenaBounds.minX, this.arenaBounds.maxX);
    p.z = THREE.MathUtils.clamp(p.z, this.arenaBounds.minZ, this.arenaBounds.maxZ);
  }

  reset() {
    this.attackCooldown = 0; this.trackingEnabled = false;
    this.health = this.healthMax;
    this.group.position.copy(this.spawn);
    this.group.rotation.set(0, 0, 0);
    this.visuals.rotation.set(0, 0, 0);
    this.visuals.position.set(0, 0, 0);
    this.impactFlinchTimer = 0; this.impactFlinchDuration = 0; this.impactFlinchHold = 0; this.impactFlinchStrength = 0;
    this.impactVisualRoot.position.set(0, 0, 0); this.impactVisualRoot.rotation.set(0, 0, 0);
    this.group.visible = true;
    this.attackType = "NONE";
    this.playerHit = false;
    this.stateTimer = 0;
    this.setState(BOSS_STATES.IDLE, 0);
  }

  update() {}
  receiveSwordHit() { return { hit: false, vulnerable: false, damage: 0 }; }
}
