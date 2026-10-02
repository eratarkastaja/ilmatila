import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../../src/mission/missions.js';
import { resolveMissionVariant } from '../../src/mission/mission-variants.js';

describe('authored mission variants', () => {
  it('resolves the same authored mission and reinforcement roll from the same seed', () => {
    const first = resolveMissionVariant(MISSIONS.patrol, 0x5eed1234);
    const repeated = resolveMissionVariant(MISSIONS.patrol, 0x5eed1234);

    expect(repeated).toEqual(first);
    expect(first.mission.id).toBe('patrol');
    expect(first.mission.unlocks).toBe(MISSIONS.patrol.unlocks);
    expect(MISSIONS.patrol.variants.some(variant => variant.id === first.variant.id)).toBe(true);
    if (first.reinforcement) {
      expect(typeof first.reinforcement.scheduled).toBe('boolean');
      expect(first.reinforcement.probability).toBeGreaterThanOrEqual(0);
      expect(first.reinforcement.probability).toBeLessThanOrEqual(1);
    }
  });

  it('keeps resolved optional objective data separate from authored definitions', () => {
    const authoredObjectives = [{ id: 'save-wingmen', type: 'allWingmenSurvive' }];
    const mission = {
      id: 'authored-test',
      unlocks: ['next-mission'],
      optionalObjectives: [],
      variants: [{
        id: 'changed-objectives',
        labelKey: 'mission.variant.training.standard',
        weight: 1,
        changes: { optionalObjectives: authoredObjectives },
      }],
    };

    const resolved = resolveMissionVariant(mission, 42);
    resolved.mission.optionalObjectives[0].id = 'changed-at-runtime';

    expect(resolved.mission.id).toBe('authored-test');
    expect(resolved.mission.unlocks).toBe(mission.unlocks);
    expect(authoredObjectives[0].id).toBe('save-wingmen');
  });

  it('defines authored variants for the built-in sorties without replacing their mission ids', () => {
    for (const [missionId, mission] of Object.entries(MISSIONS)) {
      expect(mission.variants.length, missionId).toBeGreaterThan(0);
      const resolved = resolveMissionVariant(mission, 0x0ddba11);
      expect(resolved.mission.id).toBe(missionId);
      expect(resolved.variant.id).toBeTruthy();
      expect(Array.isArray(resolved.mission.optionalObjectives)).toBe(true);
    }
  });
});
