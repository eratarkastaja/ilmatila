import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../../src/mission/missions.js';
import { resolveMissionVariant } from '../../src/mission/mission-variants.js';

describe('authored mission variants', () => {
  it('resolves the same authored mission and encounter plan from the same seed', () => {
    const first = resolveMissionVariant(MISSIONS.patrol, 0x5eed1234);
    const repeated = resolveMissionVariant(MISSIONS.patrol, 0x5eed1234);

    expect(repeated).toEqual(first);
    expect(first.mission.id).toBe('patrol');
    expect(first.mission.unlocks).toBe(MISSIONS.patrol.unlocks);
    expect(MISSIONS.patrol.variants.some(variant => variant.id === first.variant.id)).toBe(true);
    for (const encounter of first.encounters) {
      expect(typeof encounter.scheduled).toBe('boolean');
      expect(encounter.delaySeconds).toBeGreaterThanOrEqual(12);
      expect(encounter.delaySeconds).toBeLessThanOrEqual(20);
      expect(['north-pair', 'wingman-pressure', 'strike-flight']).toContain(encounter.response.id);
    }
  });

  it('selects authored encounter responses from the sortie seed before combat begins', () => {
    const selected = new Set();
    for (let seed = 0; seed < 100; seed++) {
      const resolution = resolveMissionVariant(MISSIONS.support, seed);
      selected.add(resolution.encounters[0].response.id);
    }
    expect(selected).toEqual(new Set(['north-pair', 'wingman-pressure', 'strike-flight']));
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

  it('copies per-aircraft roles when resolving a variant', () => {
    const hostileRoles = ['sweep', 'strike'];
    const mission = {
      id: 'role-test',
      unlocks: [],
      variants: [{
        id: 'mixed-roles',
        labelKey: 'mission.variant.training.standard',
        weight: 1,
        changes: { hostiles: 2, hostileRoles },
      }],
    };

    const resolved = resolveMissionVariant(mission, 19);
    resolved.mission.hostileRoles[0] = 'strike';

    expect(resolved.mission.hostileRoles).toEqual(['strike', 'strike']);
    expect(hostileRoles).toEqual(['sweep', 'strike']);
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

  it('authors a guaranteed support encounter while starting wingmen in regroup', () => {
    expect(MISSIONS.support.wingmanInitialOrder).toBe('regroup');
    for (const variant of MISSIONS.support.variants) {
      const [encounter] = variant.encounters;
      expect(encounter.probability).toBe(1);
      expect(encounter.trigger.primaryGroupRemainingAtMost).toBe(1);
      expect(encounter.trigger.primaryGroundRemainingAtLeast).toBe(1);
      expect(encounter.trigger.reinforcementLogisticsRemainingAtLeast).toBe(1);
      expect(encounter.delayRangeSeconds).toEqual({ min: 12, max: 20 });
      expect(encounter.responses.every(response => response.hostiles === 2)).toBe(true);
    }
    expect(MISSIONS.support.optionalObjectives.find(objective => objective.id === 'destroy-logistics').target)
      .toMatchObject({ role: 'logistics', index: 0 });
  });
});
