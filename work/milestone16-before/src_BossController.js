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
    this.playerHit = false;
    this.listeners = new Map();
    this.group = new THREE.Group();
    this.group.name = `${id}Boss`;
    this.group.position.copy(this.spawn);
    this.visuals = new THREE.Group();
    this.group.add(this.visuals);
    scene.add(this.group);
  }

  get isDead() { return this.state === BOSS_STATES.DEAD; }
  get isActive() { return this.state !== BOSS_STATES.IDLE && !this.isDead; }
  get isHostile() { return this.isActive; }

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

  face(position) {
    const dx = position.x - this.group.position.x;
    const dz = position.z - this.group.position.z;
    if (dx * dx + dz * dz > .0001) this.group.rotation.y = Math.atan2(-dx, -dz);
  }

  clampToArena() {
    const p = this.group.position;
    p.x = THREE.MathUtils.clamp(p.x, this.arenaBounds.minX, this.arenaBounds.maxX);
    p.z = THREE.MathUtils.clamp(p.z, this.arenaBounds.minZ, this.arenaBounds.maxZ);
  }

  reset() {
    this.health = this.healthMax;
    this.group.position.copy(this.spawn);
    this.group.rotation.set(0, 0, 0);
    this.visuals.rotation.set(0, 0, 0);
    this.visuals.position.set(0, 0, 0);
    this.group.visible = true;
    this.attackType = "NONE";
    this.playerHit = false;
    this.stateTimer = 0;
    this.setState(BOSS_STATES.IDLE, 0);
  }

  update() {}
  receiveSwordHit() { return { hit: false, vulnerable: false, damage: 0 }; }
}
