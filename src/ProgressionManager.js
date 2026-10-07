export class ProgressionManager {
  constructor(totalCrownFragments = 5) {
    this.crownFragmentsCollected = 0;
    this.totalCrownFragments = totalCrownFragments;
    this.completedFragmentIds = new Set();
    this.discoveredTunnels = new Set();
    this.defeatedBosses = new Set();
    this.crownComplete = false;
    this.listeners = new Map();
  }

  on(eventName, listener) {
    let listeners = this.listeners.get(eventName);
    if (!listeners) { listeners = new Set(); this.listeners.set(eventName, listeners); }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  emit(eventName, payload) {
    const listeners = this.listeners.get(eventName);
    if (listeners) for (const listener of listeners) listener(payload);
  }

  collectFragment(fragmentId) {
    if (this.completedFragmentIds.has(fragmentId) || this.crownComplete) return false;
    this.completedFragmentIds.add(fragmentId);
    this.crownFragmentsCollected = Math.min(this.totalCrownFragments, this.completedFragmentIds.size);
    const progress = {
      fragmentId,
      collected: this.crownFragmentsCollected,
      total: this.totalCrownFragments,
    };
    this.emit("fragmentCollected", progress);
    if (this.crownFragmentsCollected === this.totalCrownFragments) {
      this.crownComplete = true;
      this.emit("crownComplete", progress);
    }
    return true;
  }

  discoverTunnel(roomId) {
    if (this.discoveredTunnels.has(roomId)) return false;
    this.discoveredTunnels.add(roomId);
    this.emit("tunnelDiscovered", { roomId });
    return true;
  }

  get armoryBossDefeated() { return this.defeatedBosses.has("armoryBeetle"); }
  get royalChambersBossDefeated() { return this.defeatedBosses.has("royalChambersRatKnight"); }

  defeatBoss(bossId) {
    if (this.defeatedBosses.has(bossId)) return false;
    this.defeatedBosses.add(bossId);
    this.emit("bossDefeated", { bossId });
    return true;
  }

  prepareFinaleDebugState() {
    for (let id = 1; id <= this.totalCrownFragments; id++) this.completedFragmentIds.add(id);
    this.crownFragmentsCollected = this.totalCrownFragments;
    this.crownComplete = true;
    this.defeatedBosses.add("armoryBeetle");
    this.defeatedBosses.add("royalChambersRatKnight");
  }
}
