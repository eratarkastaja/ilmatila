import { describe, expect, it } from 'vitest';
import { createMi24AttackHelicopter } from '../../src/aircraft/rotorcraft.js';
import { DIFFICULTY_PRESETS } from '../../src/combat/difficulty.js';
import { MISSILE_PROFILES } from '../../src/combat/projectiles.js';

describe('air-combat loadouts', () => {
  it('gives the player ten air-to-air missiles and twenty chaff charges on every difficulty', () => {
    expect(MISSILE_PROFILES.playerAir.count).toBe(10);
    for (const preset of Object.values(DIFFICULTY_PRESETS)) {
      expect(preset.player.chaff.count).toBe(20);
    }
  });

  it('increases friendly and hostile air-to-air missile capacity at every difficulty', () => {
    expect(Object.values(DIFFICULTY_PRESETS).map(preset => preset.wingman.airMissile.capacity))
      .toEqual([4, 6, 8]);
    expect(Object.values(DIFFICULTY_PRESETS).map(preset => preset.fighter.missile.capacity))
      .toEqual([2, 4, 6]);
    expect(createMi24AttackHelicopter().userData.airToAirStores).toHaveLength(4);
  });
});
