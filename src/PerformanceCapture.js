const percentiles = (sorted, value) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)] : 0;

export class PerformanceCapture {
  constructor({ durationSeconds = 15, onProgress = () => {}, onComplete = () => {} } = {}) {
    this.durationMs = durationSeconds * 1000;
    this.onProgress = onProgress;
    this.onComplete = onComplete;
    this.active = false;
    this.longTasks = { count: 0, totalMs: 0, longestMs: 0 };
  }

  cancel() {
    this.active = false;
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = null;
  }

  start(context = {}, durationSeconds = 15) {
    if (this.active) return false;
    this.durationMs = durationSeconds * 1000;
    this.nextProgressAt = 0;
    this.context = context;
    this.startedAt = performance.now();
    this.frameTimes = [];
    this.gpuSamples = []; this.spikes = []; this.heapSamples = []; this.longTaskWindows = [];
    this.nextHeapAt = this.startedAt;
    this.subsystems = new Map();
    this.statistics = new Map();
    this.roomCounts = new Map();
    this.longTasks = { count: 0, totalMs: 0, longestMs: 0 };
    this.active = true;
    if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
      try {
        this.longTaskObserver = new PerformanceObserver((list) => {
          this.recordLongTasks(list.getEntries());
        });
        this.longTaskObserver.observe({ type: "longtask", buffered: false });
      } catch { this.longTaskObserver = null; }
    }
    this.onProgress(0, this.durationMs);
    return true;
  }

  recordLongTasks(entries) {
    for (const entry of entries) {
      const duration = entry.duration || 0;
      this.longTasks.count++;
      this.longTaskWindows.push({ start: entry.startTime, end: entry.startTime + duration });
      this.longTasks.totalMs += duration;
      this.longTasks.longestMs = Math.max(this.longTasks.longestMs, duration);
    }
  }

  record(frameTimeMs, timings, stats, now = performance.now(), intervalEnd = now) {
    if (!this.active) return;
    if (Number.isFinite(frameTimeMs) && frameTimeMs > 0) this.frameTimes.push(frameTimeMs);
    for (const name in timings) this.accumulate(this.subsystems, name, timings[name]);
    for (const name in stats) {
      const value = stats[name];
      if (typeof value === "string") {
        let counts = this.roomCounts.get(name);
        if (!counts) this.roomCounts.set(name, counts = new Map());
        counts.set(value, (counts.get(value) || 0) + 1);
      } else if (Number.isFinite(value)) this.accumulate(this.statistics, name, value);
    }
    if (frameTimeMs > 25 && this.spikes.length < 120) this.spikes.push({ start: intervalEnd - frameTimeMs, end: intervalEnd, ms: frameTimeMs });
    if (now >= this.nextHeapAt) {
      this.nextHeapAt = now + 1000;
      if (Number.isFinite(performance.memory?.usedJSHeapSize)) this.heapSamples.push({ at: now, bytes: performance.memory.usedJSHeapSize });
    }
    const elapsed = now - this.startedAt;
    if (elapsed >= this.durationMs) this.finish(now);
    else if (elapsed >= this.nextProgressAt) {
      this.nextProgressAt = elapsed + 250;
      this.onProgress(elapsed, this.durationMs);
    }
  }

  recordGpu(milliseconds) {
    if (this.active && Number.isFinite(milliseconds)) this.gpuSamples.push(milliseconds);
  }

  accumulate(map, name, value) {
    let aggregate = map.get(name);
    if (!aggregate) map.set(name, aggregate = { sum: 0, count: 0, maximum: 0 });
    const sample = Number.isFinite(value) ? value : 0;
    aggregate.sum += sample; aggregate.count++;
    aggregate.maximum = Math.max(aggregate.maximum, sample);
  }

  finish(now = performance.now()) {
    if (!this.active) return null;
    this.active = false;
    if (this.longTaskObserver) this.recordLongTasks(this.longTaskObserver.takeRecords());
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = null;
    const elapsedMs = Math.max(1, now - this.startedAt);
    const frames = this.frameTimes;
    const sorted = [...frames].sort((a, b) => a - b);
    const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const fpsFor = (frameTime) => frameTime > 0 ? 1000 / frameTime : 0;
    const slowestOnePercent = [...frames].sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(frames.length * .01)));
    const subsystemAverages = Object.fromEntries([...this.subsystems].map(([name, values]) => [name, values.sum / values.count]));
    const statSummary = Object.fromEntries([...this.statistics].map(([name, values]) => [name, { average: values.sum / values.count, maximum: values.maximum }]));
    const roomCounts = Object.fromEntries([...this.roomCounts].map(([name, values]) => [name, Object.fromEntries(values)]));
    const reportData = {
      durationSeconds: elapsedMs / 1000,
      frameCount: frames.length,
      averageFps: fpsFor(mean(frames)),
      medianFps: fpsFor(percentiles(sorted, .5)),
      minimumFps: fpsFor(sorted.at(-1) || 0),
      maximumFps: fpsFor(sorted[0] || 0),
      onePercentLowFps: fpsFor(mean(slowestOnePercent)),
      averageFrameTimeMs: mean(frames),
      medianFrameTimeMs: percentiles(sorted, .5),
      p95FrameTimeMs: percentiles(sorted, .95),
      worstFrameTimeMs: sorted.at(-1) || 0,
      framesOver25ms: frames.filter(value => value > 25).length,
      framesOver33ms: frames.filter(value => value > 33).length,
      gpu: { samples: this.gpuSamples.length, averageMs: mean(this.gpuSamples), maximumMs: Math.max(0, ...this.gpuSamples) },
      spikes: this.spikes.map(spike => ({ atSeconds: (spike.end - this.startedAt) / 1000, ms: spike.ms, longTaskOverlap: this.longTaskWindows.some(task => task.start < spike.end && task.end > spike.start) })),
      heap: this.heapSamples.length ? { startBytes: this.heapSamples[0].bytes, endBytes: this.heapSamples.at(-1).bytes, maximumBytes: Math.max(...this.heapSamples.map(sample => sample.bytes)), samples: this.heapSamples.length, timeline: this.heapSamples.map(sample => ({ atSeconds: (sample.at - this.startedAt) / 1000, bytes: sample.bytes })) } : null,
      framesOver16_7ms: frames.filter((value) => value > 16.7).length,
      framesOver33_3ms: frames.filter((value) => value > 33.3).length,
      framesOver50ms: frames.filter((value) => value > 50).length,
      framesOver100ms: frames.filter((value) => value > 100).length,
      subsystemAverages,
      statSummary,
      roomCounts,
      longTasks: { ...this.longTasks },
      context: this.context,
    };
    this.onComplete(reportData);
    return reportData;
  }

  static format(report) {
    const d = (value) => Number.isFinite(value) ? value.toFixed(2) : "0.00";
    const stat = (name) => report.statSummary[name] || { average: 0, maximum: 0 };
    const ctx = report.context;
    const subsystemNames = [
      ["Input", "input"], ["Player update (excluding collision)", "player"], ["Collision checks CPU", "collision"],
      ["Camera", "camera"], ["Interactions / combat", "interactions"], ["Enemy / boss update", "enemies"],
      ["Particles / VFX", "particles"], ["UI update", "ui"], ["Other game update", "other"], ["Renderer submission CPU", "render"],
    ];
    const subsystemText = subsystemNames.map(([label, key]) => `  ${label}: ${d(report.subsystemAverages[key] || 0)} ms/frame`).join("\n");
    const rows = [
      "=== PERFORMANCE CAPTURE ===",
      `Duration: ${d(report.durationSeconds)}s (${report.frameCount} frames)`,
      `Active room: ${ctx.activeRoom}`,
      `Diagnostic modes: ${ctx.diagnosticModes}`,
      "",
      `Visibility at start: ${ctx.visibilityState || "unknown"}; hidden-frame samples: ${d(stat("hidden").average * report.frameCount)}; death observed: ${stat("gameOver").maximum ? "yes" : "no"}`,
      "A visible tab can still be throttled by its host. Compare normal gameplay in real Chrome at the same viewport.",
      "FPS",
      `Average: ${d(report.averageFps)}`,
      `Median: ${d(report.medianFps)}`,
      `1% low: ${d(report.onePercentLowFps)}`,
      `Min: ${d(report.minimumFps)}`,
      `Max: ${d(report.maximumFps)}`,
      "",
      "FRAME TIME",
      `Average: ${d(report.averageFrameTimeMs)} ms`,
      `Median: ${d(report.medianFrameTimeMs)} ms`,
      `P95: ${d(report.p95FrameTimeMs)} ms`,
      `Worst: ${d(report.worstFrameTimeMs)} ms`,
      `Over 16.7 / 33.3 / 50 / 100 ms: ${report.framesOver16_7ms} / ${report.framesOver33_3ms} / ${report.framesOver50ms} / ${report.framesOver100ms}`,
      "",
      `Over 25 / 33 / 50 / 100 ms: ${report.framesOver25ms} / ${report.framesOver33ms} / ${report.framesOver50ms} / ${report.framesOver100ms}`,
      `GPU samples: ${report.gpu.samples}; average/max render GPU ms: ${d(report.gpu.averageMs)} / ${d(report.gpu.maximumMs)} (asynchronous samples; no sample means unavailable)`,
      "SUBSYSTEM CPU TIME",
      subsystemText,
      "",
      "RENDERER (average / maximum)",
      `Draw calls: ${d(stat("drawCalls").average)} / ${d(stat("drawCalls").maximum)}`,
      `Triangles: ${d(stat("triangles").average)} / ${d(stat("triangles").maximum)}`,
      `Points: ${d(stat("points").average)} / ${d(stat("points").maximum)}; lines: ${d(stat("lines").average)} / ${d(stat("lines").maximum)}`,
      `Geometries avg/max: ${d(stat("geometries").average)} / ${d(stat("geometries").maximum)}; textures avg/max: ${d(stat("textures").average)} / ${d(stat("textures").maximum)}`,
      `Canvas: ${ctx.canvasWidth} x ${ctx.canvasHeight} px (${ctx.canvasCssWidth} x ${ctx.canvasCssHeight} CSS px) at pixel ratio ${d(ctx.pixelRatio)}`,
      "",
      "SCENE (average / maximum)",
      `Visible meshes: ${d(stat("visibleMeshes").average)} / ${d(stat("visibleMeshes").maximum)}`,
      `Visible rooms / updating rooms: ${d(stat("visibleRooms").average)} / ${d(stat("updatingRooms").average)}`,
      `Active environment groups: ${d(stat("activeEnvironmentGroups").average)} / ${d(stat("activeEnvironmentGroups").maximum)}`,
      `Active lights / shadow lights: ${d(stat("activeLights").average)} / ${d(stat("activeLights").maximum)}; ${d(stat("shadowLights").average)} / ${d(stat("shadowLights").maximum)}`,
      `Enemies / bosses: ${d(stat("activeEnemies").average)} / ${d(stat("activeEnemies").maximum)}; ${d(stat("activeBosses").average)} / ${d(stat("activeBosses").maximum)}`,
      `Active particle emitters: ${d(stat("activeParticles").average)} / ${d(stat("activeParticles").maximum)}`,
      `Collision checks/frame: ${d(stat("collisionChecks").average)} / ${d(stat("collisionChecks").maximum)}`,
      `Interaction checks/frame: ${d(stat("interactionChecks").average)} / ${d(stat("interactionChecks").maximum)}`,
      `Raycasts/frame: ${d(stat("raycasts").average)} / ${d(stat("raycasts").maximum)}`,
      `Rooms sampled: ${Object.keys(report.roomCounts.activeRoom || {}).join(", ") || ctx.activeRoom}`,
      "",
      "BROWSER / GRAPHICS",
      `User agent: ${ctx.userAgent}`,
      `Device pixel ratio: ${d(ctx.devicePixelRatio)}; screen: ${ctx.screenWidth} x ${ctx.screenHeight}`,
      `WebGL: ${ctx.webglVersion}`,
      `GPU vendor / renderer: ${ctx.webglVendor} / ${ctx.webglRenderer}`,
      `GPU timer query: ${ctx.gpuTimerQuery}`,
      "",
      "LONG TASKS",
      `Supported: ${ctx.longTasksSupported ? "yes" : "no"}; count: ${report.longTasks.count}`,
      `Total: ${d(report.longTasks.totalMs)} ms; longest: ${d(report.longTasks.longestMs)} ms`,
      "",
      "Renderer submission timing is CPU-side wall time around renderer.render(); it is not GPU execution time.",
      `Heap: ${report.heap ? JSON.stringify(report.heap) : "unavailable"} (bytes; sampled once/second; nonstandard and approximate)`,
      `First up to 120 >25ms spikes: ${JSON.stringify(report.spikes)}`,
      "Long-task overlap is temporal evidence, not proof of cause. Heap changes cannot identify GC reliably.",
      "All measurements were collected locally in this browser. No data was sent anywhere.",
    ];
    return rows.join("\n");
  }
}
