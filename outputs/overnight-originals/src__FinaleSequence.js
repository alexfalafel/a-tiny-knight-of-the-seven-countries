import * as THREE from "three";
import { createDragonQueen, createDragonSilhouette } from "./FinaleCharacters.js";
import { DragonBoss } from "./DragonBoss.js";

const PHASE = Object.freeze({
  IDLE: "IDLE", APPROACH: "APPROACH", CHOICE: "CHOICE", GOOD_PRESENT: "GOOD_PRESENT",
  GOOD_TEXT: "GOOD_TEXT", GOOD_RESULTS: "GOOD_RESULTS", CLAIM: "CLAIM", DRAGON_REVEAL: "DRAGON_REVEAL",
  SECRET_TEXT: "SECRET_TEXT", SECRET_DEATH: "SECRET_DEATH", SECRET_DEATH_PAUSE: "SECRET_DEATH_PAUSE",
  SECRET_WALK: "SECRET_WALK", SECRET_HOP: "SECRET_HOP", SECRET_CLIMB: "SECRET_CLIMB",
  SECRET_SEATED: "SECRET_SEATED", SECRET_PULLBACK: "SECRET_PULLBACK", SECRET_ENDING_TEXT: "SECRET_ENDING_TEXT", SECRET_RESULTS: "SECRET_RESULTS",
});

export class FinaleSequence {
  constructor({ scene, player, camera, progression, endings, throneCrown, keyLight, input, ui, onChoiceAvailable, onStart, onDragonReady }) {
    Object.assign(this, { scene, player, camera, progression, endings, throneCrown, keyLight, input, ui, onChoiceAvailable, onStart, onDragonReady });
    this.queen = createDragonQueen(scene);
    this.dragon = createDragonSilhouette(scene);
    this.dragonBoss = new DragonBoss(scene, { group: this.dragon, camera, keyLight });
    this.phase = PHASE.IDLE;
    this.timer = 0;
    this.choiceReady = false;
    this.crownParentedToQueen = false;
    this.cameraPosition = new THREE.Vector3();
    this.cameraLook = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.playerStart = new THREE.Vector3();
    this.approachTarget = new THREE.Vector3(30, 0, -33.65);
    this.textIndex = 0;
    this.crownParentedToPlayer = false;
    this.shakeElapsed = 0;
    this.baseLight = keyLight.intensity;
    this.walkTarget = new THREE.Vector3(30, 0, -33.65);
    this.seatPosition = new THREE.Vector3(30, 1.78, -36.9);
    this.climbStart = new THREE.Vector3();
    this.pullbackTarget = new THREE.Vector3(34, 4, -34);
  }

  get active() { return this.phase !== PHASE.IDLE; }
  get choiceMade() { return this.endings.throneChoiceMade; }

  start() {
    if (!this.endings.beginFinale(this.progression.crownComplete)) return false;
    this.phase = PHASE.APPROACH; this.timer = 0;
    this.onStart?.();
    this.input.clearActions();
    this.throneCrown.removeFromParent();
    this.player.attachCrown(this.throneCrown);
    this.player.auraWalk = true;
    this.player.combatTimer = 0; this.player.attackActive = false; this.player.attackBufferTimer = 0;
    this.player.velocity.set(0, 0, 0); this.player.grounded = true;
    return true;
  }

