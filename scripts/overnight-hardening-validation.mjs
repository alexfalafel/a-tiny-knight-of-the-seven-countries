import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { createServer } from 'vite';
import { InputManager } from '../src/InputManager.js';
import { CombatImpactFeedback } from '../src/CombatImpactFeedback.js';
import { COMBAT_IMPACT } from '../src/CombatConfig.js';
import { ThirdPersonCamera } from '../src/ThirdPersonCamera.js';
import { CombatTargetRegistry } from '../src/CombatTargetRegistry.js';
import { ArmoredRatKnightBoss } from '../src/ArmoredRatKnightBoss.js';
import { ProgressionManager } from '../src/ProgressionManager.js';

const results = [];
function check(name, run) { run(); results.push({ name, passed: true }); console.log('PASS', name); }
class Target extends EventTarget {
  constructor() { super(); this.handlers = new Set(); }
  addEventListener(type, fn) { super.addEventListener(type, fn); this.handlers.add(fn); }
  removeEventListener(type, fn) { super.removeEventListener(type, fn); this.handlers.delete(fn); }
}
globalThis.Element = class { constructor(editable = false) { this.editable = editable; } closest() { return this.editable ? this : null; } };
globalThis.window = new Target(); globalThis.document = new Target();
const input = new InputManager({}, () => {});
const key = (code, editable = false) => input.onKeyDown({ code, target: new Element(editable), preventDefault() {} });
check('pointer unlock, hidden tab, editable focus, and listener disposal', () => {
  key('KeyW'); input.attackHeld = true; input.onLockChange();
  assert.equal(input.down('KeyW'), false); assert.equal(input.attackHeld, false);
  key('KeyW', true); assert.equal(input.down('KeyW'), false);
  key('KeyA'); document.hidden = true; input.onVisibilityChange(); assert.equal(input.keys.size, 0);
  input.dispose(); assert.equal(window.handlers.size + document.handlers.size, 0);
});
delete globalThis.window; delete globalThis.document; delete globalThis.Element;

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' });
try {
  const { PlayerVisual } = await server.ssrLoadModule('/src/PlayerVisual.js');
  PlayerVisual.prototype.loadProductionModel = function () {};
  PlayerVisual.prototype.loadOptionalSword = function () {};
  const { PlayerController } = await server.ssrLoadModule('/src/PlayerController.js');
  const scene = new THREE.Scene();
  const player = new PlayerController(scene, new THREE.Vector3(), [], null);
  check('death overrides climbing and impact freeze; retry clears directional state', () => {
    player.state = 'CLIMB'; player.climbTarget = {}; player.climbInputDirection = 'LEFT'; player.climbInputX = -1;
    player.impactHitStopTimer = .065;
    assert(player.takeDamage(new THREE.Vector3(0, 0, 1), 100));
    assert.equal(player.state, 'DEAD'); assert.equal(player.climbTarget, null); assert.equal(player.impactHitStopTimer, 0);
    player.updateVisual(1 / 60); assert.equal(player.visual.state, 'DEATH');
    player.reset(); assert.equal(player.climbInputDirection, 'NONE'); assert.equal(player.climbInputX, 0);
    assert.equal(player.health, 100); assert.equal(player.healCharges, 3); assert.equal(player.resolveWeaponState(), 'SHEATHED');
  });
  check('held attack chaining survives presentation freezes and stops on release', () => {
    const controls = { attackHeld: true, attackPressed: true, consumeAttack() { const value = this.attackPressed; this.attackPressed = false; return value; }, consume() { return false; }, down() { return false; } };
    const orbit = { forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) };
    const steps = []; let serial = player.attackImpactSerial;
    for (let frame = 0; frame < 1800; frame++) {
      player.update(1 / 60, controls, orbit);
      if (player.attackImpactSerial !== serial) { serial = player.attackImpactSerial; steps.push(player.attackStep); player.impactHitStopTimer = COMBAT_IMPACT.hitStopSeconds[player.attackStep]; }
      player.updateVisual(1 / 60);
    }
    assert(steps.length > 30); steps.forEach((step, index) => assert.equal(step, index % 3));
    controls.attackHeld = false;
    for (let frame = 0; frame < 180; frame++) player.update(1 / 60, controls, orbit);
    assert.equal(player.attackActive, false); assert.equal(player.attackBufferTimer, 0);
  });
  const camera = new ThirdPersonCamera(new THREE.PerspectiveCamera());
  const feedback = new CombatImpactFeedback(scene, player, camera);
  check('only living particles draw immediately; ten-minute simulated pool stays bounded', () => {
    const geometry = feedback.geometry;
    const profile = COMBAT_IMPACT.particles.profiles.CHITIN;
    const point = new THREE.Vector3(1, 1, 1), direction = new THREE.Vector3(0, 0, -1);
    feedback.burst(point, direction, profile, 5);
    assert.equal(geometry.drawRange.count, 5); assert(feedback.colors[0] > 0);
    for (let frame = 0; frame < 36000; frame++) {
      if (frame % 12 === 0) feedback.burst(point, direction, profile, 6);
      feedback.update(1 / 60);
      assert.equal(geometry.drawRange.count, feedback.activeParticleCount);
      assert(geometry.drawRange.count <= 48);
    }
    feedback.update(1); assert.equal(geometry.drawRange.count, 0);
    assert.equal(feedback.geometry, geometry); feedback.reset(); assert.equal(feedback.points.visible, false);
  });
  check('camera impulses settle without drift; reset clears impulses', () => {
    const control = new ThirdPersonCamera(new THREE.PerspectiveCamera());
    const pos = new THREE.Vector3(2, 0, 3), mouse = { x: 0, y: 0 };
    for (let frame = 0; frame < 600; frame++) {
      if (frame < 300 && frame % 15 === 0) camera.triggerImpactImpulse(new THREE.Vector3(0, 0, -1), .024, .12, .028);
      camera.update(1 / 60, mouse, pos); control.update(1 / 60, mouse, pos);
    }
    assert(camera.camera.position.distanceTo(control.camera.position) < 1e-9);
    camera.triggerImpactImpulse(new THREE.Vector3(0, 0, -1)); camera.resetForPlayer(); assert.equal(camera.impactImpulseTimer, 0);
  });
  check('lock break grace advances once per frame and clears dead/changed-room targets', () => {
    const source = readFileSync('src/main.js', 'utf8');
    assert.equal((source.match(/targetRegistry\.update\(player, roomManager\.currentRoomId, dt\)/g) || []).length, 1);
    const registry = new CombatTargetRegistry(); const target = { group: new THREE.Group(), health: 3, isHostile: true };
    scene.add(target.group); target.group.position.set(0, 0, -2); player.reset(); registry.register(target, 'greatHall');
    assert(registry.toggle(player, 'greatHall')); target.group.position.z = -22;
    for (let frame = 0; frame < 20; frame++) { registry.update(player, 'greatHall', 0); registry.update(player, 'greatHall', 0); registry.update(player, 'greatHall', 1 / 60); }
    assert(registry.target); registry.update(player, 'greatHall', .02); assert.equal(registry.target, null);
    target.group.position.z = -2;
    for (let cycle = 0; cycle < 50; cycle++) { assert(registry.toggle(player, 'greatHall')); registry.toggle(player, 'greatHall'); assert.equal(registry.target, null); }
    registry.toggle(player, 'greatHall'); target.health = 0; registry.update(player, 'greatHall', 0); assert.equal(registry.target, null);
  });
  check('boss true stagger, committed attack, and death clear residual cosmetic recoil', () => {
    const boss = new ArmoredRatKnightBoss(scene, { spawn: new THREE.Vector3(), arenaBounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 } });
    const recoil = { duration: .19, holdDuration: .05, strength: .045, direction: new THREE.Vector3(1, 0, 0) };
    for (const state of ['STAGGER', 'TELEGRAPH', 'ATTACK_1', 'DEAD']) {
      boss.setState('RECOVERY'); assert(boss.requestImpactFlinch(recoil)); assert(boss.impactVisualRoot.position.length() > 0);
      boss.setState(state); assert.equal(boss.impactVisualRoot.position.length(), 0); assert.equal(boss.impactFlinchTimer, 0);
    }
  });
  check('fragment, guardian, and tunnel events remain idempotent across retry-style reuse', () => {
    const progress = new ProgressionManager(); let complete = 0; progress.on('crownComplete', () => complete++);
    for (let cycle = 0; cycle < 50; cycle++) for (let id = 1; id <= 5; id++) progress.collectFragment(id);
    assert.equal(complete, 1); assert.equal(progress.crownFragmentsCollected, 5);
    assert(progress.defeatBoss('armoryBeetle')); assert(!progress.defeatBoss('armoryBeetle'));
    assert(progress.discoverTunnel('greatHall')); assert(!progress.discoverTunnel('greatHall'));
  });
  writeFileSync('outputs/overnight-hardening-validation.json', JSON.stringify({ results, simulatedParticleSoakSeconds: 600, simulatedHeldAttackSeconds: 30 }, null, 2));
} finally { await server.close(); }
