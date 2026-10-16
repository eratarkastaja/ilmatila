import { describe, expect, it, vi } from 'vitest';
import { MissionSystem } from '../../src/combat/mission-system.js';
import { MISSION_OUTCOME } from '../../src/combat/mission-objective.js';

function makeElement() {
  const classes = new Set();
  return {
    textContent: '',
    hidden: true,
    classList: {
      add: vi.fn(name => classes.add(name)),
      remove: vi.fn(name => classes.delete(name)),
    },
    querySelector: vi.fn(() => null),
  };
}

function makeMissionSystem(objective, remaining = { airRemaining: 1, groundRemaining: 1 }) {
  const nodes = {
    objectiveTitle: makeElement(),
    objectiveProgress: makeElement(),
    status: makeElement(),
    statusText: makeElement(),
  };
  const system = new MissionSystem({
    mission: { id: 'intercept' },
    objective,
    totals: { air: 2, ground: 3 },
    getRemaining: () => remaining,
    nodes,
  });
  return { system, nodes, setRemaining: next => { remaining = next; } };
}

describe('MissionSystem', () => {
  it('completes an air objective only after hostile aircraft are cleared', () => {
    const { system, nodes, setRemaining } = makeMissionSystem({ type: 'clearAir' });

    system.update(1);
    expect(system.outcome).toBe(MISSION_OUTCOME.ACTIVE);
    setRemaining({ airRemaining: 0, groundRemaining: 3 });
    system.update(1);

    expect(system.outcome).toBe(MISSION_OUTCOME.COMPLETE);
    expect(system.missionComplete).toBe(true);
    expect(nodes.objectiveProgress.textContent).toBe('OBJECTIVE ACHIEVED');
    expect(nodes.statusText.textContent).toBe('OBJECTIVE ACHIEVED');
    expect(nodes.status.classList.add).toHaveBeenCalledWith('complete');
  });

  it('identifies pending air reinforcements while the primary wave is clear', () => {
    const { system, nodes, setRemaining } = makeMissionSystem({ type: 'clearAir' });

    setRemaining({ airRemaining: 2, pendingAirRemaining: 2, groundRemaining: 0 });
    system.update(1);

    expect(system.outcome).toBe(MISSION_OUTCOME.ACTIVE);
    expect(nodes.objectiveProgress.textContent).toBe('2 HOSTILE AIRCRAFT REMAIN · 2 INBOUND');
  });

  it('requires both air and armed ground threats for support completion', () => {
    const { system, setRemaining } = makeMissionSystem({ type: 'support' });
    setRemaining({ airRemaining: 0, groundRemaining: 1 });
    system.update(1);
    expect(system.outcome).toBe(MISSION_OUTCOME.ACTIVE);

    setRemaining({ airRemaining: 0, groundRemaining: 0 });
    system.update(1);
    expect(system.outcome).toBe(MISSION_OUTCOME.COMPLETE);
  });

  it('advances training time to its configured limit and then completes', () => {
    const { system, nodes } = makeMissionSystem({ type: 'training', duration: 5 });

    system.update(8);

    expect(system.elapsed).toBe(5);
    expect(system.outcome).toBe(MISSION_OUTCOME.COMPLETE);
    expect(nodes.objectiveProgress.textContent).toBe('OBJECTIVE ACHIEVED');
  });

  it('marks an active mission failed on player destruction without undoing completion', () => {
    const { system } = makeMissionSystem({ type: 'clearAir' });
    system.markPlayerDestroyed();
    expect(system.outcome).toBe(MISSION_OUTCOME.FAILED);
    expect(system.missionFailed).toBe(true);

    const completed = makeMissionSystem({ type: 'clearAir' });
    completed.setRemaining({ airRemaining: 0, groundRemaining: 0 });
    completed.system.update(1);
    completed.system.markPlayerDestroyed();
    expect(completed.system.outcome).toBe(MISSION_OUTCOME.COMPLETE);
    expect(completed.system.missionFailed).toBe(false);
  });

  it('defers objective completion until an inactive phase is activated and then allows RTB completion', () => {
    const nodes = {
      objectiveTitle: makeElement(),
      objectiveProgress: makeElement(),
      status: makeElement(),
      statusText: makeElement(),
    };
    const system = new MissionSystem({
      mission: { id: 'intercept' },
      objective: { type: 'clearAir' },
      totals: { air: 1, ground: 0 },
      getRemaining: () => ({ airRemaining: 0, groundRemaining: 0 }),
      nodes,
      deferCompletion: true,
      initiallyActive: false,
    });

    system.update(1);
    expect(system.objectiveSatisfied).toBe(false);
    expect(system.outcome).toBe(MISSION_OUTCOME.ACTIVE);

    system.activate();
    system.update(1);
    expect(system.objectiveSatisfied).toBe(true);
    expect(system.missionComplete).toBe(false);
    expect(system.outcome).toBe(MISSION_OUTCOME.ACTIVE);

    system.notifyObjectiveAchieved();
    system.returnToBase();
    expect(nodes.statusText.textContent).toBe('RETURN TO BASE');
    system.finish(MISSION_OUTCOME.COMPLETE);
    expect(system.missionComplete).toBe(true);
    expect(system.outcome).toBe(MISSION_OUTCOME.COMPLETE);
  });

  it('defers an operational setback until recovery without treating it as success', () => {
    const system = new MissionSystem({
      mission: { id: 'intercept' },
      objective: { type: 'assetDefense' },
      totals: { air: 3, ground: 0 },
      getRemaining: () => ({
        airRemaining: 3,
        groundRemaining: 0,
        priorityTargetsRemaining: 1,
        protectedAssetLost: true,
      }),
      nodes: {},
      deferCompletion: true,
      initiallyActive: true,
    });

    system.update(0);

    expect(system.objectiveSatisfied).toBe(true);
    expect(system.objectiveResult).toBe(MISSION_OUTCOME.SETBACK);
    expect(system.outcome).toBe(MISSION_OUTCOME.ACTIVE);
    expect(system.missionFailed).toBe(false);
    system.notifyObjectiveSetback();
    system.finish(MISSION_OUTCOME.SETBACK);
    expect(system.outcome).toBe(MISSION_OUTCOME.SETBACK);
    expect(system.missionFailed).toBe(true);
  });

  it('advances through staged campaign objectives before opening RTB', () => {
    let remaining = {
      airRemaining: 1, groundRemaining: 4, priorityTargetsRemaining: 1,
      friendlyStrengthFraction: .9, friendlyLogisticsFraction: 1,
    };
    const nodes = {
      objectiveTitle: makeElement(),
      objectiveProgress: makeElement(),
      status: makeElement(),
      statusText: makeElement(),
    };
    const stageChanges = [];
    const system = new MissionSystem({
      mission: { id: 'border-holds' },
      objective: {
        type: 'staged',
        stages: [
          { id: 'intercept', type: 'strikeDefense' },
          { id: 'line', type: 'forceDefense', minimumFriendlyStrength: .45, maximumGroundRemaining: 3 },
          { id: 'assault', type: 'holdPosition', duration: 2 },
        ],
      },
      totals: { air: 2, ground: 4 },
      getRemaining: () => remaining,
      nodes,
      deferCompletion: true,
      initiallyActive: true,
      onStageChange: (stage, index) => stageChanges.push({ stage, index }),
    });

    system.update(1);
    expect(system.activeStageIndex).toBe(0);
    expect(system.objectiveSatisfied).toBe(false);

    remaining = { ...remaining, priorityTargetsRemaining: 0, airRemaining: 0 };
    system.update(1);
    expect(system.activeStageIndex).toBe(1);
    expect(stageChanges).toHaveLength(1);
    expect(system.outcome).toBe(MISSION_OUTCOME.ACTIVE);

    remaining = { ...remaining, groundRemaining: 2 };
    system.update(1);
    expect(system.activeStageIndex).toBe(2);
    expect(stageChanges).toHaveLength(2);

    system.update(2);
    expect(system.objectiveSatisfied).toBe(true);
    expect(system.objectiveResult).toBe(MISSION_OUTCOME.COMPLETE);
    expect(system.outcome).toBe(MISSION_OUTCOME.ACTIVE);
  });
});
