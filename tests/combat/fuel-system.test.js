import { describe, expect, it } from 'vitest';
import { DIFFICULTY_PRESETS } from '../../src/combat/difficulty.js';
import { FuelSystem } from '../../src/combat/fuel-system.js';

describe('FuelSystem', () => {
  it('provides twice as much endurance on Standard as Hard and no limit on Easy', () => {
    const easy = new FuelSystem(DIFFICULTY_PRESETS.easy.player.fuel);
    const standard = new FuelSystem(DIFFICULTY_PRESETS.standard.player.fuel);
    const hard = new FuelSystem(DIFFICULTY_PRESETS.hard.player.fuel);

    expect(easy.unlimited).toBe(true);
    expect(easy.remainingSeconds).toBeNull();
    expect(standard.capacitySeconds).toBe(hard.capacitySeconds * 2);
    expect(hard.capacitySeconds).toBe(4 * 60 * 60);
  });

  it('burns normal fuel in cruise and five times faster with afterburner', () => {
    const fuel = new FuelSystem(DIFFICULTY_PRESETS.hard.player.fuel);

    expect(fuel.update(10, false)).toBe(false);
    expect(fuel.remainingSeconds).toBe(14390);
    expect(fuel.update(10, true)).toBe(true);
    expect(fuel.remainingSeconds).toBe(14340);
    expect(fuel.fraction).toBeCloseTo(14340 / 14400);
  });

  it('disables afterburner once empty without allowing fuel to underflow', () => {
    const fuel = new FuelSystem({ enduranceMinutes: 1, afterburnerMultiplier: 5 });

    expect(fuel.update(12, true)).toBe(true);
    expect(fuel.remainingSeconds).toBe(0);
    expect(fuel.hasFuel).toBe(false);
    expect(fuel.update(5, true)).toBe(false);
    expect(fuel.remainingSeconds).toBe(0);
  });

  it('keeps Easy unlimited while afterburner is active', () => {
    const fuel = new FuelSystem(DIFFICULTY_PRESETS.easy.player.fuel);

    expect(fuel.update(3600, true)).toBe(true);
    expect(fuel.remainingSeconds).toBeNull();
    expect(fuel.fraction).toBe(1);
  });
});
