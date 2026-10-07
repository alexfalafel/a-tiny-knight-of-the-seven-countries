import * as THREE from "three";
import { PLAYER_COMBAT } from "./CombatConfig.js";
import { PlayerVisual } from "./PlayerVisual.js";
import { PLAYER_ANIMATION_CONFIG } from "./PlayerAnimationController.js";
import { PLAYER_COLLIDER_HEIGHT, PLAYER_COLLIDER_RADIUS, PLAYER_VISUAL_HEIGHT, PLAYER_WORLD_SCALE } from "./PlayerScale.js";
import { consumePlayerActionSlot } from "./PlayerActionSlots.js";

const STATES = { DEAD: "DEAD", HEALING: "HEALING", EMOTING: "EMOTING", RUN: "RUN", AURA_WALK: "AURA_WALK", COMBAT: "COMBAT", CLIMB: "CLIMB", ATTACK: "ATTACK", DODGE: "DODGE", AIRBORNE: "AIRBORNE" };
const ATTACK_DURATION = [.48, .54, .82];
const ATTACK_IMPACT = [.19, .22, .37];
const HELD_ATTACK_QUALIFY_TIME = .12;
const FLOOR_SURFACE_IDS = Object.freeze({ greatHall: "greatHall-floor", royalKitchen: "royalKitchen-floor", armory: "armory-floor", dungeon: "dungeon-floor", royalChambers: "royalChambers-floor", throneRoom: "throneRoom-floor" });
const GROUND_SHADOW_OFFSET = .015;
const SUPPORT_HEIGHT_TOLERANCE = .15;

