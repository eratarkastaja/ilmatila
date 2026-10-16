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

    expect(scaled[0].minimumRemaining).toBe(13);
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

  it('tracks the designated support relay instead of any truck in the convoy', () => {
    const relay = { dead: false, role: 'logistics', armed: false };
    const otherTruck = { dead: false, role: 'logistics', armed: false };
    const tracker = new MissionOptionalObjectives([{
      id: 'relay',
      type: 'destroyOptionalGroundTarget',
      target: { collection: 'groundHostiles', role: 'logistics', index: 0 },
    }]);
    const state = makeState({ groundHostiles: [relay, otherTruck] });

    otherTruck.dead = true;
    expect(tracker.update(state)[0].status).toBe('pending');
    relay.dead = true;
    expect(tracker.update(state)[0].status).toBe('completed');
  });

  it('counts authored target groups and fails only when the required total becomes impossible', () => {
    const targets = [
      { dead: false, role: 'strike' },
      { dead: false, role: 'strike' },
      { dead: false, role: 'sweep' },
    ];
    const tracker = new MissionOptionalObjectives([{
      id: 'strike-package',
      type: 'destroyTargets',
      target: { collection: 'airHostiles', role: 'strike' },
      required: 2,
    }]);
    const state = makeState({ airHostiles: targets, targetCollectionsReady: { airHostiles: true } });

    expect(tracker.update(state)[0].status).toBe('pending');
    targets[0].dead = true;
    expect(tracker.update(state)[0].status).toBe('pending');
    targets[1].dead = true;
    expect(tracker.update(state)[0].status).toBe('completed');
  });

  it('matches authored roles even when runtime tactics mutate the role', () => {
    const tracker = new MissionOptionalObjectives([{
      id: 'sweep-screen',
      type: 'destroyTargets',
      target: { collection: 'airHostiles', role: 'sweep' },
      required: 1,
    }]);
    const state = makeState({
      airHostiles: [{ dead: true, role: 'flank', authoredRole: 'sweep' }],
      targetCollectionsReady: { airHostiles: true },
    });

    expect(tracker.update(state, true)[0].status).toBe('completed');
  });

  it('waits for delayed target collections and snapshots the authored group once', () => {
    const tracker = new MissionOptionalObjectives([{
      id: 'reinforcement-relay',
      type: 'destroyTargets',
      target: { collection: 'groundHostiles', role: 'logistics', reinforcementSource: true },
      required: 1,
    }]);
    const state = makeState({
      groundHostiles: [],
      targetCollectionsReady: { groundHostiles: false },
    });

    expect(tracker.update(state)[0].status).toBe('pending');
    const authoredRelay = { dead: false, role: 'logistics', reinforcementSource: true };
    state.groundHostiles = [authoredRelay];
    state.targetCollectionsReady.groundHostiles = true;
    expect(tracker.update(state)[0].status).toBe('pending');

    state.groundHostiles = [{ dead: false, role: 'logistics', reinforcementSource: true }];
    authoredRelay.dead = true;
    expect(tracker.update(state, true)[0].status).toBe('completed');
  });

  it('fails destroy groups that cannot meet their authored requirement', () => {
    const tracker = new MissionOptionalObjectives([{
      id: 'sweep-pair', type: 'destroyTargets',
      target: { collection: 'airHostiles', role: 'sweep' }, required: 2,
    }]);
    const state = makeState({
      airHostiles: [{ dead: false, role: 'sweep' }],
      targetCollectionsReady: { airHostiles: true },
    });

    expect(tracker.update(state)[0].status).toBe('failed');
  });

  it('preserves force thresholds and remembers zone penetrations across frames', () => {
    const defenders = [
      { dead: false, role: 'defender' },
      { dead: false, role: 'defender' },
      { dead: false, role: 'defender' },
      { dead: false, role: 'defender' },
    ];
    const strike = { dead: false, role: 'strike', mesh: { position: { x: 900, y: 0, z: 0 } } };
    const tracker = new MissionOptionalObjectives([
      {
        id: 'line', type: 'preserveForce',
        target: { collection: 'friendlyGround', role: 'defender' }, minimumFraction: .75,
      },
      {
        id: 'zone', type: 'denyZone',
        target: { collection: 'airHostiles', role: 'strike' },
        zone: { center: 'extraction', radius: 500 }, maximumPenetrations: 0,
      },
    ]);
    const state = makeState({ friendlyGround: defenders, airHostiles: [strike] });

    expect(tracker.update(state).map(result => result.status)).toEqual(['pending', 'pending']);
    defenders[0].dead = true;
    expect(tracker.update(state)[0].status).toBe('pending');
    strike.mesh.position.x = 900;
    expect(tracker.update(state)[1].status).toBe('pending');
    strike.mesh.position.x = 100;
    expect(tracker.update(state)[1].status).toBe('failed');
    expect(tracker.update({ ...state, outcome: 'complete' }, true)[0].status).toBe('completed');
  });

  it('evaluates preservation objectives independently of an accepted setback', () => {
    const state = makeState({ outcome: 'setback', missilesRemaining: 18 });
    const tracker = new MissionOptionalObjectives([
      { id: 'damage', type: 'noDamage' },
      { id: 'missiles', type: 'preserveMissiles', minimumRemaining: 16 },
      {
        id: 'force', type: 'preserveForce',
        target: { collection: 'friendlyGround', role: 'defender' }, minimumAlive: 1,
      },
      {
        id: 'zone', type: 'denyZone',
        target: { collection: 'airHostiles', role: 'strike' },
        zone: { center: 'extraction', radius: 500 }, maximumPenetrations: 0,
      },
    ]);
    state.airHostiles = [{ dead: false, role: 'strike', mesh: { position: { x: 1200, y: 0, z: 0 } } }];

    expect(tracker.update(state, true).map(result => result.status)).toEqual([
      'completed', 'completed', 'completed', 'completed',
    ]);

    const failedTracker = new MissionOptionalObjectives([{
      id: 'force', type: 'preserveForce',
      target: { collection: 'friendlyGround', role: 'defender' }, minimumAlive: 1,
    }]);
    state.friendlyGround[0].dead = true;
    expect(failedTracker.update(state, true)[0].status).toBe('failed');
  });

  it('requires every wingman to reach base for the explicit return objective', () => {
    const tracker = new MissionOptionalObjectives([{ id: 'home', type: 'allWingmenReturned' }]);
    const state = makeState({ outcome: 'setback', wingmenAtBase: 1 });

    expect(tracker.update(state, true)[0].status).toBe('failed');
    const returnedTracker = new MissionOptionalObjectives([{ id: 'home', type: 'allWingmenReturned' }]);
    state.wingmenAtBase = 2;
    expect(returnedTracker.update(state, true)[0].status).toBe('completed');
  });
});
