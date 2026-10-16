import { describe, expect, it } from 'vitest';
import { getMetricThresholds, isMetricThresholdActive } from '../../src/campaign/strategic-metrics.js';

describe('campaign strategic metric thresholds', () => {
  it('defines every score threshold with its real comparison direction', () => {
    expect(getMetricThresholds('airControl').map(({ value, operator }) => ({ value, operator })))
      .toEqual([
        { value: 30, operator: 'below' },
        { value: 40, operator: 'below' },
        { value: 70, operator: 'atLeast' },
        { value: 75, operator: 'atLeast' },
      ]);
    expect(getMetricThresholds('defenseIntegrity').map(({ value, operator }) => ({ value, operator })))
      .toEqual([
        { value: 35, operator: 'below' },
        { value: 65, operator: 'atLeast' },
        { value: 75, operator: 'atLeast' },
      ]);
    expect(getMetricThresholds('sortieReadiness').map(({ value, operator }) => ({ value, operator })))
      .toEqual([
        { value: 35, operator: 'below' },
        { value: 80, operator: 'atLeast' },
      ]);
  });

  it('marks overlapping low and high effects active at their actual boundaries', () => {
    const thresholds = getMetricThresholds('airControl');
    expect(thresholds.map(threshold => isMetricThresholdActive(threshold, 29)))
      .toEqual([true, true, false, false]);
    expect(thresholds.map(threshold => isMetricThresholdActive(threshold, 40)))
      .toEqual([false, false, false, false]);
    expect(thresholds.map(threshold => isMetricThresholdActive(threshold, 75)))
      .toEqual([false, false, true, true]);

    const defenseThresholds = getMetricThresholds('defenseIntegrity');
    expect(defenseThresholds.map(threshold => isMetricThresholdActive(threshold, 65)))
      .toEqual([false, true, false]);
  });

  it('returns no thresholds for an unknown metric', () => {
    expect(getMetricThresholds('unknown')).toEqual([]);
    expect(isMetricThresholdActive(null, 50)).toBe(false);
  });
});
