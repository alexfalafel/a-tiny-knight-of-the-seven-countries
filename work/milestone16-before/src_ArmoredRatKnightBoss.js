import * as THREE from "three";
import { sharedGeometry } from "./SceneOptimization.js";
import { BossController, BOSS_STATES } from "./BossController.js";

function addMesh(parent, geometry, material, position, scale = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
  return mesh;
}

function addCapsule(parent, material, position, radius, length, rotation = [0, 0, 0]) {
  const mesh = addMesh(parent, sharedGeometry(THREE.CapsuleGeometry, radius, length, 4, 8), material, position);
  mesh.rotation.set(...rotation);
  return mesh;
}

export class ArmoredRatKnightBoss extends BossController {
  constructor(scene, { spawn, arenaBounds }) {
    super(scene, { id: "royalChambersRatKnight", name: "ARMORED RAT KNIGHT", spawn, arenaBounds, health: 18 });
    this.activationRange = 9.25;
    this.lockHeight = 1.85;
    this.hitRange = 3.55;
    this.attackResolved = false;
    this.pendingSecondSlash = false;
    this.attackCount = 0;
    this.stagger = 0;
    this.staggerThreshold = 6;
    this.staggerResistanceTimer = 0;
    this.flashTimer = 0;
    this.deathTimer = 0;
    this.attackDirection = new THREE.Vector3();
    this.localPlayer = new THREE.Vector3();
    this.localStart = new THREE.Vector3(); this.localEnd = new THREE.Vector3();
    this.inverseVisualEuler = new THREE.Euler(); this.inverseVisualQuaternion = new THREE.Quaternion();
    this.sparkTimer = 0;
    this.effectsEnabled = true;

    const fur = new THREE.MeshStandardMaterial({ color: 0x493b32, roughness: .84 });
    const armor = new THREE.MeshStandardMaterial({ color: 0x30383c, metalness: .78, roughness: .32 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x77756a, metalness: .68, roughness: .36 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x392b22, roughness: .88 });
    this.accent = new THREE.MeshStandardMaterial({ color: 0x77715e, metalness: .56, roughness: .4, emissive: 0x22160a, emissiveIntensity: .12 });
    const eye = new THREE.MeshStandardMaterial({ color: 0xc96a39, emissive: 0x5b1e0a, emissiveIntensity: .75, roughness: .38 });
    const sphere = sharedGeometry(THREE.SphereGeometry, 1, 16, 12);
    const plate = sharedGeometry(THREE.BoxGeometry, 1, 1, 1);

    // Upright rat silhouette: armored chest, narrow muzzle, tall ears, legs, and a long tail.
    addMesh(this.visuals, sphere, fur, [0, 1.48, .08], [.57, .83, .39]);
    this.chest = addMesh(this.visuals, sphere, armor, [0, 1.74, -.06], [.76, .78, .49]);
    addMesh(this.visuals, plate, trim, [0, 1.79, -.46], [.48, .77, .1]);
    addMesh(this.visuals, sphere, armor, [0, 2.5, -.08], [.47, .47, .42]);
    addMesh(this.visuals, sphere, fur, [0, 2.43, -.38], [.3, .23, .34]);
    addMesh(this.visuals, sphere, fur, [0, 2.34, -.66], [.2, .14, .25]);
    addMesh(this.visuals, sphere, leather, [0, 2.38, -.82], [.09, .075, .07]);
    for (const side of [-1, 1]) {
      addMesh(this.visuals, sphere, fur, [side * .34, 2.83, -.07], [.14, .3, .12]);
      addMesh(this.visuals, sphere, eye, [side * .27, 2.56, -.43], [.055, .06, .04]);
      addMesh(this.visuals, sphere, armor, [side * .78, 2.08, -.02], [.37, .38, .38]);
      addMesh(this.visuals, sphere, trim, [side * .81, 2.1, -.31], [.29, .28, .13]);
      const leg = new THREE.Group(); leg.position.set(side * .34, .87, .02); this.visuals.add(leg);
      addCapsule(leg, armor, [0, -.28, 0], .2, .55);
      addMesh(leg, plate, armor, [0, -0.68, -.13], [.32, .22, .48]);
      if (side < 0) this.leftLeg = leg;
      else this.rightLeg = leg;
    }
    addMesh(this.visuals, plate, trim, [0, 1.12, -.05], [.85, .25, .57]);

    this.leftArm = new THREE.Group(); this.leftArm.position.set(-.79, 2.03, -.02); this.visuals.add(this.leftArm);
    addCapsule(this.leftArm, armor, [0, -.27, 0], .17, .48);
    addCapsule(this.leftArm, armor, [-.04, -.7, -.07], .15, .39, [.18, 0, -.12]);
    addMesh(this.leftArm, sphere, trim, [-.04, -.94, -.13], [.2, .19, .19]);

    this.weaponArm = new THREE.Group(); this.weaponArm.position.set(.79, 2.1, -.03); this.visuals.add(this.weaponArm);
    addCapsule(this.weaponArm, armor, [0, -.27, 0], .18, .5);
    addCapsule(this.weaponArm, armor, [.04, -.72, -.09], .16, .42, [-.12, 0, .08]);
    addMesh(this.weaponArm, sphere, trim, [.05, -.97, -.15], [.21, .2, .2]);
    this.weapon = new THREE.Group(); this.weapon.position.set(.08, -1.02, -.2); this.weaponArm.add(this.weapon);
    addMesh(this.weapon, sharedGeometry(THREE.CylinderGeometry, .07, .085, .52, 8), leather, [0, -.17, 0]);
    addMesh(this.weapon, sharedGeometry(THREE.BoxGeometry, .64, .13, .18), trim, [0, .1, 0]);
    this.blade = addMesh(this.weapon, sharedGeometry(THREE.BoxGeometry, .3, 1.7, .1), armor, [0, 1.0, 0]);
    addMesh(this.weapon, sharedGeometry(THREE.ConeGeometry, .16, .34, 4), trim, [0, 2.0, 0]);

    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, .72, .35), new THREE.Vector3(.05, .42, .78), new THREE.Vector3(.18, .2, 1.22),
      new THREE.Vector3(.13, .16, 1.62), new THREE.Vector3(-.08, .27, 1.92),
    ]);
    this.tail = addMesh(this.visuals, new THREE.TubeGeometry(tailCurve, 20, .055, 6, false), leather, [0, 0, 0]);

    this.shellColor = armor.color.clone();
    this.warningColor = new THREE.Color(0xb88747);
    this.attackColor = new THREE.Color(0x9b3e33);
    this.flashColor = new THREE.Color(0xffedc5);
    this.sparkGroup = new THREE.Group(); this.visuals.add(this.sparkGroup);
    this.sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffd476, transparent: true, opacity: 1, depthWrite: false });
    const sparkGeometry = sharedGeometry(THREE.ConeGeometry, .045, .34, 4);
    for (let i = 0; i < 6; i++) {
      const spark = new THREE.Mesh(sparkGeometry, this.sparkMaterial);
      const angle = i * Math.PI / 3;
      spark.position.set(Math.cos(angle) * .18, Math.sin(angle) * .18, 0);
      spark.rotation.z = angle; spark.rotation.x = Math.PI / 2; this.sparkGroup.add(spark);
    }
    this.sparkGroup.visible = false;
  }

  update(dt, player) {
    this.playerHit = false;
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.staggerResistanceTimer = Math.max(0, this.staggerResistanceTimer - dt);
    if (this.effectsEnabled && this.sparkTimer > 0) {
      this.sparkTimer = Math.max(0, this.sparkTimer - dt);
      const progress = 1 - this.sparkTimer / .2;
      this.sparkGroup.scale.setScalar(.55 + progress * .8);
      this.sparkMaterial.opacity = this.sparkTimer / .2;
      if (this.sparkTimer === 0) this.sparkGroup.visible = false;
    }

    if (this.state === BOSS_STATES.DEAD) {
      this.deathTimer += dt;
      this.visuals.rotation.z = Math.min(1.1, this.deathTimer * 1.5);
      this.visuals.position.y = -Math.min(.65, this.deathTimer * .45);
      if (this.deathTimer > 1.45) this.group.visible = false;
      this.updateAppearance();
      return;
    }

    const p = player.group.position;
    const dx = p.x - this.group.position.x;
    const dz = p.z - this.group.position.z;
    const distance = Math.hypot(dx, dz);
    if (this.state === BOSS_STATES.IDLE) {
      const inside = p.x >= this.arenaBounds.minX && p.x <= this.arenaBounds.maxX && p.z >= this.arenaBounds.minZ && p.z <= this.arenaBounds.maxZ;
      if (inside || distance <= this.activationRange) {
        this.face(p); this.attackCount = 0;
        this.setState(BOSS_STATES.INTRO, 1.3);
        this.emit("activated", { id: this.id });
      }
      this.updateAppearance();
      return;
    }
    if (p.x < this.arenaBounds.minX - 2 || p.x > this.arenaBounds.maxX + 2 || p.z < this.arenaBounds.minZ - 2 || p.z > this.arenaBounds.maxZ + 2) {
      this.resetToIdle();
      return;
    }

    switch (this.state) {
      case BOSS_STATES.INTRO:
        this.face(p);
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.setState(BOSS_STATES.APPROACH);
        break;
      case BOSS_STATES.APPROACH:
        this.face(p);
        if (distance > 9.5) {
          this.group.position.addScaledVector(this.attackDirection.set(dx, 0, dz).normalize(), Math.min(1.7 * dt, distance - 5));
        } else if (distance > 4.8) {
          this.beginTelegraph("LUNGE", .62);
        } else if (distance > 3.15) {
          this.group.position.addScaledVector(this.attackDirection.set(dx, 0, dz).normalize(), Math.min(1.15 * dt, distance - 2.9));
        } else this.chooseCloseAction();
        break;
      case BOSS_STATES.GUARD:
        this.face(p); this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.beginTelegraph("HEAVY", .72);
        break;
      case BOSS_STATES.TELEGRAPH:
        this.face(p); this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.beginActiveAttack(p, distance);
        break;
      case BOSS_STATES.ATTACK_1:
      case BOSS_STATES.ATTACK_2:
      case BOSS_STATES.HEAVY_ATTACK:
        this.stateTimer -= dt;
        this.resolveMeleeWindow(player);
        if (this.stateTimer <= 0) {
          if (this.state === BOSS_STATES.ATTACK_1) {
            this.pendingSecondSlash = true;
            this.setState(BOSS_STATES.RECOVERY, .2);
          } else this.setState(BOSS_STATES.RECOVERY, this.state === BOSS_STATES.HEAVY_ATTACK ? 1.35 : .98);
        }
        break;
      case BOSS_STATES.LUNGE: {
        this.stateTimer -= dt;
        const step = Math.min(this.lungeRemaining, 8.5 * dt);
        this.group.position.addScaledVector(this.attackDirection, step);
        this.lungeRemaining -= step;
        const lx = p.x - this.group.position.x; const lz = p.z - this.group.position.z;
        if (!this.attackResolved && lx * lx + lz * lz <= 1.45 * 1.45) this.resolvePlayerHit();
        if (this.stateTimer <= 0 || this.lungeRemaining <= .01) this.setState(BOSS_STATES.RECOVERY, 1.05);
        break;
      }
      case BOSS_STATES.RECOVERY:
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          if (this.pendingSecondSlash) {
            this.pendingSecondSlash = false;
            this.beginTelegraph("COMBO_2", .38);
          } else {
            this.attackType = "NONE";
            this.setState(BOSS_STATES.APPROACH);
          }
        }
        break;
      case BOSS_STATES.STAGGER:
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.stagger = 0; this.attackType = "NONE";
          this.setState(BOSS_STATES.APPROACH);
        }
        break;
    }
    this.clampToArena();
    this.updateAppearance();
  }

  chooseCloseAction() {
    this.attackCount++;
    if (this.attackCount % 4 === 0) this.setState(BOSS_STATES.GUARD, 1.05);
    else if (this.attackCount % 3 === 0) this.beginTelegraph("HEAVY", 1.0);
    else this.beginTelegraph("COMBO_1", .58);
  }

  beginTelegraph(type, duration) {
    this.attackType = type; this.attackResolved = false;
    this.setState(BOSS_STATES.TELEGRAPH, duration);
  }

  beginActiveAttack(playerPosition, distance) {
    this.face(playerPosition);
    this.attackResolved = false;
    if (this.attackType === "COMBO_1") this.setState(BOSS_STATES.ATTACK_1, .32);
    else if (this.attackType === "COMBO_2") this.setState(BOSS_STATES.ATTACK_2, .36);
    else if (this.attackType === "HEAVY") this.setState(BOSS_STATES.HEAVY_ATTACK, .4);
    else {
      this.attackDirection.set(playerPosition.x - this.group.position.x, 0, playerPosition.z - this.group.position.z);
      if (this.attackDirection.lengthSq() > .001) this.attackDirection.normalize();
      this.lungeRemaining = Math.min(7.5, distance + 1.35);
      this.setState(BOSS_STATES.LUNGE, Math.max(.42, this.lungeRemaining / 8.5));
    }
  }

  resolveMeleeWindow(player) {
    const impactAt = this.state === BOSS_STATES.HEAVY_ATTACK ? .22 : .17;
    if (!this.attackResolved && this.stateTimer <= impactAt) {
      this.attackResolved = true;
      const local = this.playerLocal(player.group.position);
      const reach = this.state === BOSS_STATES.HEAVY_ATTACK ? 4.0 : 3.45;
      const dx = player.group.position.x - this.group.position.x;
      const dz = player.group.position.z - this.group.position.z;
      if (dx * dx + dz * dz <= reach * reach && local.z < .72 && Math.abs(local.x) < (this.state === BOSS_STATES.HEAVY_ATTACK ? 2.05 : 1.8)) this.resolvePlayerHit();
    }
  }

  resolvePlayerHit() { this.attackResolved = true; this.playerHit = true; }

  playerLocal(position) {
    const dx = position.x - this.group.position.x; const dz = position.z - this.group.position.z;
    const c = Math.cos(this.group.rotation.y); const s = Math.sin(this.group.rotation.y);
    return this.localPlayer.set(c * dx - s * dz, 0, s * dx + c * dz);
  }

  toVisualLocal(point, target) {
    const dx = point.x - this.group.position.x; const dz = point.z - this.group.position.z;
    const c = Math.cos(this.group.rotation.y); const s = Math.sin(this.group.rotation.y);
    target.set(c * dx - s * dz, 0, s * dx + c * dz);
    this.inverseVisualEuler.set(-this.visuals.rotation.x, -this.visuals.rotation.y, -this.visuals.rotation.z, "ZYX");
    this.inverseVisualQuaternion.setFromEuler(this.inverseVisualEuler);
    return target.sub(this.visuals.position).applyQuaternion(this.inverseVisualQuaternion);
  }

  checkSwordVolume(start, end) {
    this.toVisualLocal(start, this.localStart); this.toVisualLocal(end, this.localEnd);
    const dx = (this.localEnd.x - this.localStart.x) / 1.28;
    const dz = (this.localEnd.z - this.localStart.z) / 1.15;
    const ax = this.localStart.x / 1.28;
    const az = (this.localStart.z + .22) / 1.15;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq > .0001 ? THREE.MathUtils.clamp(-(ax * dx + az * dz) / lengthSq, 0, 1) : 0;
    const x = ax + dx * t; const z = az + dz * t;
    return { hit: x * x + z * z <= 1, vulnerable: true, localX: x * 1.28, localZ: z * 1.15 - .22 };
  }

  receiveSwordHit({ damage, direction, knockback, comboStep, playerPosition }) {
    if (this.isDead) return { hit: false, damage: 0 };
    const local = this.playerLocal(playerPosition);
    if (this.state === BOSS_STATES.GUARD && local.z < .45 && Math.abs(local.x) < 2.1) {
      this.spawnSparks(local.x, local.z);
      this.stagger += comboStep === 2 ? 2 : .5;
      if (this.stagger >= this.staggerThreshold) this.startStagger(false);
      else if (this.visuals.rotation.z === 0) this.visuals.rotation.z = .035;
      return { hit: true, blocked: true, vulnerable: false, damage: 0, hitStop: .04 };
    }
    this.health = Math.max(0, this.health - Math.max(1, damage));
    this.flashTimer = .22;
    this.group.position.addScaledVector(direction, Math.min(.12, knockback * .035));
    if (this.staggerResistanceTimer <= 0) this.stagger += comboStep === 2 ? 2 : 1;
    const defeated = this.health === 0;
    if (defeated) {
      this.pendingSecondSlash = false; this.attackType = "NONE"; this.deathTimer = 0;
      this.setState(BOSS_STATES.DEAD);
      this.emit("defeated", { id: this.id });
    } else if (this.stagger >= this.staggerThreshold && this.staggerResistanceTimer <= 0) this.startStagger(true);
    return { hit: true, blocked: false, vulnerable: true, damage: Math.max(1, damage), hitStop: comboStep === 2 ? .09 : .065, defeated };
  }

  startStagger(fromDamage) {
    this.stagger = 0; this.pendingSecondSlash = false; this.attackResolved = true;
    this.staggerResistanceTimer = 2.6;
    if (fromDamage) this.health = Math.max(0, this.health);
    this.attackType = "STAGGER";
    this.setState(BOSS_STATES.STAGGER, 1.2);
  }

  spawnSparks(x, z) {
    if (!this.effectsEnabled) return;
    this.sparkGroup.position.set(THREE.MathUtils.clamp(x, -1.0, 1.0), 1.8, THREE.MathUtils.clamp(z, -.8, .2));
    this.sparkGroup.scale.setScalar(.55); this.sparkMaterial.opacity = 1; this.sparkGroup.visible = true; this.sparkTimer = .2;
  }

  updateAppearance() {
    const now = performance.now();
    if (this.flashTimer > 0) this.chest.material.color.copy(this.flashColor);
    else if (this.state === BOSS_STATES.STAGGER && Math.sin(now * .025) > 0) this.chest.material.color.copy(this.flashColor);
    else if (this.state === BOSS_STATES.TELEGRAPH) this.chest.material.color.copy(this.warningColor);
    else if (this.state === BOSS_STATES.ATTACK_1 || this.state === BOSS_STATES.ATTACK_2 || this.state === BOSS_STATES.HEAVY_ATTACK || this.state === BOSS_STATES.LUNGE) this.chest.material.color.copy(this.attackColor);
    else if (this.state === BOSS_STATES.DEAD) this.chest.material.color.set(0x202426);
    else this.chest.material.color.copy(this.shellColor);

    this.leftArm.rotation.set(0, 0, 0);
    this.weaponArm.rotation.set(0, 0, 0);
    this.weaponArm.position.set(.79, 2.1, -.03);
    this.weapon.rotation.set(0, 0, 0);
    this.visuals.position.y = 0;
    this.visuals.rotation.z = 0;
    if (this.state === BOSS_STATES.GUARD) {
      this.leftArm.rotation.set(-.28, 0, -.82);
      this.weaponArm.rotation.set(-.22, 0, .6);
      this.weapon.rotation.z = .78;
    } else if (this.state === BOSS_STATES.TELEGRAPH) {
      if (this.attackType === "COMBO_1") { this.weaponArm.rotation.z = -1.05; this.leftArm.rotation.z = .32; }
      else if (this.attackType === "COMBO_2") { this.weaponArm.rotation.z = 1.0; this.leftArm.rotation.z = -.28; }
      else if (this.attackType === "HEAVY") { this.weaponArm.position.y = 2.42; this.weaponArm.rotation.x = -.18; this.weaponArm.rotation.z = -.58; this.visuals.rotation.z = -.12; }
      else if (this.attackType === "LUNGE") { this.visuals.position.y = -.22; this.weaponArm.rotation.x = -.8; this.weaponArm.rotation.z = -.25; }
    } else if (this.state === BOSS_STATES.ATTACK_1) {
      this.weaponArm.rotation.z = .95; this.leftArm.rotation.z = -.2;
    } else if (this.state === BOSS_STATES.ATTACK_2) {
      this.weaponArm.rotation.z = -1.0; this.leftArm.rotation.z = .2;
    } else if (this.state === BOSS_STATES.HEAVY_ATTACK) {
      this.weaponArm.rotation.z = .72; this.weapon.rotation.x = -1.05; this.visuals.rotation.z = .18;
    } else if (this.state === BOSS_STATES.LUNGE) {
      this.visuals.position.y = -.2; this.weaponArm.rotation.x = -.9; this.weaponArm.rotation.z = -.18;
    } else if (this.state === BOSS_STATES.STAGGER) {
      this.visuals.rotation.z = .28 + Math.sin(now * .022) * .07;
      this.weaponArm.rotation.z = -.55; this.leftArm.rotation.z = .42;
    } else if (this.state === BOSS_STATES.RECOVERY) {
      this.visuals.rotation.z = .08;
      this.weaponArm.rotation.z = .34;
    }
    if (this.state === BOSS_STATES.APPROACH || this.state === BOSS_STATES.INTRO) {
      const gait = Math.sin(now * .008) * .04;
      this.leftLeg.rotation.x = gait; this.rightLeg.rotation.x = -gait;
    }
  }

  setEffectsEnabled(enabled) {
    this.effectsEnabled = enabled;
    if (!enabled) { this.sparkTimer = 0; this.sparkGroup.visible = false; }
  }

  resetToIdle() {
    if (this.isDead) return;
    this.reset();
    this.attackType = "NONE"; this.attackResolved = false; this.pendingSecondSlash = false;
    this.attackCount = 0; this.stagger = 0; this.staggerResistanceTimer = 0;
    this.flashTimer = 0; this.deathTimer = 0; this.sparkTimer = 0; this.sparkGroup.visible = false;
    this.visuals.rotation.set(0, 0, 0); this.visuals.position.set(0, 0, 0);
    this.weaponArm.position.set(.79, 2.1, -.03);
    this.updateAppearance();
  }
}

export { BOSS_STATES };