export class PlayerController {
  constructor(scene, spawn, colliders, climbables) {
    this.group = new THREE.Group(); scene.add(this.group); this.spawn = spawn.clone(); this.group.position.copy(spawn);
    this.cameraTarget = new THREE.Object3D(); this.cameraTarget.name = "PlayerCameraTarget"; this.cameraTarget.position.set(0, .82, 0); this.group.add(this.cameraTarget);
    this.collisionQuery = typeof colliders === "function" ? colliders : null;
    this.colliders = Array.isArray(colliders) ? colliders : [];
    this.collisionCandidates = []; this.collisionRoomId = "greatHall";
    this.climbables = climbables; this.climbableSurfaces = climbables?.surfaces || []; this.climbTarget = null;
    this.groundContact = { point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), surface: FLOOR_SURFACE_IDS.greatHall, distance: 0, valid: true };
    this.shadowGroundY = spawn.y;
    this.shadowGroundSurface = FLOOR_SURFACE_IDS.greatHall;
    this.visualUpdateContext = { grounded: true, alive: true, moving: false, state: "IDLE_ALL_FOURS", roomId: this.collisionRoomId, groundContact: this.groundContact, colliders: this.collisionCandidates };
    this.interactionsEnabled = true;
    this.lastCollisionMs = 0;
    this.climbOffset = 0; this.climbStamina = 100; this.climbStaminaMax = 100;
    this.climbDrain = 5.5; this.climbMoveSpeed = 2.35; this.climbJumpCost = 28;
    this.velocity = new THREE.Vector3(); this.moveWish = new THREE.Vector3();
    this.wish = new THREE.Vector3(); this.desiredVelocity = new THREE.Vector3(); this.dodgeDirection = new THREE.Vector3();
    this.lockDirection = new THREE.Vector3(); this.lockRight = new THREE.Vector3();
    this.knockbackDirection = new THREE.Vector3(); this.collisionChecks = 0;
    this.grounded = true; this.animationGrounded = true; this.groundGraceTimer = 0; this.locomotionGraceTimer = 0; this.jumpInProgress = false;
    this.planarSpeed = 0; this.moveInputActive = false; this.auraWalk = false; this.state = STATES.RUN; this.dodgeTimer = 0; this.dodgeCooldown = 0;
    this.radius = PLAYER_COLLIDER_RADIUS; this.height = PLAYER_COLLIDER_HEIGHT; this.visualHeight = PLAYER_VISUAL_HEIGHT;
    this.walkSpeed = 3.1; this.runSpeed = 5.2;
    this.healthMax = PLAYER_COMBAT.maxHP; this.health = this.healthMax; this.healCharges = PLAYER_COMBAT.maxHealCharges; this.healing = false; this.healElapsed = 0; this.healCommitted = false; this.healPulseTimer = 0; this.alive = true; this.invulnerabilityTimer = 0; this.damageFlashTimer = 0; this.hitStopTimer = 0; this.impactHitStopTimer = 0;
    this.combatTimer = 0; this.attackActive = false; this.attackElapsed = 0; this.attackStep = 0;
    this.externalCombatActive = false;
    this.activeEmote = null;
    this.comboStep = 0; this.comboResetTimer = 0; this.attackBufferTimer = 0;
    this.attackHoldArmed = false; this.attackHoldElapsed = 0; this.attackBufferFromHold = false;
    this.attackImpactDone = false; this.attackImpactSerial = 0; this.attackDamage = 1; this.attackKnockback = 1.2;
    this.visual = new PlayerVisual(this.group);
    this.visualState = "IDLE_ALL_FOURS"; this.visualMoving = false; this.visualClock = 0;
    this.visualParameters = { moving: false, attackStep: 0, elapsed: 0 };
    this.visualTestState = null;
    this.visualTransient = null; this.visualTransientTimer = 0; this.presentationRoll = 0;
    this.climbVisualState = "CLIMB_IDLE";
    this.climbInputDirection = "NONE";
    this.climbInputX = 0;
    this.climbInputY = 0;
    this.wasGrounded = true;
    this.crownProp = null;
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(.35 * PLAYER_WORLD_SCALE, 18), new THREE.MeshBasicMaterial({ color: 0x090a0a, transparent: true, opacity: .36, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = GROUND_SHADOW_OFFSET; this.group.add(this.shadow);
  }

  get isInvulnerable() { return this.invulnerabilityTimer > 0 || this.dodgeTimer > 0; }
  get inCombat() { return this.combatTimer > 0 || this.attackActive; }
  get combatActive() { return this.alive && (this.inCombat || this.externalCombatActive); }
  get isEmoting() { return this.state === STATES.EMOTING && this.activeEmote !== null; }

  resolveWeaponState() {
    const forcedSheathed = this.state === STATES.EMOTING || this.state === STATES.CLIMB
      || (this.inFinale && !this.externalCombatActive) || !this.alive;
    return !forcedSheathed && this.combatActive ? "DRAWN" : "SHEATHED";
  }

  syncWeaponState() {
    this.visual.setWeaponState(this.resolveWeaponState(), this.combatActive);
  }

  setCombatContextActive(active) {
    this.externalCombatActive = Boolean(active);
    this.syncWeaponState();
  }

  refillTonic() { this.healCharges = PLAYER_COMBAT.maxHealCharges; }

  cancelHeal() { this.healing = false; this.healElapsed = 0; this.healCommitted = false; if (this.state === STATES.HEALING) this.state = STATES.COMBAT; }

  startHeal() {
    if (!this.canStartHeal()) return false;
    this.cancelEmote();
    this.healing = true; this.healElapsed = 0; this.healCommitted = false;
    this.attackBufferTimer = 0; this.attackHoldArmed = false; this.attackHoldElapsed = 0; this.attackBufferFromHold = false;
    this.velocity.x = 0; this.velocity.z = 0;
    this.visualTransient = null; this.visualTransientTimer = 0;
    this.state = STATES.HEALING; this.visualState = "IDLE_COMBAT"; this.visualMoving = false;
    return true;
  }

  canStartHeal() {
    return this.alive && !this.inFinale && this.state !== STATES.CLIMB && this.grounded && !this.healing
      && !this.attackActive && this.dodgeTimer <= 0 && this.healCharges > 0 && this.health < this.healthMax;
  }

  updateHealing(dt) {
    if (!this.healing) return;
    if (!this.alive || this.inFinale || !this.grounded || this.state === STATES.CLIMB) { this.cancelHeal(); return; }
    this.healElapsed += dt;
    if (!this.healCommitted && this.healElapsed >= PLAYER_COMBAT.healCommit) {
      this.healCommitted = true; this.healCharges--;
      this.health = Math.min(this.healthMax, this.health + PLAYER_COMBAT.healAmount);
      this.healPulseTimer = .45;
    }
    if (this.healElapsed >= PLAYER_COMBAT.healDuration) this.cancelHeal();
  }

  enterCombat(duration = 2.5) {
    this.cancelEmote();
    this.auraWalk = false; this.combatTimer = Math.max(this.combatTimer, duration);
    this.syncWeaponState();
    if (this.state !== STATES.CLIMB && !this.healing && !this.attackActive && this.dodgeTimer <= 0 && this.grounded) {
      this.state = STATES.COMBAT; this.visualState = this.resolveVisualState();
    }
  }

  toggleAuraWalk() {
    if (this.inCombat || this.state === STATES.CLIMB || this.healing || this.inFinale) return false;
    this.auraWalk = !this.auraWalk;
    this.onAuraWalkToggle?.(this.auraWalk);
    return true;
  }

  canStartEmote(emote, input) {
    const animationController = this.visual.animationController;
    return Boolean(emote?.type === "EMOTE" && this.alive && !this.inFinale && !this.inCombat
      && !this.healing && this.state !== STATES.CLIMB && this.grounded && this.dodgeTimer <= 0
      && !this.attackActive && !this.moveInputActive && !input.down("KeyW") && !input.down("KeyA")
      && !input.down("KeyS") && !input.down("KeyD") && animationController?.hasClip(emote.clip));
  }

  startEmote(emote, input) {
    if (!this.canStartEmote(emote, input)) return false;
    this.activeEmote = emote;
    this.state = STATES.EMOTING;
    this.syncWeaponState();
    this.visualState = STATES.EMOTING;
    this.visualMoving = false;
    this.moveInputActive = false;
    this.planarSpeed = 0;
    this.velocity.x = 0; this.velocity.z = 0;
    this.moveWish.set(0, 0, 0);
    return true;
  }

  cancelEmote() {
    if (!this.activeEmote && this.state !== STATES.EMOTING) return false;
    this.activeEmote = null;
    if (!this.alive) this.state = STATES.AIRBORNE;
    else if (this.healing) this.state = STATES.HEALING;
    else if (this.state === STATES.CLIMB) this.state = STATES.CLIMB;
    else if (this.dodgeTimer > 0) this.state = STATES.DODGE;
    else if (this.attackActive) this.state = STATES.ATTACK;
    else if (!this.grounded) this.state = STATES.AIRBORNE;
    else this.state = this.inCombat ? STATES.COMBAT : this.auraWalk ? STATES.AURA_WALK : STATES.RUN;
    if (this.state !== STATES.CLIMB) this.visualState = this.resolveVisualState();
    this.visualMoving = false;
    return true;
  }

  emoteInterrupted(input, auraToggleRequested) {
    const movement = input.down("KeyW") || input.down("KeyA") || input.down("KeyS") || input.down("KeyD");
    const gameplayAction = input.wasPressed?.("Space") || input.wasPressed?.("KeyQ")
      || input.attackPressed || auraToggleRequested
      || (input.wasPressed?.("KeyR") && this.canStartHeal())
      || (input.wasPressed?.("KeyE") && this.grounded && this.nearbyClimbable);
    return movement || gameplayAction || !this.alive || this.inCombat || this.state === STATES.CLIMB || this.inFinale;
  }

  update(dt, input, camera, lockTarget = null) {
    if (!this.alive || this.hitStopTimer > 0) return;
    this.healPulseTimer = Math.max(0, this.healPulseTimer - dt);
    this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - dt);
    this.damageFlashTimer = Math.max(0, this.damageFlashTimer - dt);
    this.combatTimer = Math.max(0, this.combatTimer - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);
    this.locomotionGraceTimer = Math.max(0, this.locomotionGraceTimer - dt);
    this.attackBufferTimer = Math.max(0, this.attackBufferTimer - dt);
    if (!this.attackActive) {
      this.comboResetTimer = Math.max(0, this.comboResetTimer - dt);
      if (this.comboResetTimer === 0) this.comboStep = 0;
    }

    if (this.state === STATES.CLIMB) {
      consumePlayerActionSlot(input);
      input.consumeAttack();
      input.consume("KeyR");
      input.consume("Period"); input.consume("NumpadDecimal");
      input.consume("KeyQ");
      this.updateClimbing(dt, input);
      return;
    }
    if (input.consume("KeyR")) this.startHeal();
    if (this.healing) {
      consumePlayerActionSlot(input);
      input.consumeAttack(); input.consume("KeyQ"); input.consume("Space"); input.consume("KeyE");
      this.updateHealing(dt);
      this.velocity.x = 0; this.velocity.z = 0; this.moveWish.set(0, 0, 0);
      this.planarSpeed = 0; this.moveInputActive = false; this.visualMoving = false;
      this.visualState = "IDLE_COMBAT";
      if (this.healing) this.state = STATES.HEALING;
      return;
    }

    const actionSlot = consumePlayerActionSlot(input);
    const periodToggleRequested = input.consume("Period");
    const numpadToggleRequested = input.consume("NumpadDecimal");
    const auraToggleRequested = actionSlot?.type === "AURA" || periodToggleRequested || numpadToggleRequested;

    let emoteWasInterrupted = false;
    if (this.isEmoting) {
      if (this.emoteInterrupted(input, auraToggleRequested)) {
        this.cancelEmote();
        emoteWasInterrupted = true;
      } else if (actionSlot?.type === "EMOTE") {
        if (actionSlot.key === this.activeEmote?.key) {
          this.cancelEmote();
          emoteWasInterrupted = true;
        }
        else this.startEmote(actionSlot, input);
      }
      if (this.isEmoting && this.activeEmote.behavior === "ONE_SHOT"
        && this.visual.animationController?.isCurrentEmoteFinished()) this.cancelEmote();
      if (this.isEmoting) {
        this.velocity.x = 0; this.velocity.z = 0;
        this.moveWish.set(0, 0, 0);
        this.planarSpeed = 0; this.moveInputActive = false; this.visualMoving = false;
        this.visualState = STATES.EMOTING;
        return;
      }
    }

    if (actionSlot?.type === "AURA" || auraToggleRequested) this.toggleAuraWalk();
    if (actionSlot?.type === "EMOTE" && !emoteWasInterrupted && !this.isEmoting) {
      if (this.startEmote(actionSlot, input)) return;
    }
    this.wasGrounded = this.grounded;
    if (this.grounded) this.climbStamina = Math.min(this.climbStaminaMax, this.climbStamina + 32 * dt);
    this.nearbyClimbable = this.interactionsEnabled
      ? this.climbables?.findFacing(this.group.position, this.group.rotation.y, this.climbableSurfaces) ?? null
      : null;
    if (input.consumeAttack()) {
      this.enterCombat(); this.attackBufferTimer = .62;
      this.attackHoldArmed = input.attackHeld; this.attackHoldElapsed = 0; this.attackBufferFromHold = false;
    }
    const ix = Number(input.down("KeyD")) - Number(input.down("KeyA"));
    const iz = Number(input.down("KeyW")) - Number(input.down("KeyS"));
    this.moveInputActive = ix !== 0 || iz !== 0;
    let wish = this.wish.set(0, 0, 0);
    if (lockTarget) {
      this.lockDirection.set(lockTarget.group.position.x - this.group.position.x, 0, lockTarget.group.position.z - this.group.position.z);
      if (this.lockDirection.lengthSq() > .001) this.lockDirection.normalize();
      this.lockRight.set(-this.lockDirection.z, 0, this.lockDirection.x);
      wish.addScaledVector(this.lockDirection, iz).addScaledVector(this.lockRight, ix);
    } else {
      wish.addScaledVector(camera.right, ix).addScaledVector(camera.forward, iz);
    }
    if (wish.lengthSq() > 1) wish.normalize();
    this.moveWish.copy(wish);
    if (input.consume("Space") && this.grounded) {
      this.velocity.y = 5.3; this.grounded = false; this.jumpInProgress = true; this.auraWalk = false; this.attackActive = false;
    }
    if (input.consume("KeyQ") && this.dodgeCooldown <= 0) {
      this.auraWalk = false; this.attackActive = false; this.attackBufferTimer = 0; this.attackBufferFromHold = false;
      this.dodgeTimer = PLAYER_COMBAT.dodgeDuration; this.dodgeCooldown = PLAYER_COMBAT.dodgeCooldown;
      if (wish.lengthSq() > 0) this.dodgeDirection.copy(wish);
      else if (lockTarget) this.dodgeDirection.copy(this.lockDirection).negate();
      else this.dodgeDirection.copy(camera.forward);
      // Start presentation from the accepted gameplay event before the same
      // frame's movement step; updateVisual will keep this state without restart.
      this.visual.animationController?.setState("DODGE");
    }

    this.updateAttack(dt, input.attackHeld);
    const speed = this.dodgeTimer > 0 ? PLAYER_COMBAT.dodgeSpeed : this.attackActive ? 1.8 : this.inCombat ? 3.2 : this.auraWalk ? this.walkSpeed : this.runSpeed;
    const desired = this.dodgeTimer > 0
      ? this.desiredVelocity.copy(this.dodgeDirection).multiplyScalar(speed)
      : this.desiredVelocity.copy(wish).multiplyScalar(speed);
    const rate = desired.lengthSq() > 0 ? 24 : 16;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, desired.x, rate, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, desired.z, rate, dt);
    if (!this.grounded) this.velocity.y -= 15 * dt;
    this.moveAndCollide(dt);
    if (this.grounded && this.velocity.y < 0) this.velocity.y = 0;