  update(dt) {
    if (!this.active) return;
    this.timer += dt;
    if (this.phase === PHASE.APPROACH) this.updateApproach(dt);
    else if (this.phase === PHASE.CHOICE) this.updateChoice(dt);
    else if (this.phase === PHASE.GOOD_PRESENT) this.updateGoodPresentation();
    else if (this.phase === PHASE.GOOD_TEXT) this.updateGoodText();
    else if (this.phase === PHASE.CLAIM) this.updateClaim();
    else if (this.phase === PHASE.DRAGON_REVEAL) this.updateDragonReveal();
    else if (this.phase === PHASE.SECRET_TEXT) this.updateSecretText();
    else if (this.phase === PHASE.SECRET_DEATH) this.updateDragonDeath(dt);
    else if (this.phase === PHASE.SECRET_DEATH_PAUSE) this.updateDeathPause();
    else if (this.phase === PHASE.SECRET_WALK) this.updateSecretWalk(dt);
    else if (this.phase === PHASE.SECRET_HOP) this.updateSecretHop();
    else if (this.phase === PHASE.SECRET_CLIMB) this.updateSecretClimb();
    else if (this.phase === PHASE.SECRET_SEATED) this.updateSecretSeated();
    else if (this.phase === PHASE.SECRET_PULLBACK) this.updateSecretPullback();
    else if (this.phase === PHASE.SECRET_ENDING_TEXT) this.updateSecretEndingText();
    this.updateCinematicCamera(dt);
  }

  updateApproach(dt) {
    this.direction.subVectors(this.approachTarget, this.player.group.position);
    const distance = this.direction.length();
    if (distance > .035) {
      this.direction.multiplyScalar(1 / distance);
      this.player.group.position.addScaledVector(this.direction, Math.min(distance, .85 * dt));
    }
    this.player.group.rotation.y = THREE.MathUtils.damp(this.player.group.rotation.y, 0, 5, dt);
    this.player.updateFinalePose(distance > .035, this.timer);
    const look = THREE.MathUtils.clamp(1 - distance / 4, 0, 1);
    this.queen.head.rotation.y = Math.sin(look * Math.PI * .5) * -.11;
    if (distance <= .035) this.enterChoice();
  }

  enterChoice() {
    this.phase = PHASE.CHOICE; this.timer = 0; this.choiceReady = false;
    this.player.updateFinalePose(false, this.timer);
    this.input.clearActions();
    this.onChoiceAvailable?.();
  }

  updateChoice(dt) {
    if (!this.choiceReady && this.timer >= .4 && !this.input.down("KeyE") && !this.input.down("Digit1") && !this.input.down("Digit2") && !this.input.down("Space")) {
      this.choiceReady = true;
      this.ui.choice.classList.add("visible");
    }
    if (this.choiceReady && this.input.consume("Digit1")) this.chooseGive();
    else if (this.choiceReady && this.input.consume("Digit2")) this.chooseClaim();
  }

  chooseGive() {
    if (this.phase !== PHASE.CHOICE || !this.choiceReady || !this.endings.chooseGive()) return false;
    this.ui.choice.classList.remove("visible"); this.input.clearActions();
    this.phase = PHASE.GOOD_PRESENT; this.timer = 0; this.crownParentedToQueen = false;
    return true;
  }

  chooseClaim() {
    if (this.phase !== PHASE.CHOICE || !this.choiceReady || !this.endings.chooseClaim()) return false;
    this.ui.choice.classList.remove("visible"); this.input.clearActions();
    this.phase = PHASE.CLAIM; this.timer = 0;
    return true;
  }

  updateGoodPresentation() {
    const t = Math.min(1, this.timer / 2.8);
    this.player.group.position.y = -.12 * Math.sin(Math.PI * t);
    this.player.setFinaleTorsoRoll(.1 * Math.sin(Math.PI * t));
    this.queen.head.rotation.x = -.07 * Math.sin(Math.PI * t);
    this.queen.leftArm.rotation.z = -.1 * t;
    this.queen.rightArm.rotation.z = .1 * t;
    if (!this.crownParentedToQueen && this.timer >= .78) {
      this.throneCrown.removeFromParent();
      this.queen.crownSocket.add(this.throneCrown);
      this.throneCrown.position.set(0, 0, 0);
      this.throneCrown.scale.setScalar(.57);
      this.crownParentedToQueen = true;
    }
    if (this.timer >= 2.8) { this.phase = PHASE.GOOD_TEXT; this.timer = 0; this.textIndex = 0; this.showEndingText("THE CROWN IS RESTORED"); }
  }

