import { describe, expect, it } from 'vitest';
import { createMi24AttackHelicopter } from '../../src/aircraft/rotorcraft.js';
import { DIFFICULTY_PRESETS } from '../../src/combat/difficulty.js';
import { MISSILE_PROFILES } from '../../src/combat/projectiles.js';

describe('air-combat loadouts', () => {
  it('sets player weapon and countermeasure inventories by difficulty', () => {
    expect(Object.values(DIFFICULTY_PRESETS).map(preset => ({
      airMissiles: preset.player.weapons.airMissiles,
      groundMissiles: preset.player.weapons.groundMissiles,
      gunRounds: preset.player.weapons.gunRounds,
      flares: preset.player.countermeasures,
      chaff: preset.player.chaff.count,
    }))).toEqual([
      { airMissiles: 10, groundMissiles: 10, gunRounds: null, flares: 20, chaff: 20 },
      { airMissiles: 10, groundMissiles: 10, gunRounds: 2000, flares: 15, chaff: 15 },
      { airMissiles: 6, groundMissiles: 6, gunRounds: 1200, flares: 10, chaff: 10 },
    ]);
    expect(MISSILE_PROFILES.playerAir.count).toBe(10);
  });

  it('sets friendly and hostile air-to-air missile capacity for every difficulty', () => {
    expect(Object.values(DIFFICULTY_PRESETS).map(preset => preset.wingman.airMissile.capacity))
      .toEqual([4, 6, 8]);
    expect(Object.values(DIFFICULTY_PRESETS).map(preset => preset.fighter.missile.capacity))
      .toEqual([2, 4, 5]);
    expect(createMi24AttackHelicopter().userData.airToAirStores).toHaveLength(4);
  });
});