    if (lockTarget && this.dodgeTimer <= 0) {
      const targetYaw = Math.atan2(-this.lockDirection.x, -this.lockDirection.z);
      const yawDelta = THREE.MathUtils.euclideanModulo(targetYaw - this.group.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      this.group.rotation.y += yawDelta * (1 - Math.exp(-18 * dt));
    } else if (!this.attackActive && this.dodgeTimer <= 0 && this.moveWish.lengthSq() > .02) {
      const targetYaw = Math.atan2(-this.moveWish.x, -this.moveWish.z);
      const yawDelta = THREE.MathUtils.euclideanModulo(targetYaw - this.group.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      this.group.rotation.y += yawDelta * (1 - Math.exp(-14 * dt));
    }
    this.planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.moveInputActive && this.planarSpeed > .22) this.locomotionGraceTimer = .12;
    this.groundGraceTimer = this.grounded ? .22 : Math.max(0, this.groundGraceTimer - dt);
    const stairContactFlicker = !this.jumpInProgress && !this.grounded && this.groundGraceTimer > 0
      && this.velocity.y <= 0 && this.velocity.y > -3.2;
    this.animationGrounded = this.grounded || stairContactFlicker;
    const moving = this.planarSpeed > .4 || this.locomotionGraceTimer > 0;
    this.state = this.dodgeTimer > 0 ? STATES.DODGE : !this.grounded ? STATES.AIRBORNE : this.attackActive ? STATES.ATTACK : this.inCombat ? STATES.COMBAT : this.auraWalk ? STATES.AURA_WALK : STATES.RUN;
    this.visualMoving = moving && this.animationGrounded;
    this.visualState = this.resolveVisualState();
    if (!this.wasGrounded && this.grounded) {
      if (this.jumpInProgress && !this.visualMoving) { this.visualTransient = "LAND"; this.visualTransientTimer = .24; }
      this.jumpInProgress = false;
    }
  }