  updateGoodText() {
    if (this.timer < 1.55) return;
    this.timer = 0; this.textIndex++;
    const messages = ["THE SEVEN COUNTRIES ENDURE", "GOOD ENDING"];
    if (this.textIndex < messages.length) this.showEndingText(messages[this.textIndex]);
    else { this.ui.endingText.classList.remove("visible"); this.phase = PHASE.GOOD_RESULTS; this.showResults(); }
  }

  updateClaim() {
    const t = this.timer;
    if (t < .75) {
      this.player.group.rotation.y = THREE.MathUtils.damp(this.player.group.rotation.y, .22, 4, .016);
      this.queen.head.rotation.y = -.18;
    } else if (t < 1.55) {
      this.player.group.rotation.y = THREE.MathUtils.damp(this.player.group.rotation.y, 0, 4, .016);
      this.player.setFinaleTorsoRoll(.05);
    } else if (t < 2.05) {
      if (!this.crownParentedToPlayer) {
        this.player.attachCrown(this.throneCrown);
        this.crownParentedToPlayer = true;
      }
      this.queen.position.y = 1.65;
      this.queen.leftArm.rotation.z = -.75; this.queen.rightArm.rotation.z = .75;
    } else if (t >= 2.7) {
      this.phase = PHASE.DRAGON_REVEAL; this.timer = 0; this.shakeElapsed = 0;
      this.keyLight.intensity = this.baseLight * .38;
      this.dragon.visible = true;
    }
    this.player.updateFinalePose(false, t);
  }

  updateDragonReveal() {
    const t = Math.min(1, this.timer / 2.0);
    this.dragon.position.lerpVectors(this.dragon.userData.revealStart, this.dragon.userData.basePosition, t);
    this.shakeElapsed = this.timer;
    if (this.timer >= 2.1) { this.phase = PHASE.SECRET_TEXT; this.timer = 0; this.textIndex = 0; this.showEndingText("THE DRAGON HAS AWAKENED"); }
  }

  updateSecretText() {
    if (this.timer < 1.65) return;
    this.timer = 0; this.textIndex++;
    if (this.textIndex === 1) this.showEndingText("SECRET PATH");
    else {
      this.ui.endingText.classList.remove("visible");
      this.phase = PHASE.IDLE;
      this.endings.markDragonPending();
      this.endings.branchState = "DRAGON_BOSS";
      this.player.teleport(this.playerStart.set(36.5, 0, -29.4), -Math.PI / 2);
      this.player.auraWalk = true;
      this.player.attachCrown(this.throneCrown);
      this.dragonBoss.activate();
      this.onDragonReady?.(this.dragonBoss);
    }
  }

  startDragonDeath() {
    if (this.phase !== PHASE.IDLE || !this.dragonBoss.isDying) return false;
    this.phase = PHASE.SECRET_DEATH; this.timer = 0; this.input.clearActions();
    this.onStart?.(); this.ui.choice.classList.remove("visible");
    this.ui.endingText.classList.remove("visible");
    this.ui.results.classList.remove("visible"); this.ui.secretResults.classList.remove("visible");
    return true;
  }

  updateDragonDeath(dt) {
    this.dragonBoss.updateDeath(dt);
    if (this.dragonBoss.state === "DEFEATED") { this.phase = PHASE.SECRET_DEATH_PAUSE; this.timer = 0; }
  }

  updateDeathPause() {
    if (this.timer < 1.45) return;
    this.phase = PHASE.SECRET_WALK; this.timer = 0;
    this.player.auraWalk = true;
    this.direction.set(this.walkTarget.x - this.player.group.position.x, 0, this.walkTarget.z - this.player.group.position.z);
    this.player.group.rotation.y = Math.atan2(-this.direction.x, -this.direction.z);
    this.player.updateFinalePose(true, 0);
  }

