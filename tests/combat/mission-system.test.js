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
});
