import { describe, expect, it } from 'vitest';
import { getKitHardpoints, getKitLimits, getKitWeight, getRecommendedKit, KIT_LIMITS, validateKit } from '../../src/campaign/campaign-kit.js';

const inventory = {
  airMissiles: 10,
  groundMissiles: 10,
  gunRounds: 3500,
  flares: 15,
  chaff: 15,
  fuelMinutes: 480,
};

describe('campaign kit selection', () => {
  it('provides a valid mission-aware recommendation', () => {
    const kit = getRecommendedKit(inventory, { groundBattle: true });
    expect(kit.airMissiles).toBe(4);
    expect(kit.groundMissiles).toBe(4);
    expect(validateKit(kit, inventory)).toBe(true);
  });

  it('rejects kits that exceed hardpoints or payload mass', () => {
    const overHardpoints = { ...inventory, fuelMinutes: 300 };
    expect(getKitHardpoints(overHardpoints)).toBe(20);
    expect(validateKit(overHardpoints, inventory)).toBe(false);

    const overMass = { ...inventory, fuelMinutes: 480 };
    expect(getKitWeight(overMass)).toBeGreaterThan(KIT_LIMITS.payloadKg);
    expect(validateKit(overMass, inventory)).toBe(false);
  });

  it('keeps unlimited fuel unlimited', () => {
    const kit = getRecommendedKit({ ...inventory, fuelMinutes: null }, {});
    expect(kit.fuelMinutes).toBeNull();
    expect(validateKit(kit, { ...inventory, fuelMinutes: null })).toBe(true);
  });

  it('keeps the hard difficulty at the real ten-station limit while Easy gets arcade headroom', () => {
    expect(getKitLimits('hard').hardpoints).toBe(10);
    expect(getKitLimits('standard').internalHardpoints).toBe(4);
    expect(getKitLimits('easy').hardpoints).toBe(12);
  });

  it('adds four external missile stations and payload capacity for the ordnance support package', () => {
    const limits = getKitLimits('hard', {
      campaignKitHardpointDelta: 4,
      campaignKitPayloadDeltaKg: 800,
    });
    expect(limits.hardpoints).toBe(14);
    expect(limits.externalHardpoints).toBe(10);
    expect(limits.payloadKg).toBe(5000);
    expect(getRecommendedKit(inventory, {
      campaignKitHardpointDelta: 4,
      groundBattle: true,
    }).airMissiles).toBe(8);
  });

  it('makes long-range strike weapons meaningfully heavier than small glide weapons', () => {
    const light = getRecommendedKit(inventory, { groundBattle: true });
    const heavy = { ...light, groundMissileType: 'jassm' };
    expect(getKitWeight(heavy)).toBeGreaterThan(getKitWeight(light));
  });
});
