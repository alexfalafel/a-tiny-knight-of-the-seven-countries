const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export class NetworkPing {
  constructor({ hostname, pageUrl, fetcher = globalThis.fetch?.bind(globalThis), clock = () => performance.now(),
    setTimer = globalThis.setTimeout, clearTimer = globalThis.clearTimeout, intervalMs = 2500, timeoutMs = 1400 } = {}) {
    const host = (hostname ?? globalThis.location?.hostname ?? "").toLowerCase();
    this.isLocal = LOCAL_HOSTS.has(host);
    this.pageUrl = pageUrl ?? globalThis.location?.href;
    this.fetcher = fetcher;
    this.clock = clock;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.intervalMs = intervalMs;
    this.timeoutMs = timeoutMs;
    this.nextSampleAt = 0;
    this.pending = false;
    this.smoothedMs = null;
    this.display = this.isLocal ? "LOCAL" : "--";
  }

  update(now = this.clock()) {
    if (this.isLocal || this.pending || now < this.nextSampleAt) return this.display;
    this.nextSampleAt = now + this.intervalMs;
    if (!this.fetcher || !this.pageUrl) { this.display = "--"; return this.display; }
    this.pending = true;
    const controller = new AbortController();
    const startedAt = this.clock();
    const url = new URL(this.pageUrl);
    url.searchParams.set("__ping", String(Math.round(startedAt)));
    const timer = this.setTimer(() => controller.abort(), this.timeoutMs);
    Promise.resolve().then(() => this.fetcher(url.href, {
      method: "HEAD", cache: "no-store", credentials: "same-origin", signal: controller.signal,
    })).then((response) => {
      if (!response.ok) throw new Error("same-origin latency request failed");
      const measured = Math.max(0, this.clock() - startedAt);
      this.smoothedMs = this.smoothedMs === null ? measured : this.smoothedMs * .65 + measured * .35;
      this.display = `${Math.round(this.smoothedMs)} ms`;
    }).catch(() => {
      this.display = "--";
    }).finally(() => {
      this.clearTimer(timer);
      this.pending = false;
    });
    return this.display;
  }
}