  beginClimb(surface) {
    if (this.healing) return;
    this.cancelEmote();
    this.attackHoldArmed = false; this.attackHoldElapsed = 0; this.attackBufferFromHold = false; this.attackBufferTimer = 0;
    this.climbTarget = surface;
    const dx = this.group.position.x - surface.origin.x;
    const dz = this.group.position.z - surface.origin.z;
    this.climbOffset = THREE.MathUtils.clamp(dx * surface.horizontal.x + dz * surface.horizontal.z, -surface.halfWidth + .3, surface.halfWidth - .3);
    this.climbHeight = THREE.MathUtils.clamp(this.group.position.y, surface.origin.y, surface.topY);
    this.velocity.set(0, 0, 0); this.grounded = false;
    this.groundContact.valid = false; this.groundContact.distance = 0;
    this.combatTimer = 0; this.attackBufferTimer = 0;
    this.state = STATES.CLIMB;
    this.syncWeaponState();
    this.visualTransient = null; this.visualTransientTimer = 0;
    this.climbVisualState = "CLIMB_IDLE";
    this.climbInputDirection = "NONE";
    this.climbInputX = 0; this.climbInputY = 0;
    this.visualState = this.climbVisualState;
    this.visualMoving = false;
    this.updateClimbPosition();
  }

  updateClimbPosition() {
    const surface = this.climbTarget;
    if (!surface) return;
    const p = this.group.position;
    p.x = surface.origin.x + surface.horizontal.x * this.climbOffset + surface.normal.x * surface.attachDistance;
    p.z = surface.origin.z + surface.horizontal.z * this.climbOffset + surface.normal.z * surface.attachDistance;
    p.y = this.climbHeight;
    const yaw = Math.atan2(surface.normal.x, surface.normal.z);
    this.group.rotation.set(0, yaw, 0);
  }

