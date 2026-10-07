import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' });
try {
  const { CombatImpactFeedback } = await server.ssrLoadModule('/src/CombatImpactFeedback.js');
  const { CombatEncounter } = await server.ssrLoadModule('/src/CombatEncounter.js');
  const { EnemyController } = await server.ssrLoadModule('/src/EnemyController.js');
  const { ArmoredBeetleBoss } = await server.ssrLoadModule('/src/ArmoredBeetleBoss.js');
  const { COMBAT_IMPACT } = await server.ssrLoadModule('/src/CombatConfig.js');

  let emitted = 0;
  globalThis.window = { dispatchEvent() { emitted++; } };
  globalThis.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init.detail; } };
  const scene = new THREE.Scene();
  const player = { group: new THREE.Group(), attackImpactSerial: 1, attackDamage: 7, attackKnockback: 1.8, attackStep: 0, impactHitStopTimer: 0 };
  const target = { name: 'dummy', group: new THREE.Group(), hitRange: 3, impactType: 'FLESH', receiveHit() { return true; } };
  target.group.position.set(0, 0, -1.4);
  const encounter = new CombatEncounter(player, target);
  assert.equal(encounter.resolveAttack([target]), true);
  assert.equal(encounter.lastHit.confirmedDamage, true);
  assert.equal(encounter.lastHit.attackIndex, 1);
  assert.equal(encounter.resolveAttack([target]), false, 'one swing is confirmed only once');
  const shellTarget = {
    group: new THREE.Group(), impactType: 'CHITIN',
    checkSwordVolume() { return { hit: true, localX: 0, localZ: 0 }; },
    receiveSwordHit() { return { hit: true, vulnerable: false, damage: 0 }; },
  };
  shellTarget.group.position.set(0, 0, -1.4);
  player.attackImpactSerial++;
  assert.equal(encounter.resolveAttack([shellTarget]), true, 'contact may be confirmed without damage');
  assert.equal(encounter.lastHit.confirmedDamage, false, 'zero-damage shell contact is not a damaging hit');

  const camera = { impulseCount: 0, triggerImpactImpulse() { this.impulseCount++; } };
  const reactionTarget = {
    name: 'test target', impactType: 'CHITIN', calls: 0,
    requestImpactFlinch() { this.calls++; return true; },
  };
  const feedback = new CombatImpactFeedback(scene, player, camera);
  const pointsGeometry = feedback.geometry;
  const miss = { target: reactionTarget, damage: 0, confirmedDamage: false, attackSerial: 2 };
  assert.equal(feedback.handleConfirmedHit(miss), false);
  assert.equal(feedback.handleConfirmedHit(encounter.lastHit), false, 'zero-damage shell contact has no impact feedback');
  assert.equal(player.impactHitStopTimer, 0);
  assert.equal(camera.impulseCount, 0);
  assert.equal(reactionTarget.calls, 0);

  for (let attackIndex = 1; attackIndex <= 3; attackIndex++) {
    const hit = {
      target: reactionTarget, damage: 7, confirmedDamage: true, attackIndex,
      attackSerial: attackIndex, targetType: 'CHITIN',
      hitPoint: new THREE.Vector3(0, .8, 0), hitDirection: new THREE.Vector3(0, 0, 1),
    };
    player.impactHitStopTimer = 0;
    assert.equal(feedback.handleConfirmedHit(hit), true);
    assert(Math.abs(player.impactHitStopTimer - COMBAT_IMPACT.hitStopSeconds[attackIndex - 1]) < 1e-8);
    assert.equal(feedback.handleConfirmedHit(hit), false, 'duplicate attack serial is ignored');
  }
  assert.equal(camera.impulseCount, 3);
  assert.equal(reactionTarget.calls, 3);
  assert.equal(emitted, 3, 'each confirmed damaging hit emits one silent semantic SFX hook');
  assert.equal(feedback.particleCapacity, 48);
  assert.equal(feedback.geometry, pointsGeometry, 'pooled geometry is reused');
  feedback.update(1);
  assert.equal(feedback.activeParticleCount, 0);
  assert.equal(feedback.points.visible, false);
  for (let hitIndex = 0; hitIndex < 300; hitIndex++) {
    feedback.handleConfirmedHit({
      target: reactionTarget, damage: 7, confirmedDamage: true, attackIndex: hitIndex % 3 + 1,
      attackSerial: hitIndex + 10, targetType: 'CHITIN',
      hitPoint: new THREE.Vector3(0, .8, 0), hitDirection: new THREE.Vector3(0, 0, 1),
    });
    for (let frame = 0; frame < 6; frame++) feedback.update(1 / 60);
    assert(feedback.activeParticleCount <= feedback.particleCapacity, 'particle pool remains bounded during 30 seconds of simulated hits');
  }
  assert.equal(feedback.geometry, pointsGeometry, 'stress loop retains the same pooled geometry');

  const enemy = new EnemyController(scene, new THREE.Vector3(4, 0, 4));
  const enemyRootBefore = enemy.group.position.clone();
  enemy.requestImpactFlinch({ duration: .16, holdDuration: .05, strength: .035, direction: new THREE.Vector3(1, 0, 0) });
  assert(enemy.visualRoot.position.length() > 0);
  enemy.updateImpactFlinch(.05); enemy.updateImpactFlinch(.3);
  assert(enemy.visualRoot.position.length() < 1e-8, 'visual flinch returns to rest');
  assert(enemy.group.position.distanceTo(enemyRootBefore) < 1e-8, 'impact flinch does not move enemy gameplay root');

  const boss = new ArmoredBeetleBoss(scene, { spawn: new THREE.Vector3(), arenaBounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 } });
  boss.setState('RECOVERY', .5);
  const bossRootBefore = boss.group.position.clone();
  assert.equal(boss.requestImpactFlinch({ duration: .16, holdDuration: .05, strength: .035, direction: new THREE.Vector3(0, 0, 1) }), true);
  assert(boss.impactVisualRoot.position.length() > 0);
  assert.equal(boss.requestImpactFlinch({ duration: .16, holdDuration: .05, strength: .035, direction: new THREE.Vector3(1, 0, 0) }), true);
  boss.setState('STAGGER', .5);
  assert.equal(boss.requestImpactFlinch({ duration: .16, holdDuration: .05, strength: .035, direction: new THREE.Vector3(1, 0, 0) }), false, 'true stagger has priority');
  boss.updateImpactFlinch(.05); boss.updateImpactFlinch(.3);
  assert(boss.group.position.distanceTo(bossRootBefore) < 1e-8, 'boss visual flinch does not move gameplay root');
  assert(boss.impactVisualRoot.position.length() < .0001, 'boss visual flinch returns to rest');

  delete globalThis.window;
  delete globalThis.CustomEvent;
  console.log('PASS: authoritative hit confirmation, no feedback on misses/zero damage, exact attack hit-stop values, once-per-swing SFX hook and impulse, 30 seconds of bounded pooled particles, enemy visual-only recoil, and boss stagger priority.');
} finally {
  await server.close();
}
