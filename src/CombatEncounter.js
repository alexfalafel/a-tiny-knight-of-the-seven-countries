import * as THREE from "three";

export class CombatEncounter {
  constructor(player, enemy) {
    this.player = player; this.enemy = enemy;
    this.lastAttackSerial = 0; this.hitChecks = 0;
    this.toEnemy = new THREE.Vector3(); this.forward = new THREE.Vector3();
    this.attackStart = new THREE.Vector3(); this.attackEnd = new THREE.Vector3();
    this.hitPoint = new THREE.Vector3(); this.hitLocalPoint = new THREE.Vector3();
    this.hitDirection = new THREE.Vector3();
    this.lastHit = null;
    this.lastSwordResult = "NO ATTACK";
  }

  resolveAttack(targets = [this.enemy]) {
    if (this.player.attackImpactSerial === this.lastAttackSerial) { this.lastHit = null; return false; }
    this.lastAttackSerial = this.player.attackImpactSerial;
    this.forward.set(-Math.sin(this.player.group.rotation.y), 0, -Math.cos(this.player.group.rotation.y));
    this.attackStart.copy(this.player.group.position).addScaledVector(this.forward, .35);
    this.attackEnd.copy(this.player.group.position).addScaledVector(this.forward, 2.85);
    this.lastHit = null;
    this.lastSwordResult = "MISS";
    for (const target of targets) {
      if (target.isDead || target.status === "DEAD" || !target.group.visible) continue;
      this.hitChecks++;
      this.toEnemy.set(target.group.position.x - this.player.group.position.x, 0, target.group.position.z - this.player.group.position.z);
      const distanceSq = this.toEnemy.lengthSq();
      if (typeof target.checkSwordVolume === "function") {
        const contact = target.checkSwordVolume(this.attackStart, this.attackEnd, this.player.group.position);
        if (!contact.hit) continue;
        const direction = this.toEnemy.lengthSq() > .001 ? this.toEnemy.normalize() : this.forward;
        const result = target.receiveSwordHit({ damage: this.player.attackDamage, direction, knockback: this.player.attackKnockback, comboStep: this.player.attackStep, playerPosition: this.player.group.position, contact });
        if (!result?.hit) continue;
        this.lastHit = this.createHitEvent(target, result, direction, contact);
        this.lastSwordResult = result.vulnerable ? `VULNERABLE HIT · ${result.damage} DAMAGE` : "SHELL HIT · NO DAMAGE";
        return true;
      }
      const reach = target.hitRange || 2.35;
      if (distanceSq > reach * reach || distanceSq < .01) continue;
      this.toEnemy.normalize();
      if (this.forward.dot(this.toEnemy) < .2) continue;
      if (typeof target.receiveSwordHit === "function") {
        const result = target.receiveSwordHit({ damage: this.player.attackDamage, direction: this.toEnemy, knockback: this.player.attackKnockback, comboStep: this.player.attackStep, playerPosition: this.player.group.position });
        if (!result?.hit) continue;
        this.lastHit = this.createHitEvent(target, result, this.toEnemy);
        this.lastSwordResult = result.vulnerable ? `HIT · ${result.damage} DAMAGE` : "HIT · NO DAMAGE";
        return true;
      }
      const hit = target.receiveHit(this.player.attackDamage, this.toEnemy, this.player.attackKnockback);
      if (hit) {
        this.lastHit = this.createHitEvent(target, { hit: true, vulnerable: true, damage: this.player.attackDamage }, this.toEnemy);
        this.lastSwordResult = `HIT · ${this.player.attackDamage} DAMAGE`;
        return true;
      }
    }
    return false;
  }

  createHitEvent(target, result, direction, contact = null) {
    this.hitDirection.copy(direction);
    if (this.hitDirection.lengthSq() > .0001) this.hitDirection.normalize();
    else this.hitDirection.set(-Math.sin(this.player.group.rotation.y), 0, -Math.cos(this.player.group.rotation.y));

    const impactHeight = target.impactPointHeight ?? (target.lockHeight ? target.lockHeight * .62 : .48);
    if (contact && Number.isFinite(contact.localX) && Number.isFinite(contact.localZ)) {
      this.hitLocalPoint.set(contact.localX, contact.localY ?? impactHeight, contact.localZ);
      const localRoot = target.visuals || target.group;
      this.hitPoint.copy(localRoot.localToWorld(this.hitLocalPoint));
    } else {
      this.hitPoint.copy(target.group.position).addScaledVector(this.hitDirection, -(target.impactPointOffset ?? .32));
      this.hitPoint.y += impactHeight;
    }

    return {
      target,
      ...result,
      confirmedDamage: result.damage > 0,
      attackIndex: this.player.attackStep + 1,
      attackSerial: this.player.attackImpactSerial,
      hitPoint: this.hitPoint.clone(),
      hitDirection: this.hitDirection.clone(),
      targetType: target.impactType || "GENERIC",
      contact,
    };
  }

  reset() { this.lastAttackSerial = this.player.attackImpactSerial; this.hitChecks = 0; }
}