  updateClimbing(dt, input) {
    const surface = this.climbTarget;
    if (!surface) { this.climbInputDirection = "NONE"; this.climbInputX = 0; this.climbInputY = 0; this.state = STATES.AIRBORNE; return; }
    if (input.consume("KeyE")) { this.detachFromClimb(.8); return; }
    if (input.consume("Space")) { this.climbJump(); return; }

    const horizontalInput = Number(input.down("KeyD")) - Number(input.down("KeyA"));
    const verticalInput = Number(input.down("KeyW")) - Number(input.down("KeyS"));
    this.climbInputX = horizontalInput;
    this.climbInputY = verticalInput;
    const isMoving = horizontalInput !== 0 || verticalInput !== 0;
    this.climbStamina = Math.max(0, this.climbStamina - dt * (isMoving ? this.climbDrain : 1.2));
    if (this.climbStamina <= 0) { this.detachFromClimb(0, -1.1); return; }

    this.climbOffset = THREE.MathUtils.clamp(this.climbOffset + horizontalInput * this.climbMoveSpeed * dt, -surface.halfWidth + .3, surface.halfWidth - .3);
    this.climbHeight = THREE.MathUtils.clamp(this.climbHeight + verticalInput * this.climbMoveSpeed * dt, surface.origin.y, surface.topY);
    if (verticalInput > 0 && this.climbHeight >= surface.topY - .03 && surface.landing) {
      this.mantleOntoSurface(surface);
      return;
    }
    this.updateClimbPosition();
    this.state = STATES.CLIMB;
    this.visualMoving = isMoving;
    this.climbInputDirection = this.resolveClimbInputDirection(horizontalInput, verticalInput, input.lastPressedDirection);
    this.climbVisualState = this.climbInputDirection === "NONE" ? "CLIMB_IDLE" : `CLIMB_${this.climbInputDirection}`;
    this.visualState = this.climbVisualState;
  }

  resolveClimbInputDirection(horizontalInput, verticalInput, lastPressedDirection = null) {
    const horizontalMagnitude = Math.abs(horizontalInput);
    const verticalMagnitude = Math.abs(verticalInput);
    if (horizontalMagnitude === 0 && verticalMagnitude === 0) return "NONE";
    const margin = PLAYER_ANIMATION_CONFIG.climb.directionHysteresis;
    if (verticalMagnitude > horizontalMagnitude + margin) return verticalInput > 0 ? "UP" : "DOWN";
    if (horizontalMagnitude > verticalMagnitude + margin) return horizontalInput > 0 ? "RIGHT" : "LEFT";

    // Keyboard diagonals have equal axis strength. Use the latest direction key
    // when it breaks the tie, otherwise retain the current axis or prefer vertical.
    const verticalDirection = verticalInput > 0 ? "UP" : "DOWN";
    const horizontalDirection = horizontalInput > 0 ? "RIGHT" : "LEFT";
    const recentlyPressedDirection = ({ KeyW: "UP", KeyS: "DOWN", KeyA: "LEFT", KeyD: "RIGHT" })[lastPressedDirection];
    if ((recentlyPressedDirection === verticalDirection && verticalMagnitude > 0)
      || (recentlyPressedDirection === horizontalDirection && horizontalMagnitude > 0)) return recentlyPressedDirection;
    if (this.climbInputDirection === verticalDirection || this.climbInputDirection === horizontalDirection) {
      return this.climbInputDirection;
    }
    return verticalMagnitude > 0 ? verticalDirection : horizontalDirection;
  }

  mantleOntoSurface(surface) {
    const landing = surface.landing;
    const p = this.group.position;
    p.x = THREE.MathUtils.clamp(surface.origin.x + surface.horizontal.x * this.climbOffset + surface.normal.x * landing.normalOffset, landing.minX, landing.maxX);
    p.z = THREE.MathUtils.clamp(surface.origin.z + surface.horizontal.z * this.climbOffset + surface.normal.z * landing.normalOffset, landing.minZ, landing.maxZ);
    p.y = landing.y;
    this.velocity.set(0, 0, 0); this.grounded = true; this.climbTarget = null;
    this.state = this.inCombat ? STATES.COMBAT : STATES.RUN;
    this.syncWeaponState();
    this.visualState = this.inCombat ? "IDLE_COMBAT" : "IDLE_ALL_FOURS";
  }

  detachFromClimb(pushOut = .65, downwardVelocity = -.65) {
    const surface = this.climbTarget;
    if (surface) {
      this.velocity.x = surface.normal.x * pushOut;
      this.velocity.z = surface.normal.z * pushOut;
    }
    this.velocity.y = downwardVelocity; this.grounded = false; this.climbTarget = null;
    this.climbInputDirection = "NONE";
    this.groundContact.valid = false; this.groundContact.distance = 0;
    this.state = STATES.AIRBORNE;
    this.syncWeaponState();
    this.visualState = "FALL";
  }

  climbJump() {
    if (!this.climbTarget || this.climbStamina < this.climbJumpCost) return;
    const surface = this.climbTarget;
    this.climbStamina -= this.climbJumpCost;
    this.velocity.set(surface.normal.x * 5.1, 4.2, surface.normal.z * 5.1);
    this.grounded = false; this.climbTarget = null; this.state = STATES.AIRBORNE;
    this.syncWeaponState();
    this.climbInputDirection = "NONE";
    this.groundContact.valid = false; this.groundContact.distance = 0;
    this.visualState = "CLIMB_JUMP"; this.visualTransient = "CLIMB_JUMP"; this.visualTransientTimer = .42;
  }

