import { describe, expect, it } from 'vitest';
import {
  MissionOptionalObjectives,
  scaleMissileReserveObjectives,
} from '../../src/mission/optional-objectives.js';
import { DIFFICULTY_PRESETS } from '../../src/combat/difficulty.js';

function makeState(overrides = {}) {
  const hostileFighter = { dead: false, hp: 10, mesh: { position: { x: 0, y: 300, z: 4000 } } };
  const logistics = { dead: false, hp: 10, role: 'logistics', armed: false };
  const friendlyDefender = { dead: false, hp: 10, role: 'defender', team: 'blue' };
  return {
    outcome: 'complete',
    elapsed: 60,
    damageTaken: 0,
    wingmenReturned: 2,
    wingmenTotal: 2,
    missilesRemaining: 18,
    airHostiles: [hostileFighter],
    groundHostiles: [logistics],
    friendlyGround: [friendlyDefender],
    extractionCenter: { x: 0, z: 0 },
    ...overrides,
  };
}

describe('MissionOptionalObjectives', () => {
  it('scales missile reserve targets to the available loadout without mutating mission data', () => {
    const objectives = [
      { id: 'missiles', type: 'preserveMissiles', minimumRemaining: 16 },
      { id: 'wingmen', type: 'allWingmenSurvive' },
    ];
    const scaled = scaleMissileReserveObjectives(
      objectives,
      DIFFICULTY_PRESETS.hard.player.weapons,
      DIFFICULTY_PRESETS.standard.player.weapons,
    );

    expect(scaled[0].minimumRemaining).toBe(10);
    expect(scaled[1]).toBe(objectives[1]);
    expect(objectives[0].minimumRemaining).toBe(16);
  });

  it('evaluates the built-in data-driven objective types at extraction', () => {
    const objectives = [
      { id: 'wingmen', type: 'allWingmenSurvive' },
      { id: 'damage', type: 'noDamage' },
      { id: 'ground', type: 'destroyOptionalGroundTarget', target: { collection: 'groundHostiles', role: 'logistics' } },
      { id: 'time', type: 'completeBeforeTime', limitSeconds: 90 },
      { id: 'missiles', type: 'preserveMissiles', minimumRemaining: 16 },
      { id: 'friendly', type: 'protectFriendlyGroundUnit', target: { collection: 'friendlyGround', role: 'defender' } },
      {
        id: 'intercept', type: 'interceptBeforeZone',
        target: { collection: 'airHostiles', index: 0, labelKey: 'mission.optionalTarget.leadFighter' },
        zoneRadius: 1000,
      },
    ];
    const state = makeState();
    state.groundHostiles[0].dead = true;
    state.airHostiles[0].dead = true;

    const tracker = new MissionOptionalObjectives(objectives);
    const results = tracker.update(state, true);

    expect(results.map(result => result.status)).toEqual(Array(7).fill('completed'));
    expect(state.outcome).toBe('complete');
  });

  it('keeps objectives pending in flight and records condition failures at the right time', () => {
    const objectives = [
      { id: 'wingmen', type: 'allWingmenSurvive' },
      { id: 'damage', type: 'noDamage' },
      { id: 'ground', type: 'destroyOptionalGroundTarget', target: { collection: 'groundHostiles', role: 'logistics' } },
      { id: 'time', type: 'completeBeforeTime', limitSeconds: 30 },
      { id: 'missiles', type: 'preserveMissiles', minimumRemaining: 16 },
      { id: 'friendly', type: 'protectFriendlyGroundUnit', target: { collection: 'friendlyGround', role: 'defender' } },
      {
        id: 'intercept', type: 'interceptBeforeZone',
        target: { collection: 'airHostiles', index: 0 }, zoneRadius: 1000,
      },
    ];
    const tracker = new MissionOptionalObjectives(objectives);
    const state = makeState({ damageTaken: 4, wingmenReturned: 1, elapsed: 45, missilesRemaining: 4 });

    expect(tracker.update(state).map(result => result.status)).toEqual([
      'failed', 'failed', 'pending', 'pending', 'pending', 'pending', 'pending',
    ]);

    state.friendlyGround[0].dead = true;
    state.airHostiles[0].mesh.position.z = 500;
    const results = tracker.update(state, true);
    expect(results.map(result => result.status)).toEqual([
      'failed', 'failed', 'failed', 'failed', 'failed', 'failed', 'failed',
    ]);
    expect(results[2].detailKey).toBe('mission.optionalObjective.result.groundTargetAlive');
    expect(results[3].detailKey).toBe('mission.optionalObjective.result.timeLimitMissed');
    expect(results[5].detailKey).toBe('mission.optionalObjective.result.friendlyTargetLost');
    expect(results[6].detailKey).toBe('mission.optionalObjective.result.zoneReached');
  });

  it('marks unavailable targets and unassigned wingmen as not applicable', () => {
    const tracker = new MissionOptionalObjectives([
      { id: 'wingmen', type: 'allWingmenSurvive' },
      { id: 'ground', type: 'destroyOptionalGroundTarget', target: { collection: 'groundHostiles', role: 'logistics' } },
    ]);

    const results = tracker.update(makeState({
      wingmenTotal: 0,
      groundHostiles: [],
      outcome: 'failed',
    }), true);

    expect(results.map(result => result.status)).toEqual(['notApplicable', 'notApplicable']);
  });
});
