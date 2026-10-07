import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { SFX_ASSETS, SFX_VOLUMES, SfxManager } from "../src/SfxManager.js";

const assets = [...SFX_ASSETS.SWORD_SWINGS, ...SFX_ASSETS.SWORD_HITS, SFX_ASSETS.CROWN_FRAGMENT, SFX_ASSETS.GAME_COMPLETE];
assert.equal(assets.length, 7);
assert.equal(new Set(assets).size, 7);
for (const url of assets) assert(existsSync(`public${url}`), `sound asset exists: ${url}`);

const listeners = new Map();
globalThis.document = {
  addEventListener(type, listener) { listeners.set(type, listener); },
  removeEventListener(type) { listeners.delete(type); },
};
const requests = [];
const starts = [];
globalThis.fetch = async (url) => {
  requests.push(url);
  const bytes = readFileSync(`public${url}`);
  return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};
class FakeAudioContext {
  constructor() { this.state = "suspended"; this.destination = {}; }
  async resume() { this.state = "running"; }
  async close() { this.state = "closed"; }
  async decodeAudioData(bytes) { return { bytes: bytes.byteLength }; }
  createBufferSource() { return { connect() {}, disconnect() {}, start() { starts.push(this); }, stop() {}, buffer: null, onended: null }; }
  createGain() { return { gain: { value: 0 }, connect() {}, disconnect() {} }; }
}
globalThis.AudioContext = FakeAudioContext;

const manager = new SfxManager({ maxVoices: 2 });
await manager.preloaded;
assert.equal(requests.length, 7, "each sound file is fetched once into cache");
await listeners.get("pointerdown")();
await manager.unlock();
assert.equal(manager.buffers.size, 7, "all seven assets decode once after browser audio unlock");

const swingChoices = [];
for (let i = 0; i < 8; i++) {
  manager.play("SWORD_SWINGS");
  swingChoices.push(manager.lastVariant.get("SWORD_SWINGS"));
  const voice = [...manager.activeVoices].at(-1);
  voice.source.onended();
}
for (let i = 1; i < swingChoices.length; i++) assert.notEqual(swingChoices[i], swingChoices[i - 1], "swing variants do not repeat consecutively");

const hitChoices = [];
for (let i = 0; i < 12; i++) {
  manager.play("SWORD_HITS");
  hitChoices.push(manager.lastVariant.get("SWORD_HITS"));
  const voice = [...manager.activeVoices].at(-1);
  voice.source.onended();
}
for (let i = 1; i < hitChoices.length; i++) assert.notEqual(hitChoices[i], hitChoices[i - 1], "hit variants do not repeat consecutively");

manager.play("CROWN_FRAGMENT");
manager.play("GAME_COMPLETE");
assert.equal(manager.activeVoices.size, 2, "overlapping voices remain bounded by the configured cap");
assert.deepEqual(SFX_VOLUMES, { SWORD_SWINGS: .5, SWORD_HITS: .325, CROWN_FRAGMENT: .65, GAME_COMPLETE: .75 });
assert.equal(manager.play("unknown"), false);

const main = readFileSync("src/main.js", "latin1");
const player = readFileSync("src/PlayerController.js", "utf8");
const finale = readFileSync("src/FinaleSequence.js", "utf8");
assert(main.includes('player.onAttackStart = () => sfxManager.play("SWORD_SWINGS")'));
assert(player.includes('this.onAttackStart?.(this.attackStep + 1)'));
assert(main.includes('if (impactFeedback.handleConfirmedHit(combat.lastHit)) sfxManager.play("SWORD_HITS")'));
assert(main.includes('sfxManager.play("SWORD_HITS");'));
assert(main.includes('sfxManager.play("CROWN_FRAGMENT");'));
assert(main.includes('onVictory: () => sfxManager.play("GAME_COMPLETE")'));
assert(finale.includes('this.playVictorySfx("TINY_KING")') && finale.includes('this.playVictorySfx("GOOD")'));
manager.dispose();
console.log("PASS: seven cached SFX assets; swing/hit variants avoid immediate repeats; volume map; bounded overlap; authoritative event wiring; all requested files exist.");
