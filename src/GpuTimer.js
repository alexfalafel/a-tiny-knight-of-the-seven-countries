// Optional, asynchronous GPU samples during K/B only. Never wait for the GPU.
export class GpuTimer {
  constructor(gl) {
    this.gl = gl; this.extension = null; this.slots = []; this.current = null; this.nextAt = 0;
    try {
      this.extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (this.extension) for (let i = 0; i < 4; i++) this.slots.push({ query: gl.createQuery(), pending: false, token: null });
    } catch { this.extension = null; }
  }
  poll(accept) {
    if (!this.extension) return;
    const gl = this.gl;
    const disjoint = gl.getParameter(this.extension.GPU_DISJOINT_EXT);
    for (const slot of this.slots) {
      if (!slot.pending) continue;
      if (disjoint) slot.invalid = true;
      if (!gl.getQueryParameter(slot.query, gl.QUERY_RESULT_AVAILABLE)) continue;
      if (!slot.invalid) accept(gl.getQueryParameter(slot.query, gl.QUERY_RESULT) / 1e6, slot.token);
      slot.pending = false;
    }
  }
  begin(now, token) {
    if (!this.extension || now < this.nextAt) return;
    const slot = this.slots.find(item => !item.pending);
    if (!slot) return;
    this.nextAt = now + 100; slot.token = token; slot.invalid = false;
    this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, slot.query); this.current = slot;
  }
  end() {
    if (!this.current) return;
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.current.pending = true; this.current = null;
  }
}