  updateAttack(dt, attackHeld = false) {
    if (!attackHeld) {
      this.attackHoldArmed = false;
      this.attackHoldElapsed = 0;
      if (this.attackBufferFromHold) { this.attackBufferTimer = 0; this.attackBufferFromHold = false; }
    }
    if (attackHeld && this.attackHoldArmed) this.attackHoldElapsed += dt;
    if (attackHeld && this.attackHoldArmed && this.attackHoldElapsed >= HELD_ATTACK_QUALIFY_TIME
      && (this.attackActive || this.dodgeTimer > 0 || !this.grounded)) {
      this.attackBufferTimer = .62;
      this.attackBufferFromHold = true;
    }
    if (this.attackActive) {
      this.attackElapsed += dt;
      if (!this.attackImpactDone && this.attackElapsed >= ATTACK_IMPACT[this.attackStep]) {
        this.attackImpactDone = true; this.attackImpactSerial++;
        this.attackDamage = this.attackStep === 2 ? 2 : 1;
        this.attackKnockback = this.attackStep === 2 ? 2.2 : 1.2;
      }
      if (this.attackElapsed >= ATTACK_DURATION[this.attackStep]) {
        this.attackActive = false; this.comboResetTimer = .95;
      }
    }
    if (!this.attackActive && this.attackBufferTimer > 0 && this.grounded && this.dodgeTimer <= 0) this.beginAttack();
  }

  beginAttack() {
    if (this.healing) return;
    if (this.comboResetTimer <= 0) this.comboStep = 0;
    this.attackStep = this.comboStep; this.comboStep = (this.comboStep + 1) % 3;
    this.attackActive = true; this.attackElapsed = 0; this.attackImpactDone = false;
    this.attackBufferTimer = 0; this.comboResetTimer = 0; this.combatTimer = Math.max(this.combatTimer, 2.5);
    this.syncWeaponState();
    this.onAttackStart?.(this.attackStep + 1);
  }

  resolveVisualState() {
    if (!this.alive) return "DEATH";
    if (this.healing) return "IDLE_COMBAT";
    if (this.state === STATES.EMOTING) return STATES.EMOTING;
    if (this.state === STATES.CLIMB) return this.climbVisualState;
    if (this.dodgeTimer > 0) return "DODGE";
    if (!this.animationGrounded) return this.velocity.y > .35 ? "JUMP" : "FALL";
    if (this.attackActive) return `ATTACK_${this.attackStep + 1}`;
    if (this.inCombat) return this.visualMoving ? "COMBAT_WALK" : "IDLE_COMBAT";
    if (this.auraWalk) return this.visualMoving ? "AURA_WALK" : "IDLE_ALL_FOURS";
    return this.visualMoving ? "RUN_ALL_FOURS" : "IDLE_ALL_FOURS";
  }

  updateVisual(dt) {
    this.syncGroundShadowHeight();
    this.visualClock += dt;
    if (this.visualTransientTimer > 0) {
      this.visualTransientTimer = Math.max(0, this.visualTransientTimer - dt);
      if (this.visualTransientTimer === 0) this.visualTransient = null;
    }
    const state = this.visualTestState || (!this.alive ? "DEATH"
      : this.state === STATES.CLIMB ? this.climbVisualState
        : this.visualTransient || this.visualState);
    this.syncWeaponState();
    const testMoving = state === "RUN_ALL_FOURS" || state === "AURA_WALK" || state === "COMBAT_WALK" || state === "CLIMB_UP";
    this.visualParameters.moving = this.visualTestState ? testMoving : this.visualMoving;
    this.visualParameters.attackStep = this.attackStep;
    this.visualParameters.elapsed = this.visualClock;
    this.visualParameters.emote = this.isEmoting ? this.activeEmote : null;
    const impactHitStop = this.alive && this.impactHitStopTimer > 0;
    if (!impactHitStop) this.visual.setAnimationState(state, this.visualParameters);
    const animationController = this.visual.animationController;
    if (animationController) {
      animationController.climbInputDirection = this.state === STATES.CLIMB ? this.climbInputDirection : "NONE";
      animationController.climbGameplayActive = this.state === STATES.CLIMB;
      animationController.climbInputX = this.state === STATES.CLIMB ? this.climbInputX : 0;
      animationController.climbInputY = this.state === STATES.CLIMB ? this.climbInputY : 0;
      animationController.climbSurfaceName = this.state === STATES.CLIMB
        ? this.climbTarget?.object?.name || this.climbTarget?.object?.userData?.climbableName || "registered surface"
        : "none";
      animationController.swordHiddenForClimb = this.state === STATES.CLIMB && !this.visual.weaponVisual.visible;
    }
    const context = this.visualUpdateContext;
    context.grounded = this.grounded;
    context.alive = this.alive;
    context.moving = this.visualMoving;
    context.state = state;
    context.emote = this.isEmoting ? this.activeEmote : null;
    context.roomId = this.collisionRoomId;
    this.visual.update(impactHitStop ? 0 : dt, context);
    if (impactHitStop) this.impactHitStopTimer = Math.max(0, this.impactHitStopTimer - dt);
  }

  updateFinalePose(moving, elapsed, animationState = "AURA_WALK") {
    this.cancelEmote();
    this.state = animationState === "SIT_THRONE" ? STATES.AURA_WALK : this.state;
    this.auraWalk = true; this.inFinale = true;
    this.visualMoving = moving; this.visualState = animationState;
    this.visualClock = elapsed;
  }

  setFinaleTorsoRoll(value) { this.presentationRoll = value; this.visual.setTorsoRoll(value); }
  setFinaleClimbMotion(elapsed) { this.visual.setClimbMotion(elapsed); }
  setFinaleSeatedPose() { this.cancelEmote(); this.visualState = "SIT_THRONE"; this.visualMoving = false; this.visual.setSeatedPose(); }

  attachCrown(crown) {
    this.crownProp = crown;
    this.visual.attachCrown(crown);
  }