  updateSecretWalk(dt) {
    this.direction.subVectors(this.walkTarget, this.player.group.position);
    const distance = this.direction.length();
    if (distance > .06) {
      this.direction.multiplyScalar(1 / distance);
      this.player.group.position.addScaledVector(this.direction, Math.min(distance, .95 * dt));
      this.player.group.rotation.y = THREE.MathUtils.damp(this.player.group.rotation.y, Math.atan2(-this.direction.x, -this.direction.z), 4, dt);
    } else {
      this.player.group.position.copy(this.walkTarget);
      this.phase = PHASE.SECRET_HOP; this.timer = 0;
      this.climbStart.copy(this.walkTarget);
    }
    this.player.updateFinalePose(distance > .06, this.timer);
  }

  updateSecretHop() {
    const t = Math.min(1, this.timer / .8), eased = t * t * (3 - 2 * t);
    this.player.group.position.set(30, THREE.MathUtils.lerp(0, .78, eased), THREE.MathUtils.lerp(-33.65, -34.8, eased));
    this.player.updateFinalePose(true, this.timer * 7, "CLIMB_JUMP");
    if (t >= 1) { this.phase = PHASE.SECRET_CLIMB; this.timer = 0; this.climbStart.set(30, .78, -34.8); }
  }

  updateSecretClimb() {
    const t = Math.min(1, this.timer / 2.3), eased = t * t * (3 - 2 * t);
    this.player.group.position.lerpVectors(this.climbStart, this.seatPosition, eased);
    this.player.updateFinalePose(true, this.timer * 5, "CLIMB_UP");
    this.player.setFinaleClimbMotion(this.timer);
    if (t >= 1) {
      this.phase = PHASE.SECRET_SEATED; this.timer = 0;
      this.player.group.position.copy(this.seatPosition); this.player.group.rotation.y = 0;
      this.player.setFinaleSeatedPose();
    }
  }

  updateSecretSeated() {
    this.player.updateFinalePose(false, this.timer, "SIT_THRONE");
    this.player.group.position.copy(this.seatPosition); this.player.group.rotation.y = 0;
    this.player.setFinaleSeatedPose();
    if (this.timer >= 1.2) { this.phase = PHASE.SECRET_PULLBACK; this.timer = 0; }
  }

  updateSecretPullback() {
    if (this.ui.endingDim) this.ui.endingDim.style.opacity = String(Math.min(.34, this.timer / 4.8 * .34));
    if (this.timer >= 4.8) {
      this.phase = PHASE.SECRET_ENDING_TEXT; this.timer = 0; this.textIndex = 0;
      this.showEndingText("ALL HAIL THE TINY KING");
    }
  }

  updateSecretEndingText() {
    if (this.timer < 1.8) return;
    this.timer = 0; this.textIndex++;
    if (this.textIndex === 1) this.showEndingText("SECRET ENDING");
    else {
      this.ui.endingText.classList.remove("visible");
      this.showSecretResults();
      this.phase = PHASE.SECRET_RESULTS;
    }
  }

  showSecretResults() {
    this.ui.secretResultCrown.textContent = `Crown Fragments: ${this.progression.crownFragmentsCollected} / ${this.progression.totalCrownFragments}`;
    this.ui.secretResultBeetle.textContent = `Armored Beetle: ${this.progression.armoryBossDefeated ? "Defeated" : "Not defeated"}`;
    this.ui.secretResultRat.textContent = `Armored Rat Knight: ${this.progression.royalChambersBossDefeated ? "Defeated" : "Not defeated"}`;
    this.ui.secretResultDragon.textContent = "The Ashen Dragon: Defeated";
    this.ui.secretResults.classList.add("visible");
  }

  prepareDragonDebug() {
    this.phase = PHASE.IDLE; this.timer = 0; this.choiceReady = false;
    this.ui.choice.classList.remove("visible"); this.ui.endingText.classList.remove("visible");
    this.ui.results.classList.remove("visible"); this.ui.secretResults.classList.remove("visible");
    if (this.ui.endingDim) this.ui.endingDim.style.opacity = "0";
    this.keyLight.intensity = this.baseLight;
    this.player.attachCrown(this.throneCrown);
    this.dragonBoss.activate();
  }

