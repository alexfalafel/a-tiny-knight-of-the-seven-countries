export const SFX_ASSETS = Object.freeze({
  SWORD_SWINGS: Object.freeze([
    "/assets/audio/sfx/sword-swing-1.mp3",
    "/assets/audio/sfx/sword-swing-2.mp3",
  ]),
  SWORD_HITS: Object.freeze([
    "/assets/audio/sfx/sword-hit-1.mp3",
    "/assets/audio/sfx/sword-hit-2.mp3",
    "/assets/audio/sfx/sword-hit-3.mp3",
  ]),
  CROWN_FRAGMENT: "/assets/audio/sfx/crown-fragment.mp3",
  GAME_COMPLETE: "/assets/audio/sfx/game-complete.mp3",
});

export const SFX_VOLUMES = Object.freeze({
  SWORD_SWINGS: .5,
  SWORD_HITS: .325,
  CROWN_FRAGMENT: .65,
  GAME_COMPLETE: .75,
});

const ASSET_ENTRIES = Object.entries(SFX_ASSETS).flatMap(([cue, source]) =>
  (Array.isArray(source) ? source : [source]).map((url, index) => ({ cue, index, url })),
);

export class SfxManager {
  constructor({ maxVoices = 16 } = {}) {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    this.context = AudioContextClass ? new AudioContextClass() : null;
    this.maxVoices = maxVoices;
    this.activeVoices = new Set();
    this.lastVariant = new Map();
    this.pendingCues = [];
    this.buffers = new Map();
    this.decodePromises = new Map();
    this.warned = new Set();
    this.disposed = false;
    this.preloaded = Promise.all(ASSET_ENTRIES.map(async (asset) => {
      try {
        const response = await fetch(asset.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        asset.bytes = await response.arrayBuffer();
      } catch (error) {
        this.warnOnce(asset.url, `Audio asset unavailable (${asset.url}): ${error.message}`);
      }
      return asset;
    }));
    this.onGesture = () => { void this.unlock(); };
    document.addEventListener("pointerdown", this.onGesture, { capture: true, passive: true });
    document.addEventListener("keydown", this.onGesture, { capture: true });
  }

  warnOnce(key, message) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(message);
  }

  async unlock() {
    if (!this.context || this.disposed) return false;
    try {
      if (this.context.state !== "running") await this.context.resume();
      await this.preloaded;
      await Promise.all(ASSET_ENTRIES.map((asset) => this.loadBuffer(asset)));
      const queued = this.pendingCues.splice(0);
      for (const cue of queued) this.playReady(cue);
      return this.context.state === "running";
    } catch (error) {
      this.warnOnce("audio-context", `Game audio is unavailable: ${error.message}`);
      return false;
    }
  }

  loadBuffer(asset) {
    if (!asset.bytes || this.buffers.has(asset.url)) return Promise.resolve(this.buffers.get(asset.url) || null);
    if (!this.decodePromises.has(asset.url)) {
      const bytes = asset.bytes.slice(0);
      this.decodePromises.set(asset.url, this.context.decodeAudioData(bytes)
        .then((buffer) => { this.buffers.set(asset.url, buffer); return buffer; })
        .catch((error) => { this.warnOnce(asset.url, `Could not decode audio (${asset.url}): ${error.message}`); return null; }));
    }
    return this.decodePromises.get(asset.url);
  }

  chooseAsset(cue) {
    const candidates = ASSET_ENTRIES.filter((asset) => asset.cue === cue);
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    let index = Math.floor(Math.random() * candidates.length);
    if (index === this.lastVariant.get(cue)) index = (index + 1 + Math.floor(Math.random() * (candidates.length - 1))) % candidates.length;
    this.lastVariant.set(cue, index);
    return candidates[index];
  }

  play(cue) {
    if (!SFX_VOLUMES[cue] || this.disposed) return false;
    const asset = this.chooseAsset(cue);
    if (!asset) return false;
    if (this.context?.state === "running" && this.buffers.has(asset.url)) return this.playReady({ cue, asset });
    if (this.pendingCues.length < 8) this.pendingCues.push({ cue, asset });
    void this.unlock();
    return true;
  }

  playReady(request) {
    if (this.disposed || this.context?.state !== "running" || this.activeVoices.size >= this.maxVoices) return false;
    const { cue, asset } = request;
    const buffer = this.buffers.get(asset.url);
    if (!buffer) return false;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = SFX_VOLUMES[cue];
    source.connect(gain);
    gain.connect(this.context.destination);
    const voice = { source, gain };
    this.activeVoices.add(voice);
    source.onended = () => {
      this.activeVoices.delete(voice);
      source.disconnect(); gain.disconnect();
    };
    source.start();
    return true;
  }

  dispose() {
    this.disposed = true;
    document.removeEventListener("pointerdown", this.onGesture, true);
    document.removeEventListener("keydown", this.onGesture, true);
    for (const { source, gain } of this.activeVoices) {
      source.onended = null;
      try { source.stop(); } catch {}
      source.disconnect(); gain.disconnect();
    }
    this.activeVoices.clear();
    this.pendingCues.length = 0;
    void this.context?.close();
  }
}
