function summarizeFrameIntervals(intervals) {
  const sorted = [...intervals].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return {
      samples: 0,
      average: 0,
      median: 0,
      p95: 0,
      worst: 0,
      worstTen: [],
    };
  }

  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    samples: sorted.length,
    average: sum / sorted.length,
    median: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)],
    worst: sorted.at(-1),
    worstTen: sorted.slice(-10).reverse(),
  };
}

/** Low-overhead dev-only sampling of intervals between active game frames. */
export class FrameProfiler {
  constructor(capacity = 6000) {
    this.samples = new Float32Array(capacity);
    this.cursor = 0;
    this.count = 0;
    this.previousFrameAt = null;
  }

  recordFrame(timestamp) {
    if (!Number.isFinite(timestamp)) return;
    if (this.previousFrameAt !== null) {
      const interval = timestamp - this.previousFrameAt;
      if (interval >= 0) {
        this.samples[this.cursor] = interval;
        this.cursor = (this.cursor + 1) % this.samples.length;
        this.count = Math.min(this.count + 1, this.samples.length);
      }
    }
    this.previousFrameAt = timestamp;
  }

  resetClock() {
    this.previousFrameAt = null;
  }

  reset() {
    this.cursor = 0;
    this.count = 0;
    this.resetClock();
  }

  snapshot() {
    return summarizeFrameIntervals(this.samples.subarray(0, this.count));
  }
}

export { summarizeFrameIntervals };
