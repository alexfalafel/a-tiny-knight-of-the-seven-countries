import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';
import { PLAYER_COMBAT as P, BEETLE_COMBAT as B, RAT_COMBAT as R } from '../src/CombatConfig.js';
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' });
try {
  const { PlayerVisual } = await server.ssrLoadModule('/src/PlayerVisual.js');
  PlayerVisual.prototype.loadProductionModel = function() {};
  PlayerVisual.prototype.loadOptionalSword = function() {};
  const { PlayerController } = await server.ssrLoadModule('/src/PlayerController.js');
  const { ArmoredBeetleBoss } = await server.ssrLoadModule('/src/ArmoredBeetleBoss.js');
  const { ArmoredRatKnightBoss } = await server.ssrLoadModule('/src/ArmoredRatKnightBoss.js');
  const scene = new THREE.Scene(), player = new PlayerController(scene, new THREE.Vector3(0,0,9), [], null);
  const input = { keys: new Set(), consume(key) { return this.keys.delete(key); }, down() { return false; }, consumeAttack() { return this.keys.delete('attack'); } };
  const camera = { forward: new THREE.Vector3(0,0,-1), right: new THREE.Vector3(1,0,0) };
  const attacker = new THREE.Vector3(0,0,8);
  assert.equal(player.health,100); assert.equal(player.healCharges,3);
  assert(player.takeDamage(attacker,28)); assert.equal(player.health,72);
  assert(!player.takeDamage(attacker,28)); assert.equal(player.health,72);
  for(let i=0;i<40;i++) player.update(1/60,input,camera);
  assert.equal(player.invulnerabilityTimer,0);
  input.keys.add('KeyR'); player.update(.01,input,camera);
  assert(player.healing); assert.equal(player.state,'HEALING'); assert.equal(player.health,72);
  input.keys = new Set(['attack','KeyQ','Space','KeyE']); player.update(.3,input,camera);
  assert(!player.attackActive); assert.equal(player.dodgeTimer,0); assert.equal(player.healCharges,3);
  assert(player.takeDamage(attacker,16)); assert(!player.healing); assert.equal(player.health,56); assert.equal(player.healCharges,3);
  player.invulnerabilityTimer=0; assert(player.startHeal()); player.updateHealing(.69);
  assert.equal(player.health,56); assert.equal(player.healCharges,3);
  player.updateHealing(.02); assert.equal(player.health,96); assert.equal(player.healCharges,2);
  assert(player.takeDamage(attacker,16)); assert.equal(player.health,80); assert.equal(player.healCharges,2);
  player.invulnerabilityTimer=0; assert(player.startHeal()); player.updateHealing(1);
  assert.equal(player.health,100); assert.equal(player.healCharges,1); assert(!player.healing); assert(!player.startHeal());
  player.health=50; player.healCharges=0; assert(!player.startHeal()); player.refillTonic();
  for (const state of ['CLIMB']) { player.state=state; assert(!player.startHeal()); }
  player.state='RUN'; player.inFinale=true; assert(!player.startHeal()); player.inFinale=false;
  player.alive=false; assert(!player.startHeal()); player.reset();
  assert.equal(player.health,100); assert.equal(player.healCharges,3); assert(!player.healing);
  player.dodgeTimer=P.dodgeDuration; assert(!player.takeDamage(attacker,28));
  player.dodgeTimer=0; assert(player.takeDamage(attacker,100)); assert(!player.alive); player.reset();
  const options={ spawn:new THREE.Vector3(), arenaBounds:{ minX:-30,maxX:30,minZ:-30,maxZ:30 } };
  const beetle=new ArmoredBeetleBoss(scene,options), rat=new ArmoredRatKnightBoss(scene,options);
  const dummy={group:new THREE.Group(),height:1.2}; dummy.group.position.set(0,0,-2);
  for(const [boss,tune,attacks] of [[beetle,B,['SWIPE','SLAM','CHARGE']],[rat,R,['QUICK','HEAVY','COMBO_1','LUNGE']]]) {
    for(const type of attacks) {
      boss.resetToIdle(); dummy.group.position.set(0,0,-2); boss.beginTelegraph(type);
      assert.equal(boss.stateTimer,tune[type].windup);
      boss.stateTimer=.17; const committedYaw=boss.group.rotation.y;
      dummy.group.position.set(2,0,0); boss.update(.1,dummy);
      assert.equal(boss.group.rotation.y,committedYaw,'Late windup must not track');
      boss.update(.08,dummy); assert.equal(boss.combatPhase,'ACTIVE');
      assert.equal(boss.attackDamage,tune[type].damage);
      let events=0; let sawSecond=false; let recovered=false;
      for(let i=0;i<600;i++) {
        dummy.group.position.copy(boss.group.position); dummy.group.position.z-=1;
        boss.update(1/120,dummy); if(boss.playerHit) events++;
        if(boss.attackType==='COMBO_2') sawSecond=true;
        assert.equal(boss.group.rotation.y,committedYaw,'Committed attack/recovery must not track');
        if(boss.combatPhase==='RECOVERY') recovered=true;
        if(boss.attackType==='NONE') break;
      }
      assert(recovered); assert.equal(sawSecond,type==='COMBO_1');
      assert(events<=(type==='COMBO_1'?2:1),'Each swing must resolve at most once');
      assert(boss.attackCooldown>0); boss.update(.2,dummy); assert.equal(boss.combatPhase,'DECISION');
      console.log(type, 'damage', tune[type].damage, 'hit events', events, 'mandatory recovery + decision delay: PASS');
    }
    boss.resetToIdle(); dummy.group.position.set(10,0,0); boss.beginTelegraph(boss===beetle?'SWIPE':'QUICK');
    boss.update(.01,dummy); assert(Math.abs(boss.group.rotation.y)<=tune.turnSpeed*.01+.00001);
    boss.resetToIdle(); dummy.group.position.set(0,5,-1);
    boss.beginTelegraph(boss===beetle?'SWIPE':'HEAVY');
    if(boss===beetle) boss.beginAttack(dummy.group.position,1); else boss.beginActiveAttack(dummy.group.position,1);
    for(let i=0;i<40;i++) { boss.update(.01,dummy); assert(!boss.playerHit,'No vertical phantom hit'); }
    boss.resetToIdle(); assert.equal(boss.health,tune.health); assert.equal(boss.attackCooldown,0);
  }
  console.log('PASS: numeric HP, iframes, timed healing, input restrictions, interruption before/after commit, cap, charges, retry, boss commitment, turn cap, finite combo, one hit/swing, recovery, spacing and vertical hitboxes.');
} finally { await server.close(); }