  updateCinematicCamera(dt) {
    const player = this.player.group.position;
    if (this.phase === PHASE.APPROACH) {
      this.cameraPosition.set(player.x, player.y + 2.2, player.z + 4.6);
      this.cameraLook.set(30, 2.2, -36.0);
    } else if (this.phase === PHASE.GOOD_PRESENT) {
      const pullback = Math.min(1, this.timer / 2.8);
      this.cameraPosition.set(THREE.MathUtils.lerp(35.2, 37.5, pullback), THREE.MathUtils.lerp(5.1, 6.0, pullback), THREE.MathUtils.lerp(-30.2, -28.5, pullback));
      this.cameraLook.set(30, 3.0, -35.8);
    } else if (this.phase === PHASE.CHOICE || this.phase === PHASE.GOOD_TEXT || this.phase === PHASE.GOOD_RESULTS) {
      this.cameraPosition.set(37.5, 6.0, -28.5);
      this.cameraLook.set(30, 3.0, -35.8);
    } else if (this.phase === PHASE.CLAIM) {
      this.cameraPosition.set(34.4, 4.4, -30.6);
      this.cameraLook.set(30, 2.6, -35.7);
    } else if (this.phase === PHASE.SECRET_WALK) {
      const progress = Math.min(1, this.timer / 8);
      this.cameraPosition.set(this.player.group.position.x + .3, 2.6 + progress * 3.4, this.player.group.position.z + 5.4 + progress * 5.2);
      this.cameraLook.lerpVectors(this.player.group.position, this.pullbackTarget, progress);
    } else if (this.phase === PHASE.SECRET_HOP || this.phase === PHASE.SECRET_CLIMB) {
      this.cameraPosition.set(34.2, 5.6, -32.0); this.cameraLook.set(30, 3.4, -36.9);
    } else if (this.phase === PHASE.SECRET_SEATED || this.phase === PHASE.SECRET_PULLBACK || this.phase === PHASE.SECRET_ENDING_TEXT || this.phase === PHASE.SECRET_RESULTS) {
      const pull = this.phase === PHASE.SECRET_PULLBACK ? Math.min(1, this.timer / 4.8) : this.phase === PHASE.SECRET_ENDING_TEXT || this.phase === PHASE.SECRET_RESULTS ? 1 : 0;
      this.cameraPosition.set(30, 8.5 + pull * 4.0, -21.5 + pull * 4.0); this.cameraLook.set(34.2, 3.3, -34.2);
    } else {
      this.cameraPosition.set(37.2, 5.4, -28.9);
      this.cameraLook.set(44.7, 4.2, -31);
      if (this.phase === PHASE.DRAGON_REVEAL) {
        const shake = Math.max(0, Math.sin(this.shakeElapsed * 31)) * Math.min(.13, this.shakeElapsed * .055);
        this.cameraPosition.x += shake; this.cameraPosition.y += Math.sin(this.shakeElapsed * 37) * shake;
      }
    }
    this.camera.updateCinematic(dt, this.cameraPosition, this.cameraLook);
  }

  showEndingText(text) {
    this.ui.endingText.querySelector("h2").textContent = text;
    this.ui.endingText.classList.add("visible");
  }

  showResults() {
    this.ui.resultCrown.textContent = `Crown Fragments: ${this.progression.crownFragmentsCollected} / ${this.progression.totalCrownFragments}`;
    this.ui.resultBeetle.textContent = `Armored Beetle: ${this.progression.armoryBossDefeated ? "Defeated" : "Not defeated"}`;
    this.ui.resultRat.textContent = `Armored Rat Knight: ${this.progression.royalChambersBossDefeated ? "Defeated" : "Not defeated"}`;
    this.ui.results.classList.add("visible");
  }
}