  syncCrownAttachment() { if (this.crownProp) this.visual.attachCrown(this.crownProp); }

  moveAndCollide(dt) {
    const collisionStart = performance.now();
    const previousY = this.group.position.y;
    this.group.position.y += this.velocity.y * dt;
    this.grounded = false;
    this.group.position.x += this.velocity.x * dt;
    this.resolveAxis("x");
    this.group.position.z += this.velocity.z * dt;
    this.resolveAxis("z");
    const p = this.group.position;
    const stairTop = Math.abs(p.x) < 7.15 && p.z < 6.6 && p.z > 1.4 ? Math.ceil((6.6 - p.z) / 1.15) * .28 : 0;
    const platformTop = Math.abs(p.x) < 7.15 && p.z < 1.7 && p.z > -5.3 ? 1.13 : 0;
    let floorY = Math.max(0, stairTop, platformTop);
    let floorSurface = stairTop > 0 ? "greatHall-stairs" : platformTop > 0 ? "greatHall-dais" : FLOOR_SURFACE_IDS[this.collisionRoomId] || FLOOR_SURFACE_IDS.greatHall;
    let sampledGroundY = floorY <= p.y + .15 ? floorY : Math.min(0, p.y);
    let sampledGroundSurface = floorY <= p.y + .15 ? floorSurface : FLOOR_SURFACE_IDS[this.collisionRoomId] || FLOOR_SURFACE_IDS.greatHall;
    const collisionCandidates = this.getCollisionCandidates(p);
    for (const c of collisionCandidates) {
      this.collisionChecks++;
      if (c.supportTop && c.maxY <= p.y + .15 && c.maxY > sampledGroundY
        && p.x + this.radius > c.minX && p.x - this.radius < c.maxX && p.z + this.radius > c.minZ && p.z - this.radius < c.maxZ) {
        sampledGroundY = c.maxY;
        sampledGroundSurface = c;
      }
      if (c.supportTop && this.velocity.y <= 0 && previousY >= c.maxY && p.y <= c.maxY + .15 && p.x + this.radius > c.minX && p.x - this.radius < c.maxX && p.z + this.radius > c.minZ && p.z - this.radius < c.maxZ) {
        if (c.maxY > floorY) { floorY = c.maxY; floorSurface = c; }
      }
    }
    if (p.y <= floorY + 1e-5 && this.velocity.y <= 0) {
      p.y = floorY; this.velocity.y = 0; this.grounded = true;
      sampledGroundY = floorY;
      sampledGroundSurface = floorSurface;
      this.groundContact.normal.set(0, 1, 0);
    }
    this.groundContact.point.set(p.x, sampledGroundY, p.z);
    this.groundContact.surface = sampledGroundSurface;
    this.groundContact.distance = Math.max(0, p.y - sampledGroundY);
    this.groundContact.valid = this.grounded;
    this.updateGroundShadow(floorY, floorSurface, collisionCandidates);
    this.lastCollisionMs += performance.now() - collisionStart;
  }

  updateGroundShadow(floorY, floorSurface, collisionCandidates = this.colliders) {
    const p = this.group.position;
    // Keep the highest walkable level below the player while airborne too.
    // groundContact intentionally remains a near-contact gameplay reading;
    // the shadow needs the actual floor beneath a jumping/climbing player.
    let supportY = 0;
    let supportSurface = FLOOR_SURFACE_IDS[this.collisionRoomId] || FLOOR_SURFACE_IDS.greatHall;
    if (floorY <= p.y + SUPPORT_HEIGHT_TOLERANCE) {
      supportY = floorY;
      supportSurface = floorSurface;
    }
    for (const c of collisionCandidates) {
      if (!c.supportTop || c.maxY > p.y + SUPPORT_HEIGHT_TOLERANCE || c.maxY <= supportY
        || p.x + this.radius <= c.minX || p.x - this.radius >= c.maxX
        || p.z + this.radius <= c.minZ || p.z - this.radius >= c.maxZ) continue;
      supportY = c.maxY;
      supportSurface = c;
    }
    // Decorative rug/carpet tops are already registered as foot-contact
    // supports. Let them raise the blob when they are the visible surface.
    const contactSurfaces = this.visual.footContactSurfaces?.get(this.collisionRoomId);
    if (contactSurfaces) for (const contact of contactSurfaces) {
      if (contact.topY > p.y + SUPPORT_HEIGHT_TOLERANCE || contact.topY <= supportY
        || p.x < contact.minX || p.x > contact.maxX || p.z < contact.minZ || p.z > contact.maxZ) continue;
      supportY = contact.topY;
      supportSurface = contact;
    }
    this.shadowGroundY = supportY;
    this.shadowGroundSurface = supportSurface;
    this.syncGroundShadowHeight();
  }

  syncGroundShadowHeight() {
    // The blob remains a child for inexpensive X/Z tracking, but cancel the
    // gameplay root's vertical motion so its world Y stays on the cached floor.
    this.shadow.position.y = this.shadowGroundY - this.group.position.y + GROUND_SHADOW_OFFSET;
  }

