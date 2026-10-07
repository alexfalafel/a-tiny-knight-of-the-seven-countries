import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createServer } from 'vite';

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class { constructor(type, options = {}) { Object.assign(this, { type }, options); } };
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'silent' });
try {
  const { createTestLevel } = await server.ssrLoadModule('/src/TestLevel.js');
  const { PlayerVisual } = await server.ssrLoadModule('/src/PlayerVisual.js');
  PlayerVisual.prototype.loadProductionModel = function () {};
  PlayerVisual.prototype.loadOptionalSword = function () {};
  PlayerVisual.prototype.reportLoadedModel = function () {};
  const scene = new THREE.Scene(), level = createTestLevel(scene), root = new THREE.Group();
  scene.add(root);
  const visual = new PlayerVisual(root);
  const bytes = readFileSync('public/assets/models/player/rat-knight.glb');
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', resolve, reject));
  visual.installProductionModel(gltf);
  visual.setFootIKDebugVisible(true);
  const context = { grounded: true, alive: true, moving: false, state: 'IDLE_ALL_FOURS', roomId: 'greatHall', colliders: [] };
  const registry = level.footContactSurfaces;
  const rug = registry.get('greatHall').find(s => s.name === 'Great Hall Rug');
  assert.equal(rug.topY, .0625);
  assert(!level.colliders.some(c => c.maxY === rug.topY), 'Rug must not add a gameplay collider');
  visual.footContactSurfaces = registry;
  const probe = { hitPoint: new THREE.Vector3(), normal: new THREE.Vector3() };
  const query = (x, z, originY = .3, colliders = [], room = 'greatHall') => {
    visual.sampleFootGround(probe, x, z, originY, colliders, room);
    return probe.surface?.name || probe.surface;
  };
  assert.equal(query(0, 9.5), 'Great Hall Rug');
  assert.equal(query(5, 9.5), 'greatHall-floor');
  assert.equal(query(3.75, 9.5), 'Great Hall Rug Border');
  assert.equal(query(0, 9.5, .04), 'greatHall-floor', 'Do not select a surface above the probe');
  assert.equal(query(0, 9.5, 1), null, 'Reject surfaces outside ray range');
  assert.equal(query(0, 9.5, .3, [{ name: 'Higher platform', supportTop: true, minX: -1, maxX: 1, minZ: 9, maxZ: 10, maxY: .2 }]), 'Higher platform');
  assert.equal(query(20, -31, .3, [], 'throneRoom'), 'Throne Room Rug', 'Room offset must be applied once');
  assert.equal(query(0, 9.5, .3, [], 'armory'), 'armory-floor', 'Room supports must stay isolated');

  const readFeet = () => visual.footIK.legs.map(leg => ({ side: leg.side, surface: leg.surface?.name || leg.surface,
    hitY: leg.hitY, soleY: leg.visibleSoleY, gap: leg.visibleSoleY - leg.hitY, targetY: leg.targetY,
    smoothedY: leg.smoothedY, weight: leg.weight }));
  const settle = (name, x, z, contacts) => {
    root.position.set(x, 0, z); visual.footContactSurfaces = contacts;
    visual.animationController.reset('IDLE_ALL_FOURS');
    context.state = 'IDLE_ALL_FOURS'; context.moving = false;
    visual.setAnimationState(context.state, { moving: false, attackStep: 0, elapsed: 0 });
    for (let frame = 0; frame < 240; frame++) visual.update(1 / 60, context);
    assert.equal(root.position.y, 0); assert.equal(visual.root.position.y, .025);
    console.log(JSON.stringify({ case: name, feet: readFeet(), pelvis: visual.pelvisOffset }));
    return readFeet();
  };
  settle('before: rug omitted', 0, 9.5, null);
  const stoneFeet = settle('bare stone', 5, 9.5, registry);
  const rugFeet = settle('rug center', 0, 9.5, registry);
  rugFeet.forEach((foot, index) => assert(Math.abs(foot.soleY - stoneFeet[index].soleY - rug.topY) < .00001,
    'Surface selection must raise the sole by the rug height without changing calibration'));
  assert(visual.footIK.legs.every(leg => leg.surface === rug));
  settle('split feet at rug edge', 3.65, 9.5, registry);
  assert.notEqual(visual.footIK.left.surface, visual.footIK.right.surface);
  for (const state of ['COMBAT_WALK', 'RUN_ALL_FOURS', 'AURA_WALK']) {
    context.state = state; context.moving = true;
    visual.setAnimationState(state, { moving: true, attackStep: 0, elapsed: 0 });
    const selected = new Set();
    let maxSmoothedStep = 0;
    const previous = [null, null];
    for (let frame = 0; frame < 360; frame++) {
      // Cross the untrimmed end of the rug in both directions. Animate the
      // actual GLB while translating the test root; no gameplay edits needed.
      root.position.set(0, 0, 11.3 + 2.4 * Math.sin(frame / 359 * Math.PI));
      visual.update(1 / 60, context);
      visual.footIK.legs.forEach((leg, index) => {
        selected.add(leg.surface?.name || leg.surface);
        if (previous[index] !== null) maxSmoothedStep = Math.max(maxSmoothedStep, Math.abs(leg.smoothedY - previous[index]));
        previous[index] = leg.smoothedY;
        assert(Number.isFinite(leg.visibleSoleY));
      });
      assert.equal(root.position.y, 0); assert.equal(visual.root.position.y, .025);
    }
    assert(selected.has('Great Hall Rug') && selected.has('greatHall-floor'));
    assert(maxSmoothedStep < .025, 'Existing target damping must smooth rug transitions');
    console.log(JSON.stringify({ case: state + ' onto/off rug', selected: [...selected], maxSmoothedStep }));
  }
  console.log('PASS: highest visible support, range, room offsets, independent feet, unchanged root, and animated rug transitions.');
} finally { await server.close(); }
