// Driven by the existing game frame loop; no synthetic gameplay or additional RAF.
export class BenchmarkMatrix {
  constructor({ capture, snapshot, apply, context, status, complete, format }) {
    Object.assign(this, { capture, snapshot, apply, context, status, complete, format });
    this.active = false;
    this.tests = [
      ["CURRENT NORMAL", {}], ["SHADOWS OFF", { shadows: false }],
      ["LOCAL LIGHTS OFF", { localLights: false }], ["PIXEL RATIO 0.75", { pixelRatioIndex: 0 }],
      ["CURRENT ROOM ONLY", { currentRoomOnly: true }], ["UI OFF", { hideUi: true }],
      ["PARTICLES OFF", { particles: false }], ["DECORATIVE PROPS OFF", { propsVisible: false }],
    ];
  }
  start() {
    if (this.active || this.capture.active) return;
    this.baseline = this.snapshot(); this.results = []; this.index = -1;
    this.initialContext = this.context(); this.active = true; this.pending = true;
  }
  tick(now, invalidReason) {
    if (!this.active) return;
    if (invalidReason) return this.cancel(invalidReason);
    if (this.pending) {
      this.pending = false; this.index++;
      if (this.index >= this.tests.length) return this.finish();
      this.apply(this.baseline);
      this.apply({ ...this.baseline, ...this.tests[this.index][1] });
      this.readyAt = now + 750;
      this.status(`BENCHMARK ${this.index + 1}/8 — ${this.tests[this.index][0]}\nSettling... B to cancel`);
    } else if (!this.capture.active && now >= this.readyAt) {
      this.capture.start(this.context(), 5);
      return true; // Exclude the interval that straddles warmup and recording.
    }
  }
  accept(report) {
    this.results.push(report); this.pending = true;
  }
  cancel(reason) {
    this.capture.cancel(); this.apply(this.baseline); this.active = false;
    this.status(`BENCHMARK CANCELLED: ${reason}. Settings restored. Press B to restart.`);
  }
  finish() {
    this.apply(this.baseline); this.active = false;
    const baseline = this.results[0].averageFps;
    const lines = ["=== REAL BROWSER BENCHMARK MATRIX ===", "Local browser diagnostic; verify the browser/GPU details below.",
      "Sequential gameplay samples are not a controlled proof of causality.", "Settings restored after each test. 750 ms settling + about 5 seconds per test.",
      `Baseline settings: ${JSON.stringify(this.baseline)}`, ""];
    this.results.forEach((report, i) => {
      lines.push(this.tests[i][0], `Avg FPS: ${report.averageFps.toFixed(2)}`, `1% Low: ${report.onePercentLowFps.toFixed(2)}`);
      if (i) lines.push(`Delta: ${(report.averageFps - baseline).toFixed(2)} FPS (${baseline ? ((report.averageFps / baseline - 1) * 100).toFixed(1) : 0}%)`);
      lines.push("");
    });
    this.results.forEach((report, i) => lines.push(this.tests[i][0], this.format(report), ""));
    this.complete(lines.join("\n"));
  }
}