  resolveAxis(axis) {
    const p = this.group.position;
    for (const c of this.getCollisionCandidates(p)) {
      this.collisionChecks++;
      if (c.supportTop) continue;
      if (c.minY > .7 && c.maxY < 1.5 && p.y >= c.maxY - .2) continue;
      if (p.y + this.height < c.minY || p.y > c.maxY) continue;
      if (axis === "x" && p.z + this.radius > c.minZ && p.z - this.radius < c.maxZ && p.x + this.radius > c.minX && p.x - this.radius < c.maxX) {
        p.x = this.velocity.x > 0 ? c.minX - this.radius : c.maxX + this.radius; this.velocity.x = 0;
      } else if (axis === "z" && p.x + this.radius > c.minX && p.x - this.radius < c.maxX && p.z + this.radius > c.minZ && p.z - this.radius < c.maxZ) {
        p.z = this.velocity.z > 0 ? c.minZ - this.radius : c.maxZ + this.radius; this.velocity.z = 0;
      }
    }
  }

  getCollisionCandidates(position) {
    return this.collisionQuery
      ? this.collisionQuery(this.collisionRoomId, position, this.collisionCandidates)
      : this.colliders;
  }

  takeDamage(attackerPosition, damage = PLAYER_COMBAT.normalDamage) {
    if (!this.alive || this.isInvulnerable) return false;
    this.cancelEmote();
    this.cancelHeal();
    this.attackActive = false; this.attackBufferTimer = 0; this.attackHoldArmed = false; this.attackHoldElapsed = 0; this.attackBufferFromHold = false;
    this.impactHitStopTimer = 0;
    this.health = Math.max(0, this.health - damage); this.invulnerabilityTimer = PLAYER_COMBAT.damageIframes; this.damageFlashTimer = .2;
    this.knockbackDirection.set(this.group.position.x - attackerPosition.x, 0, this.group.position.z - attackerPosition.z);
    if (this.knockbackDirection.lengthSq() < .001) this.knockbackDirection.set(0, 0, 1);
    else this.knockbackDirection.normalize();
    this.velocity.addScaledVector(this.knockbackDirection, 3.3);
    if (this.health === 0) {
      this.alive = false; this.state = STATES.DEAD;
      this.climbTarget = null; this.nearbyClimbable = null;
      this.climbInputDirection = "NONE"; this.climbInputX = 0; this.climbInputY = 0;
      this.velocity.set(0, 0, 0); this.dodgeTimer = 0; this.combatTimer = 0;
      this.visualState = "DEATH"; this.visualMoving = false;
      this.visualTransient = "DEATH"; this.visualTransientTimer = 0;
    }
    else { this.visualTransient = "DAMAGE"; this.visualTransientTimer = .38; }
    return true;
  }

  reset() {
    this.activeEmote = null;
    this.group.position.copy(this.spawn); this.group.rotation.set(0, 0, 0); this.velocity.set(0, 0, 0); this.moveWish.set(0, 0, 0);
    this.shadowGroundY = this.group.position.y; this.syncGroundShadowHeight();
    this.animationGrounded = true; this.groundGraceTimer = .22; this.locomotionGraceTimer = 0; this.jumpInProgress = false; this.planarSpeed = 0; this.moveInputActive = false;
    this.health = this.healthMax; this.refillTonic(); this.cancelHeal(); this.healPulseTimer = 0; this.alive = true; this.grounded = true; this.auraWalk = false; this.state = STATES.RUN;
    this.invulnerabilityTimer = 0; this.damageFlashTimer = 0; this.hitStopTimer = 0; this.impactHitStopTimer = 0;
    this.combatTimer = 0; this.attackActive = false; this.attackElapsed = 0; this.comboStep = 0; this.comboResetTimer = 0; this.attackBufferTimer = 0;
    this.externalCombatActive = false;
    this.attackHoldArmed = false; this.attackHoldElapsed = 0; this.attackBufferFromHold = false;
    this.dodgeTimer = 0; this.dodgeCooldown = 0; this.climbTarget = null; this.nearbyClimbable = null; this.climbOffset = 0;
    this.climbInputDirection = "NONE"; this.climbInputX = 0; this.climbInputY = 0; this.climbVisualState = "CLIMB_IDLE";
    this.climbStamina = this.climbStaminaMax; this.visualState = "IDLE_ALL_FOURS"; this.visualMoving = false; this.visualTransient = null; this.visualTransientTimer = 0; this.presentationRoll = 0;
    this.visual.resetAnimations();
    this.inFinale = false;
    this.syncWeaponState();
    this.syncCrownAttachment();
  }

  teleport(position, yaw = 0) {
    this.cancelEmote();
    this.cancelHeal();
    this.group.position.copy(position);
    this.shadowGroundY = position.y; this.syncGroundShadowHeight();
    this.group.rotation.set(0, yaw, 0);
    this.velocity.set(0, 0, 0);
    this.moveWish.set(0, 0, 0);
    this.grounded = true;
    this.animationGrounded = true; this.groundGraceTimer = .22; this.locomotionGraceTimer = 0; this.jumpInProgress = false; this.planarSpeed = 0; this.moveInputActive = false;
    this.climbTarget = null;
    this.nearbyClimbable = null;
    this.auraWalk = false;
    this.combatTimer = 0;
    this.externalCombatActive = false;
    this.attackActive = false;
    this.attackElapsed = 0;
    this.attackBufferTimer = 0;
    this.attackHoldArmed = false;
    this.attackHoldElapsed = 0;
    this.attackBufferFromHold = false;
    this.dodgeTimer = 0;
    this.hitStopTimer = 0;
    this.impactHitStopTimer = 0;
    this.state = STATES.RUN;
    this.visualState = "IDLE_ALL_FOURS"; this.visualMoving = false; this.visualTransient = null; this.visualTransientTimer = 0; this.presentationRoll = 0;
    this.inFinale = false;
    this.syncWeaponState();
    this.syncCrownAttachment();
  }
}

export { STATES };
