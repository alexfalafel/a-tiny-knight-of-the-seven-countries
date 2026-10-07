import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PLAYER_ANIMATION_CLIPS, PlayerAnimationController } from "../src/PlayerAnimationController.js";
import { PlayerController } from "../src/PlayerController.js";
import { PlayerVisual } from "../src/PlayerVisual.js";
import { PLAYER_ACTION_SLOTS } from "../src/PlayerActionSlots.js";

globalThis.self = globalThis;
globalThis.ProgressEvent ??= class ProgressEvent { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } };

PlayerVisual.prototype.loadProductionModel = function() {};
PlayerVisual.prototype.loadOptionalSword = function() {};

  const sourceAnimations = JSON.parse(readFileSync("docs/player-glb-inspection.json", "utf8")).animations;
  const assetBytes = readFileSync("public/assets/models/player/rat-knight.glb");
  const glbBuffer = assetBytes.buffer.slice(assetBytes.byteOffset, assetBytes.byteOffset + assetBytes.byteLength);
  const originalWarn = console.warn;
  console.warn = (...args) => { if (!String(args[0]).includes("Couldn't load texture blob:")) originalWarn(...args); };
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(glbBuffer, "", resolve, reject));
  console.warn = originalWarn;
  const clipsByName = new Map(gltf.animations.map((clip) => [clip.name, clip]));
  assert.equal(gltf.animations.length, sourceAnimations.length, "inspect every animation in the actual production GLB");
  for (const sourceClip of sourceAnimations) {
    assert(clipsByName.has(sourceClip.name), `${sourceClip.name} exists in the actual GLB`);
    assert(Math.abs(clipsByName.get(sourceClip.name).duration - sourceClip.durationSeconds) < .01, `${sourceClip.name} duration matches the inspection`);
  }

  const emotes = Object.entries(PLAYER_ACTION_SLOTS)
    .filter(([, slot]) => slot?.type === "EMOTE")
    .map(([key, slot]) => ({ ...slot, key }));
  assert.equal(PLAYER_ACTION_SLOTS.Digit1.type, "AURA");
  assert.equal(PLAYER_ACTION_SLOTS.Digit1.action, "TOGGLE_AURA");
  assert.deepEqual(emotes.map(({ key, name, clip, behavior, loopMode }) => ({ key, name, clip, behavior, loopMode })), [
    { key: "Digit2", name: "Kneeling Bow", clip: "01a10fb3-8e13-75e8-afb0-d94a6529ed62", behavior: "ONE_SHOT", loopMode: "ONCE" },
    { key: "Digit3", name: "Kneel", clip: "01a10fb4-abe5-7736-9785-3578dbd64869", behavior: "HOLD_POSE", loopMode: "ONCE" },
  ]);
  for (const emote of emotes) assert(clipsByName.has(emote.clip), `${emote.name} maps to an actual GLB clip`);
  for (let digit = 4; digit <= 9; digit++) assert.equal(PLAYER_ACTION_SLOTS[`Digit${digit}`], null, `Digit${digit} stays unused`);
  assert.equal(PLAYER_ACTION_SLOTS.Digit3.footIK, false);
  assert.equal(PLAYER_ACTION_SLOTS.Digit3.hideSword, true);

  const gameplayStates = Object.entries(PLAYER_ANIMATION_CLIPS).filter(([state]) => state !== "KNEEL");
  const gameplayClips = new Set(gameplayStates.map(([, clip]) => clip));
  const actionClipNames = new Set(emotes.map((emote) => emote.clip));
  const unassignedClips = gltf.animations.filter((clip) => !gameplayClips.has(clip.name) && !actionClipNames.has(clip.name));
  assert.deepEqual(unassignedClips.map((clip) => clip.name).sort(), ["Casual_Walk", "restpose"].sort());
  assert.equal(clipsByName.get("Casual_Walk").duration > 4, true);
  assert.equal(clipsByName.get("restpose").duration < .1, true);

  const actualAnimation = new PlayerAnimationController(gltf.scene, gltf.animations);
  const initialRootPosition = gltf.scene.position.clone();
  const rootMotionSummary = [];
  for (const emote of emotes) {
    const clip = clipsByName.get(emote.clip);
    const hips = clip.tracks.find((track) => /(?:^|\.)mixamorigHips\.position$/i.test(track.name));
    assert(hips, `${emote.clip} has Hips translation data`);
    const removed = actualAnimation.rootMotionRemoved.find((entry) => entry.clip === emote.clip);
    assert(removed?.maxMeters > 0, `${emote.name} horizontal Hips drift is stripped`);
    for (const offset of [0, 2]) {
      const values = hips.values.filter((_, index) => index % 3 === offset);
      assert(Math.max(...values) - Math.min(...values) < 1e-6, `${emote.name} cannot translate the visual root horizontally`);
    }
    const raw = sourceAnimations.find((entry) => entry.name === emote.clip);
    actualAnimation.setState("EMOTING", { emote });
    assert.equal(actualAnimation.currentState, "EMOTING");
    assert.equal(actualAnimation.currentClip, emote.clip);
    assert.equal(actualAnimation.currentAction.loop, emote.loopMode === "REPEAT" ? THREE.LoopRepeat : THREE.LoopOnce);
    assert.equal(actualAnimation.currentAction.clampWhenFinished, emote.behavior === "HOLD_POSE");
    actualAnimation.update(clip.duration + .05);
    if (emote.behavior === "ONE_SHOT") assert(actualAnimation.isCurrentEmoteFinished(), `${emote.name} can return to gameplay at clip end`);
    else assert.equal(actualAnimation.currentAction.paused, true, `${emote.name} holds on its final pose`);
    rootMotionSummary.push({ name: emote.name, duration: raw.durationSeconds, neutralizedHorizontalMeters: Number(removed.maxMeters.toFixed(3)), localHipsVerticalRange: Number((Math.max(...hips.values.filter((_, i) => i % 3 === 1)) - Math.min(...hips.values.filter((_, i) => i % 3 === 1))).toFixed(3)) });
  }
  assert(gltf.scene.position.equals(initialRootPosition), "animation playback never moves the gameplay/model root");
  actualAnimation.reset();
  actualAnimation.setState("EMOTING", { emote: emotes[0] });
  actualAnimation.setState("EMOTING", { emote: emotes[1] });
  assert.equal(actualAnimation.currentClip, emotes[1].clip);
  assert.equal(actualAnimation.blendDuration, .16, "emote-to-emote transitions use the existing short crossfade");

  const makeInput = () => ({
    keys: new Set(), pressed: new Set(), attackPressed: false, attackHeld: false,
    down(code) { return this.keys.has(code); },
    wasPressed(code) { return this.pressed.has(code); },
    consume(code) { const value = this.pressed.has(code); this.pressed.delete(code); return value; },
    consumeAttack() { const value = this.attackPressed; this.attackPressed = false; return value; },
    press(code) { this.keys.add(code); this.pressed.add(code); },
    release(code) { this.keys.delete(code); },
    clear() { this.keys.clear(); this.pressed.clear(); this.attackPressed = false; },
  });
  const camera = { forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) };
  const createPlayer = () => {
    const player = new PlayerController(new THREE.Scene(), new THREE.Vector3(), [], null);
    let emoteFinished = false;
    player.visual.animationController = {
      hasClip: (clip) => actionClipNames.has(clip),
      isCurrentEmoteFinished: () => emoteFinished,
      setFinished: (value) => { emoteFinished = value; },
      setState() {}, update() {}, reset() { emoteFinished = false; },
    };
    return player;
  };
  const pressSlot = (player, input, key) => {
    input.release(key); input.press(key); player.update(1 / 60, input, camera);
  };
  const beginEmote = (key = "Digit2") => {
    const player = createPlayer(), input = makeInput();
    pressSlot(player, input, key);
    assert(player.isEmoting, `${key} enters EMOTING`);
    assert.equal(player.activeEmote.key, key);
    return { player, input };
  };
  {
    const input = makeInput(), player = createPlayer();
    pressSlot(player, input, "Digit1"); assert.equal(player.auraWalk, true); assert.notEqual(player.state, "EMOTING");
    pressSlot(player, input, "Period"); assert.equal(player.auraWalk, false); assert.notEqual(player.state, "EMOTING");
    pressSlot(player, input, "NumpadDecimal"); assert.equal(player.auraWalk, true);
  }
  {
    const { player, input } = beginEmote("Digit2");
    pressSlot(player, input, "Digit3"); assert.equal(player.activeEmote.name, "Kneel", "a different emote transitions without an idle stop");
    pressSlot(player, input, "Digit3"); assert.equal(player.isEmoting, false, "pressing the active key toggles the emote off");
  }
  {
    const { player, input } = beginEmote();
    input.press("KeyW"); player.update(1 / 60, input, camera);
    assert.equal(player.isEmoting, false, "movement cancels and proceeds in the same update"); assert(player.planarSpeed > 0);
  }
  {
    const { player, input } = beginEmote(); input.press("Space"); player.update(1 / 60, input, camera);
    assert.equal(player.isEmoting, false); assert.equal(player.grounded, false);
  }
  {
    const { player, input } = beginEmote(); input.press("KeyQ"); player.update(1 / 60, input, camera);
    assert.equal(player.isEmoting, false); assert(player.dodgeTimer > 0);
  }
  {
    const { player, input } = beginEmote(); input.attackPressed = true; player.update(1 / 60, input, camera);
    assert.equal(player.isEmoting, false); assert(player.inCombat);
  }
  {
    const { player } = beginEmote(); player.enterCombat(); assert.equal(player.isEmoting, false, "lock-on/combat entry cancels emote");
  }
  {
    const { player } = beginEmote(); assert(player.takeDamage(new THREE.Vector3(0, 0, 1))); assert.equal(player.isEmoting, false);
  }
  {
    const { player, input } = beginEmote(); player.health = 50; input.press("KeyR"); player.update(1 / 60, input, camera);
    assert.equal(player.isEmoting, false); assert(player.healing);
  }
  {
    const { player } = beginEmote(); player.beginClimb({ origin: new THREE.Vector3(), horizontal: new THREE.Vector3(1, 0, 0), normal: new THREE.Vector3(0, 0, 1), attachDistance: .3 });
    assert.equal(player.isEmoting, false); assert.equal(player.state, "CLIMB");
  }
  {
    const { player } = beginEmote(); player.updateFinalePose(false, 0); assert.equal(player.isEmoting, false, "scripted pose cancels emote");
  }
  {
    const { player, input } = beginEmote(); player.visual.animationController.setFinished(true); player.update(1 / 60, input, camera);
    assert.equal(player.isEmoting, false, "one-shot completion exits EMOTING");
  }
  {
    const { player } = beginEmote("Digit3"); player.takeDamage(new THREE.Vector3(0, 0, 1), 1000); player.reset();
    assert.equal(player.activeEmote, null); assert.notEqual(player.state, "EMOTING");
  }

  console.log(`Production GLB clips (${gltf.animations.length}): ${JSON.stringify(sourceAnimations.map(({ name, durationSeconds }) => ({ name, durationSeconds })))}`);
  console.log(`Emote root-motion and playback: ${JSON.stringify(rootMotionSummary)}`);
console.log("PASS: actual GLB inventory/mapping; Aura keys 1, Period, and numpad decimal; Digit2/3 emotes; one-shot, held-pose, emote crossfade, horizontal root-motion cleanup; same-key toggle; movement, attack, dodge, jump, combat/lock-on, damage, healing, climbing, scripted sequence, completion, and retry cancellation.");
