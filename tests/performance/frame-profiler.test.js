import { describe, expect, it } from 'vitest';
import { FrameProfiler, summarizeFrameIntervals } from '../../src/performance/frame-profiler.js';

describe('frame profiler', () => {
  it('summarizes average, percentile, and worst frame intervals', () => {
    const profiler = new FrameProfiler(16);
    [0, 16, 32, 48, 80, 96].forEach(timestamp => profiler.recordFrame(timestamp));

    expect(profiler.snapshot()).toEqual({
      samples: 5,
      average: 19.2,
      median: 16,
      p95: 32,
      worst: 32,
      worstTen: [32, 16, 16, 16, 16],
    });
  });

  it('keeps a bounded rolling window and excludes gaps across paused intervals', () => {
    const profiler = new FrameProfiler(3);
    [0, 10, 20].forEach(timestamp => profiler.recordFrame(timestamp));
    profiler.resetClock();
    [1000, 1016, 1032].forEach(timestamp => profiler.recordFrame(timestamp));

    expect(profiler.snapshot()).toEqual({
      samples: 3,
      average: 14,
      median: 16,
      p95: 16,
      worst: 16,
      worstTen: [16, 16, 10],
    });
  });

  it('returns empty metrics for an unsampled frame window', () => {
    expect(summarizeFrameIntervals([])).toEqual({
      samples: 0,
      average: 0,
      median: 0,
      p95: 0,
      worst: 0,
      worstTen: [],
    });
  });
});
