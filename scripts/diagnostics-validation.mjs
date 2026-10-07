import assert from 'node:assert/strict';
import { GpuTimer } from '../src/GpuTimer.js';
import { PerformanceCapture } from '../src/PerformanceCapture.js';
import { sharedGeometry } from '../src/SceneOptimization.js';
import * as THREE from 'three';

let created = 0, resultsRead = 0, available = false, disjoint = false;
const extension = { GPU_DISJOINT_EXT: 1, TIME_ELAPSED_EXT: 2 };
const gl = {
  QUERY_RESULT_AVAILABLE: 3, QUERY_RESULT: 4,
  getExtension: () => extension, createQuery: () => ({ id: ++created }),
  getParameter: () => disjoint,
  getQueryParameter: (_query, key) => {
    if (key === 3) return available;
    assert(available); resultsRead++; return 2500000;
  }, beginQuery() {}, endQuery() {},
};
const timer = new GpuTimer(gl), accepted = [];
const accept = (ms, token) => accepted.push({ ms, token });
timer.begin(0, 'first'); timer.end(); timer.poll(accept);
assert.equal(resultsRead, 0, 'never read an unavailable GPU result');
available = true; timer.poll(accept);
assert.deepEqual(accepted, [{ ms: 2.5, token: 'first' }]);
timer.begin(100, 'disjoint'); timer.end(); disjoint = true; timer.poll(accept);
assert.equal(accepted.length, 1, 'reject disjoint GPU timing'); disjoint = false;
for (let i = 2; i < 100; i++) { timer.begin(i * 100, 'next'); timer.end(); timer.poll(accept); }
assert.equal(created, 4, 'query objects are reused');
new GpuTimer({ getExtension: () => null }).poll(accept);

const capture = new PerformanceCapture(); capture.start({ visibilityState: 'visible' });
const start = capture.startedAt;
capture.recordLongTasks([{ startTime: start + 40, duration: 55 }]);
capture.record(60, { render: 2 }, { hidden: 0, gameOver: 0 }, start + 120, start + 100);
capture.record(16, { render: 4 }, { hidden: 0, gameOver: 0 }, start + 136, start + 116);
capture.recordGpu(2.5);
const report = capture.finish(start + 15000);
assert(Math.abs(report.spikes[0].atSeconds - .1) < 1e-9, 'spike timestamp uses RAF interval end, not submission end');
assert.equal(report.spikes[0].longTaskOverlap, true);
assert.equal(report.framesOver25ms, 1); assert.equal(report.framesOver50ms, 1);
assert.equal(report.gpu.averageMs, 2.5); assert.equal(report.subsystemAverages.render, 3);
assert(PerformanceCapture.format(report).includes('Visibility at start: visible'));
assert.equal(sharedGeometry(THREE.SphereGeometry, 1, 14, 10), sharedGeometry(THREE.SphereGeometry, 1, 14, 10));
assert.notEqual(sharedGeometry(THREE.SphereGeometry, 1, 14, 12), sharedGeometry(THREE.SphereGeometry, 1, 14, 10));
console.log('PASS asynchronous GPU availability/disjoint/reuse, capture spike timestamps/aggregation, optional GPU fallback and immutable geometry cache identity');

