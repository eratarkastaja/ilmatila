import { describe, expect, it } from 'vitest';
import { DIFFICULTY_PRESETS } from '../../src/combat/difficulty.js';
import { MISSIONS } from '../../src/mission/missions.js';
import { validateGameConfig } from '../../src/config/validate-config.js';

describe('game configuration validation', () => {
  it('accepts every difficulty preset and mission', () => {
    expect(validateGameConfig()).toEqual([]);
  });

  it('reports a missing difficulty preset or mission', () => {
    const difficulties = { ...DIFFICULTY_PRESETS };
    const missions = { ...MISSIONS };
    delete difficulties.hard;
    delete missions.training;

    const errors = validateGameConfig({ difficulties, missions });

    expect(errors).toContain('difficulties.hard is required');
    expect(errors).toContain('missions.training is required');
  });

  it('reports missing, mistyped, out-of-range, and inconsistent difficulty settings', () => {
    const difficulties = structuredClone(DIFFICULTY_PRESETS);
    delete difficulties.hard.fighter.detection.range;
    difficulties.easy.player.hull = '135';
    difficulties.standard.fighter.health = 99;
    difficulties.hard.fighter.missile.minRange = difficulties.hard.fighter.missile.maxRange;
    difficulties.standard.player.chaff.radarMissileBreakChance = 1.4;
    difficulties.easy.player.chaff.count = 2.5;

    const errors = validateGameConfig({ difficulties, missions: {} });

    expect(errors).toContain('difficulties.easy.player.hull must be a finite number');
    expect(errors).toContain('difficulties.hard.fighter.detection.range must be a finite number');
    expect(errors).toContain('difficulties.standard.fighter.health must be between 0.1 and 5');
    expect(errors).toContain('difficulties.hard.fighter.missile.minRange must be less than maxRange');
    expect(errors).toContain('difficulties.standard.player.chaff.radarMissileBreakChance must be between 0 and 1');
    expect(errors).toContain('difficulties.easy.player.chaff.count must be an integer');
  });

  it('reports invalid mission fields, unreasonable values, and broken relationships', () => {
    const missions = structuredClone(MISSIONS);
    delete missions.intercept.navigationDistance;
    missions.support.groundBattle = 'yes';
    missions.patrol.hostiles = 1000;
    missions.intercept.hostileStagingDistance = 0;
    missions.support.hostileHelicopterMinimumSpawnDistance = 15000;
    missions.support.unlocks = ['missing'];

    const errors = validateGameConfig({ difficulties: {}, missions });

    expect(errors).toContain('missions.intercept.navigationDistance must be a finite number');
    expect(errors).toContain('missions.support.groundBattle must be a boolean');
    expect(errors).toContain('missions.patrol.hostiles must be between 0 and 100');
    expect(errors).toContain('missions.intercept.hostileStagingDistance must be between 1 and 100000');
    expect(errors).toContain('missions.support.hostileHelicopterMinimumSpawnDistance must not exceed hostileHelicopterSpawnDistance');
    expect(errors).toContain('missions.support.unlocks contains unknown mission "missing"');
  });
});
