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

  it('supports campaign hold and logistics objectives without clearing every threat', () => {
    expect(evaluateMissionObjective({ type: 'holdPosition', duration: 180 }, {
      elapsed: 180, airRemaining: 4, groundRemaining: 8,
    })).toBe(MISSION_OUTCOME.COMPLETE);
    expect(evaluateMissionObjective({ type: 'holdPosition', duration: 180 }, {
      elapsed: 179.9, airRemaining: 0, groundRemaining: 0,
    })).toBe(MISSION_OUTCOME.ACTIVE);
    expect(evaluateMissionObjective({ type: 'logisticsStrike' }, {
      priorityTargetsRemaining: 0, airRemaining: 4, groundRemaining: 8,
    })).toBe(MISSION_OUTCOME.COMPLETE);
    expect(evaluateMissionObjective({ type: 'strikeDefense' }, {
      priorityTargetsRemaining: 0, airRemaining: 3,
    })).toBe(MISSION_OUTCOME.COMPLETE);
  });

  it('requires the E18 logistics column to survive its timed transfer window', () => {
    const objective = {
      type: 'protectUntilProgress', duration: 300, minimumLogisticsFraction: .5,
    };

    expect(evaluateMissionObjective(objective, {
      elapsed: 300, friendlyLogisticsFraction: .5,
    })).toBe(MISSION_OUTCOME.COMPLETE);
    expect(evaluateMissionObjective(objective, {
      elapsed: 300, friendlyLogisticsFraction: .49,
    })).toBe(MISSION_OUTCOME.ACTIVE);
  });

  it('completes air policing after identification and a sustained escort', () => {
    const objective = { type: 'airPolicing', requiredContacts: 2, escortDuration: 12 };

    expect(evaluateMissionObjective(objective, {
      identifiedCount: 1, contactCount: 2, escortElapsed: 12,
    })).toBe(MISSION_OUTCOME.ACTIVE);
    expect(evaluateMissionObjective(objective, {
      identifiedCount: 2, contactCount: 2, escortElapsed: 11.9,
    })).toBe(MISSION_OUTCOME.ACTIVE);
    expect(evaluateMissionObjective(objective, {
      identifiedCount: 2, contactCount: 2, escortElapsed: 12,
    })).toBe(MISSION_OUTCOME.COMPLETE);
  });

  it('resolves asset and force defense as success or setback at authored thresholds', () => {
    expect(evaluateMissionObjective({ type: 'assetDefense' }, {
      priorityTargetsRemaining: 0, airRemaining: 0,
    })).toBe(MISSION_OUTCOME.COMPLETE);
    expect(evaluateMissionObjective({ type: 'assetDefense' }, {
      priorityTargetsRemaining: 0, airRemaining: 1,
    })).toBe(MISSION_OUTCOME.ACTIVE);
    expect(evaluateMissionObjective({ type: 'assetDefense' }, {
      priorityTargetsRemaining: 1,
      protectedAssetLost: true,
    })).toBe(MISSION_OUTCOME.SETBACK);

    const forceDefense = {
      type: 'forceDefense', minimumFriendlyStrength: 0.4, maximumGroundRemaining: 3,
    };
    expect(evaluateMissionObjective(forceDefense, {
      airRemaining: 0, groundRemaining: 3, friendlyStrengthFraction: 0.4,
    })).toBe(MISSION_OUTCOME.COMPLETE);
    expect(evaluateMissionObjective(forceDefense, {
      airRemaining: 0, groundRemaining: 2, friendlyStrengthFraction: 0.39,
    })).toBe(MISSION_OUTCOME.SETBACK);
  });

  it('turns authored deadlines and defensive-line losses into recoverable setbacks', () => {
    expect(evaluateMissionObjective({
      type: 'clearAir',
      setback: { type: 'deadline', duration: 120 },
    }, { elapsed: 120, airRemaining: 2 })).toBe(MISSION_OUTCOME.SETBACK);

    expect(evaluateMissionObjective({
      type: 'support',
      setback: { type: 'friendlyStrength', minimum: .5 },
    }, { friendlyStrengthFraction: .49, groundRemaining: 4 })).toBe(MISSION_OUTCOME.SETBACK);

    expect(evaluateMissionObjective({
      type: 'clearAir',
      setback: { type: 'assetLost', graceDuration: 3 },
    }, { elapsed: 2.9, protectedAssetLost: true, priorityTargetsRemaining: 1 })).toBe(MISSION_OUTCOME.ACTIVE);
    expect(evaluateMissionObjective({
      type: 'clearAir',
      setback: { type: 'assetLost', graceDuration: 3 },
    }, { elapsed: 3, protectedAssetLost: true, priorityTargetsRemaining: 1 })).toBe(MISSION_OUTCOME.SETBACK);

    expect(evaluateMissionObjective({
      type: 'protectUntilProgress', duration: 300, minimumLogisticsFraction: .5,
      setback: { type: 'friendlyLogistics', minimum: .5 },
    }, { elapsed: 300, friendlyLogisticsFraction: .49 })).toBe(MISSION_OUTCOME.SETBACK);
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
