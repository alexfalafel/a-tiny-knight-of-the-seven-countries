import * as THREE from "three";
import { sharedGeometry } from "./SceneOptimization.js";
import { BossController, BOSS_STATES } from "./BossController.js";

function ellipsoid(parent, geometry, material, position, scale) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position); mesh.scale.set(...scale); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
  return mesh;
}

export class ArmoredBeetleBoss extends BossController {
  constructor(scene, { spawn, arenaBounds }) {
    super(scene, { id: "armoryBeetle", name: "ARMORED BEETLE", spawn, arenaBounds, health: 10 });
    this.activationRange = 8.5;
    this.hitRange = 3.2;
    this.stagger = 0;
    this.staggerThreshold = 5;
    this.flashTimer = 0;
    this.deathTimer = 0;
    this.attackResolved = false;
    this.chargeDirection = new THREE.Vector3();
    this.localPlayer = new THREE.Vector3();
    this.localStart = new THREE.Vector3(); this.localEnd = new THREE.Vector3();
    this.inverseVisualEuler = new THREE.Euler(); this.inverseVisualQuaternion = new THREE.Quaternion();
    this.forceVulnerable = false;
    this.missedCharge = false;
    this.closeAttack = 0;
    this.chargeDistance = 0;
    this.recoverExposed = false;

    const shellMat = new THREE.MeshStandardMaterial({ color: 0x333b3e, metalness: .82, roughness: .28 });
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x28231f, roughness: .78 });
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x596165, metalness: .72, roughness: .36 });
    const hornMat = new THREE.MeshStandardMaterial({ color: 0x948c76, metalness: .58, roughness: .34 });
    this.weakMat = new THREE.MeshStandardMaterial({ color: 0xf0782f, emissive: 0xa12d05, emissiveIntensity: .25, roughness: .5 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xe84d28, emissive: 0x761405, emissiveIntensity: 1.1 });
    const sphereGeometry = sharedGeometry(THREE.SphereGeometry, 1, 18, 12);
    this.body = ellipsoid(this.visuals, sphereGeometry, bodyMat, [0, .67, 0], [1.05, .63, 1.42]);
    this.shell = ellipsoid(this.visuals, sphereGeometry, shellMat, [0, 1.12, .12], [1.22, .76, 1.38]);
    this.head = ellipsoid(this.visuals, sphereGeometry, plateMat, [0, .86, -1.17], [.66, .5, .7]);
    this.weakPoint = ellipsoid(this.visuals, sphereGeometry, this.weakMat, [0, .8, 1.27], [.66, .42, .55]);
    this.weakPoint.visible = false;
    this.weakDebug = ellipsoid(this.visuals, sphereGeometry, new THREE.MeshBasicMaterial({ color: 0x48ff8a, wireframe: true, transparent: true, opacity: .95, depthTest: false }), [0, .8, 1.27], [.86, .56, .9]);
    this.weakDebug.visible = false;
    this.shellDebug = ellipsoid(this.visuals, sphereGeometry, new THREE.MeshBasicMaterial({ color: 0x65baff, wireframe: true, transparent: true, opacity: .75, depthTest: false }), [0, .85, .12], [1.55, .9, 1.72]);
    this.shellDebug.visible = false;
    this.horns = [];
    for (const side of [-1, 1]) {
      ellipsoid(this.visuals, sphereGeometry, eyeMat, [side * .36, .99, -1.63], [.11, .1, .09]);
      const horn = new THREE.Mesh(sharedGeometry(THREE.ConeGeometry, .16, .62, 7), hornMat);
      horn.position.set(side * .27, 1.35, -1.7); horn.rotation.x = -.45; horn.rotation.z = side * -.2; horn.castShadow = true; this.visuals.add(horn); this.horns.push(horn);
    }
    const legGeometry = sharedGeometry(THREE.CapsuleGeometry, .11, .42, 3, 7);
    this.legs = [];
    for (const side of [-1, 1]) for (const z of [-.88, -.05, .8]) {
      const leg = new THREE.Mesh(legGeometry, bodyMat);
      leg.position.set(side * 1.02, .34, z); leg.rotation.z = side * .82; leg.rotation.x = z * .12; leg.castShadow = true; this.visuals.add(leg); this.legs.push(leg);
    }
    const plate = new THREE.Mesh(sharedGeometry(THREE.BoxGeometry, 1.52, .13, .13), plateMat);
    plate.position.set(0, 1.39, .12); this.visuals.add(plate);
    this.baseShellColor = shellMat.color.clone();
    this.telegraphColor = new THREE.Color(0xc95b22);
    this.flashColor = new THREE.Color(0xfff0bf);

    this.sparkGroup = new THREE.Group();
    this.visuals.add(this.sparkGroup);
    this.sparkTimer = 0;
    this.effectsEnabled = true;
    this.sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffdb72, transparent: true, opacity: 1 });
    const sparkGeometry = sharedGeometry(THREE.ConeGeometry, .055, .42, 4);
    for (let i = 0; i < 6; i++) {
      const spark = new THREE.Mesh(sparkGeometry, this.sparkMaterial);
      const angle = (i / 6) * Math.PI * 2;
      spark.position.set(Math.cos(angle) * .2, Math.sin(angle) * .2, 0);
      spark.rotation.z = angle; spark.rotation.x = Math.PI / 2; this.sparkGroup.add(spark);
    }
    this.sparkGroup.visible = false;
    this.slamRing = new THREE.Mesh(sharedGeometry(THREE.RingGeometry, 1.2, 1.38, 32), new THREE.MeshBasicMaterial({ color: 0xff9c38, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }));
    this.slamRing.rotation.x = -Math.PI / 2; this.slamRing.position.y = .035; this.slamRing.visible = false; this.group.add(this.slamRing);
  }

  get vulnerable() {
    return this.forceVulnerable || this.state === BOSS_STATES.STAGGER || (this.state === BOSS_STATES.RECOVERY && this.recoverExposed);
  }

  setHitboxDebug(enabled) { this.shellDebug.visible = enabled; this.weakDebug.visible = enabled; }

  worldToLocal(position, target) {
    const dx = position.x - this.group.position.x; const dz = position.z - this.group.position.z;
    const c = Math.cos(this.group.rotation.y); const s = Math.sin(this.group.rotation.y);
    return target.set(c * dx - s * dz, position.y - this.group.position.y, s * dx + c * dz);
  }

  segmentTouchesEllipse(start, end, centerX, centerZ, radiusX, radiusZ) {
    const ax = (start.x - centerX) / radiusX; const az = (start.z - centerZ) / radiusZ;
    const dx = (end.x - start.x) / radiusX; const dz = (end.z - start.z) / radiusZ;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq > .0001 ? THREE.MathUtils.clamp(-(ax * dx + az * dz) / lengthSq, 0, 1) : 0;
    const x = ax + dx * t; const z = az + dz * t;
    return { hit: x * x + z * z <= 1, x: start.x + (end.x - start.x) * t, z: start.z + (end.z - start.z) * t };
  }

  checkSwordVolume(start, end) {
    this.worldToLocal(start, this.localStart); this.worldToLocal(end, this.localEnd);
    this.inverseVisualEuler.set(-this.visuals.rotation.x, -this.visuals.rotation.y, -this.visuals.rotation.z, "ZYX");
    this.inverseVisualQuaternion.setFromEuler(this.inverseVisualEuler);
    this.localStart.sub(this.visuals.position).applyQuaternion(this.inverseVisualQuaternion);
    this.localEnd.sub(this.visuals.position).applyQuaternion(this.inverseVisualQuaternion);
    const weak = this.segmentTouchesEllipse(this.localStart, this.localEnd, 0, 1.27, .86, .9);
    const shell = this.segmentTouchesEllipse(this.localStart, this.localEnd, 0, .12, 1.55, 1.72);
    if (this.vulnerable && weak.hit) return { hit: true, vulnerable: true, localX: weak.x, localZ: weak.z };
    if (shell.hit) return { hit: true, vulnerable: false, localX: shell.x, localZ: shell.z };
    return { hit: false, vulnerable: false };
  }

  update(dt, player) {
    this.playerHit = false;
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    if (this.effectsEnabled && this.sparkTimer > 0) {
      this.sparkTimer = Math.max(0, this.sparkTimer - dt);
      const p = 1 - this.sparkTimer / .18;
      this.sparkGroup.scale.setScalar(.55 + p * .85);
      this.sparkMaterial.opacity = this.sparkTimer / .18;
      if (this.sparkTimer === 0) this.sparkGroup.visible = false;
    }
    if (this.state === BOSS_STATES.DEAD) {
      this.deathTimer += dt;
      this.visuals.rotation.z = Math.min(1.25, this.deathTimer * 2.1);
      this.visuals.position.y = -Math.min(.38, this.deathTimer * .3);
      if (this.deathTimer >= 1.25) this.group.visible = false;
      this.updateAppearance();
      return;
    }
    const p = player.group.position;
    const dx = p.x - this.group.position.x;
    const dz = p.z - this.group.position.z;
    const distance = Math.hypot(dx, dz);
    if (this.state === BOSS_STATES.IDLE) {
      const enteredArena = p.x >= this.arenaBounds.minX && p.x <= this.arenaBounds.maxX && p.z >= this.arenaBounds.minZ && p.z <= this.arenaBounds.maxZ;
      if (enteredArena || distance <= this.activationRange) {
        this.face(p);
        this.setState(BOSS_STATES.INTRO, .8);
        this.emit("activated", { id: this.id });
      }
      this.updateAppearance();
      return;
    }

    if (p.x < this.arenaBounds.minX - 1.2 || p.x > this.arenaBounds.maxX + 1.2 || p.z < this.arenaBounds.minZ - 1.2 || p.z > this.arenaBounds.maxZ + 1.2) {
      this.resetToIdle();
      return;
    }

    switch (this.state) {
      case BOSS_STATES.INTRO:
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.setState(BOSS_STATES.ENGAGED);
        break;
      case BOSS_STATES.ENGAGED:
        this.face(p);
        if (distance > 5.4) this.beginTelegraph("CHARGE", .82);
        else if (distance > 2.1) this.group.position.addScaledVector(this.chargeDirection.set(dx, 0, dz).normalize(), Math.min(1.25 * dt, distance - 1.9));
        else {
          const type = this.closeAttack++ % 2 === 0 ? "SWIPE" : "SLAM";
          this.beginTelegraph(type, type === "SWIPE" ? .7 : 1.0);
        }
        break;
      case BOSS_STATES.TELEGRAPH:
        this.face(p);
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.beginAttack(p, distance);
        break;
      case BOSS_STATES.ATTACK:
        this.updateAttack(dt, player);
        break;
      case BOSS_STATES.RECOVERY:
      case BOSS_STATES.STAGGER:
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.recoverExposed = false;
          this.stagger = 0;
          this.attackType = "NONE";
          this.setState(BOSS_STATES.ENGAGED);
        }
        break;
    }
    this.clampToArena();
    this.updateAppearance();
  }

  beginTelegraph(type, duration) {
    this.attackType = type;
    this.attackResolved = false;
    this.recoverExposed = false;
    this.setState(BOSS_STATES.TELEGRAPH, duration);
  }

  beginAttack(playerPosition, distance) {
    if (this.attackType === "CHARGE") {
      this.chargeDirection.set(playerPosition.x - this.group.position.x, 0, playerPosition.z - this.group.position.z);
      if (this.chargeDirection.lengthSq() > .001) this.chargeDirection.normalize();
      this.chargeDistance = Math.min(10, distance + 2.7);
      this.setState(BOSS_STATES.ATTACK, Math.max(.35, this.chargeDistance / 9.5));
    } else if (this.attackType === "SWIPE") this.setState(BOSS_STATES.ATTACK, .24);
    else this.setState(BOSS_STATES.ATTACK, .28);
  }

  updateAttack(dt, player) {
    this.stateTimer -= dt;
    const p = player.group.position;
    if (this.attackType === "CHARGE") {
      const step = Math.min(this.chargeDistance, 9.5 * dt);
      this.group.position.x += this.chargeDirection.x * step;
      this.group.position.z += this.chargeDirection.z * step;
      this.chargeDistance -= step;
      const dx = p.x - this.group.position.x; const dz = p.z - this.group.position.z;
      if (!this.attackResolved && dx * dx + dz * dz <= 1.95 * 1.95) this.resolvePlayerHit();
    } else if (!this.attackResolved) {
      const dx = p.x - this.group.position.x; const dz = p.z - this.group.position.z;
      const local = this.playerLocal(p);
      if (this.attackType === "SWIPE" && dx * dx + dz * dz <= 2.75 * 2.75 && local.z < .4) this.resolvePlayerHit();
      if (this.attackType === "SLAM" && dx * dx + dz * dz <= 3.1 * 3.1) this.resolvePlayerHit();
    }
    if (this.stateTimer <= 0) {
      const chargeMissed = this.attackType === "CHARGE" && !this.attackResolved;
      this.recoverExposed = chargeMissed;
      this.setState(BOSS_STATES.RECOVERY, chargeMissed ? 1.65 : .92);
    }
  }

  resolvePlayerHit() {
    this.attackResolved = true;
    this.playerHit = true;
  }

  playerLocal(position) {
    const dx = position.x - this.group.position.x;
    const dz = position.z - this.group.position.z;
    const c = Math.cos(this.group.rotation.y); const s = Math.sin(this.group.rotation.y);
    this.localPlayer.set(c * dx - s * dz, 0, s * dx + c * dz);
    return this.localPlayer;
  }

  receiveSwordHit({ damage, direction, knockback, comboStep, playerPosition, contact }) {
    if (this.isDead) return { hit: false, vulnerable: false, damage: 0 };
    const local = contact || this.playerLocal(playerPosition);
    const weakpointHit = Boolean(contact?.vulnerable && this.vulnerable);
    if (!weakpointHit) {
      this.flashTimer = .18;
      if (this.effectsEnabled) {
        this.sparkGroup.position.set(THREE.MathUtils.clamp(local.localX ?? local.x, -.9, .9), .8, THREE.MathUtils.clamp(local.localZ ?? local.z, -1.05, 1.2));
        this.sparkGroup.scale.setScalar(.55); this.sparkMaterial.opacity = 1; this.sparkGroup.visible = true; this.sparkTimer = .18;
      }
      return { hit: true, vulnerable: false, damage: 0, hitStop: .035 };
    }
    const dealt = Math.max(1, damage);
    this.health = Math.max(0, this.health - dealt);
    this.flashTimer = .24;
    this.group.position.x += direction.x * Math.min(.07, knockback * .02);
    this.group.position.z += direction.z * Math.min(.07, knockback * .02);
    this.stagger += comboStep === 2 ? 3 : 1;
    const defeated = this.health === 0;
    if (defeated) {
      this.attackType = "NONE"; this.recoverExposed = false; this.deathTimer = 0;
      this.setState(BOSS_STATES.DEAD);
      this.emit("defeated", { id: this.id });
    } else if (this.stagger >= this.staggerThreshold) {
      this.recoverExposed = true;
      this.attackType = "STAGGER";
      this.setState(BOSS_STATES.STAGGER, 1.45);
      this.stagger = 0;
    }
    return { hit: true, vulnerable: true, damage: dealt, hitStop: comboStep === 2 ? .1 : .075, defeated };
  }

  updateAppearance() {
    const now = performance.now();
    if (this.flashTimer > 0) this.shell.material.color.copy(this.flashColor);
    else if (this.state === BOSS_STATES.STAGGER && Math.sin(now * .024) > 0) this.shell.material.color.copy(this.flashColor);
    else if (this.vulnerable) this.shell.material.color.set(0x56c878);
    else if (this.state === BOSS_STATES.TELEGRAPH) this.shell.material.color.set(0xffbd45);
    else if (this.state === BOSS_STATES.ATTACK) this.shell.material.color.set(0xe34e36);
    else if (this.state === BOSS_STATES.DEAD) this.shell.material.color.set(0x24282a);
    else this.shell.material.color.copy(this.baseShellColor);
    this.weakPoint.visible = this.vulnerable;
    this.weakMat.color.set(this.vulnerable ? 0x70ff87 : 0xf0782f);
    this.weakMat.emissive.set(this.vulnerable ? 0x13e744 : 0xa12d05);
    this.weakMat.emissiveIntensity = this.vulnerable ? 2.0 + Math.sin(now * .012) * .55 : .25;
    this.slamRing.visible = this.state === BOSS_STATES.TELEGRAPH && this.attackType === "SLAM" || this.state === BOSS_STATES.ATTACK && this.attackType === "SLAM";
    if (this.slamRing.visible) {
      const progress = this.state === BOSS_STATES.TELEGRAPH ? 1 - this.stateTimer / (this.attackType === "SLAM" ? 1 : .7) : 1;
      this.slamRing.scale.setScalar(.65 + progress * .7); this.slamRing.material.opacity = .25 + progress * .65;
    }
    if (this.state === BOSS_STATES.TELEGRAPH && this.attackType === "SLAM") this.visuals.position.y = .45;
    else if (this.state === BOSS_STATES.ATTACK && this.attackType === "SLAM") this.visuals.position.y = -.08;
    else if (this.state === BOSS_STATES.TELEGRAPH && this.attackType === "CHARGE") this.visuals.position.y = -.16;
    else if (this.state !== BOSS_STATES.DEAD && this.state !== BOSS_STATES.STAGGER && this.state !== BOSS_STATES.RECOVERY) this.visuals.position.y = 0;
    this.shell.position.y = this.vulnerable ? 1.45 : 1.12;
    this.shell.rotation.x = this.vulnerable ? -.25 : this.state === BOSS_STATES.TELEGRAPH && this.attackType === "CHARGE" ? .14 : 0;
    if (this.state === BOSS_STATES.TELEGRAPH && this.attackType === "SWIPE") {
      this.visuals.rotation.z = Math.sin(now * .025) * .12;
      this.visuals.rotation.y = -.22;
    } else if (this.state === BOSS_STATES.ATTACK && this.attackType === "SWIPE") {
      this.visuals.rotation.z = Math.sin(now * .035) * .3;
      this.visuals.rotation.y = Math.sin(now * .04) * .46;
    } else if (this.state === BOSS_STATES.STAGGER) {
      this.visuals.rotation.z = .32 + Math.sin(now * .025) * .08;
      this.visuals.rotation.y = 0;
    } else if (this.state !== BOSS_STATES.DEAD) {
      this.visuals.rotation.z = 0;
      this.visuals.rotation.y = 0;
    }
    const chargePose = this.state === BOSS_STATES.TELEGRAPH && this.attackType === "CHARGE";
    this.head.rotation.x = chargePose ? -.28 : 0;
    for (const horn of this.horns) horn.rotation.x = chargePose ? -.78 : -.45;
    if (this.state === BOSS_STATES.DEAD || this.state === BOSS_STATES.STAGGER) return;
    const gait = this.state === BOSS_STATES.ENGAGED ? Math.sin(now * .008) * .08 : 0;
    for (let i = 0; i < this.legs.length; i++) this.legs[i].rotation.z = (i % 2 === 0 ? 1 : -1) * (.82 + gait);
  }

  setEffectsEnabled(enabled) {
    this.effectsEnabled = enabled;
    if (!enabled) { this.sparkTimer = 0; this.sparkGroup.visible = false; }
  }

  resetToIdle() {
    if (this.isDead) return;
    this.reset();
    this.stagger = 0; this.flashTimer = 0; this.sparkTimer = 0; this.sparkGroup.visible = false;
    this.missedCharge = false; this.recoverExposed = false; this.closeAttack = 0;
    this.emit("reset", { id: this.id });
  }
}

export { BOSS_STATES };
