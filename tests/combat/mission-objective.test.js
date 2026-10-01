import { describe, expect, it } from 'vitest';
import {
  advanceMissionObjective,
  evaluateMissionObjective,
  MISSION_OUTCOME,
} from '../../src/combat/mission-objective.js';

describe('mission objective progression', () => {
  it('completes air-clear missions only when all hostile aircraft are down', () => {
    const objective = { type: 'clearAir' };
    const initial = { elapsed: 0, outcome: MISSION_OUTCOME.ACTIVE };

    expect(advanceMissionObjective(objective, initial, 1, { airRemaining: 1 }).outcome)
      .toBe(MISSION_OUTCOME.ACTIVE);
    expect(advanceMissionObjective(objective, initial, 1, { airRemaining: 0 }).outcome)
      .toBe(MISSION_OUTCOME.COMPLETE);
  });

  it('requires both aircraft and armed ground units for support completion', () => {
    const objective = { type: 'support' };

    expect(evaluateMissionObjective(objective, { airRemaining: 0, groundRemaining: 1 }))
      .toBe(MISSION_OUTCOME.ACTIVE);
    expect(evaluateMissionObjective(objective, { airRemaining: 1, groundRemaining: 0 }))
      .toBe(MISSION_OUTCOME.ACTIVE);
    expect(evaluateMissionObjective(objective, { airRemaining: 0, groundRemaining: 0 }))
      .toBe(MISSION_OUTCOME.COMPLETE);
  });

  it('advances training time without exceeding its duration', () => {
    const objective = { type: 'training', duration: 90 };
    const state = { elapsed: 89.5, outcome: MISSION_OUTCOME.ACTIVE };
    const next = advanceMissionObjective(objective, state, 2, {});

    expect(next).toEqual({ elapsed: 90, outcome: MISSION_OUTCOME.COMPLETE });
  });

  it('fails an active mission when the aircraft is destroyed', () => {
    expect(advanceMissionObjective(
      { type: 'clearAir' },
      { elapsed: 12, outcome: MISSION_OUTCOME.ACTIVE },
      0.016,
      { airRemaining: 2, destroyed: true },
    )).toEqual({ elapsed: 12, outcome: MISSION_OUTCOME.FAILED });
  });

  it('keeps completed and failed mission outcomes terminal', () => {
    const completed = advanceMissionObjective(
      { type: 'training', duration: 90 },
      { elapsed: 90, outcome: MISSION_OUTCOME.COMPLETE },
      1,
      { destroyed: true },
    );
    const failed = advanceMissionObjective(
      { type: 'clearAir' },
      { elapsed: 0, outcome: MISSION_OUTCOME.FAILED },
      1,
      { airRemaining: 0 },
    );

    expect(completed.outcome).toBe(MISSION_OUTCOME.COMPLETE);
    expect(failed.outcome).toBe(MISSION_OUTCOME.FAILED);
  });
});
