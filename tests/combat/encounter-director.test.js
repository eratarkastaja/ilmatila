import { describe, expect, it, vi } from 'vitest';
import { EncounterDirector } from '../../src/combat/encounter-director.js';

function makeEncounter(overrides = {}) {
  return {
    id: 'enemy-reinforcement',
    scheduled: true,
    trigger: {
      primaryGroupRemainingAtMost: 1,
      objectiveActive: true,
      playerCombatCapable: true,
      primaryGroundRemainingAtLeast: 1,
      reinforcementLogisticsRemainingAtLeast: 1,
    },
    delaySeconds: 12,
    delayRangeSeconds: { min: 12, max: 20 },
    response: { id: 'north-pair', hostiles: 2 },
    ...overrides,
  };
}

const readyContext = {
  primaryGroupRemaining: 1,
  primaryGroundRemaining: 4,
  reinforcementLogisticsRemaining: 1,
  objectiveActive: true,
  playerCombatCapable: true,
};

describe('EncounterDirector', () => {
  it('waits for its authored trigger, warns once, then executes its preselected response after the delay', () => {
    const onWarning = vi.fn();
    const onExecute = vi.fn();
    const director = new EncounterDirector([makeEncounter()], { onWarning, onExecute });

    director.update(1, { ...readyContext, primaryGroupRemaining: 2 });
    expect(onWarning).not.toHaveBeenCalled();

    director.update(1, readyContext);
    expect(onWarning).toHaveBeenCalledOnce();
    expect(onWarning.mock.calls[0][0].id).toBe('enemy-reinforcement');
    expect(director.getPendingHostileCount()).toBe(2);
    expect(director.getPlannedHostileCount()).toBe(2);

    director.update(11.99, readyContext);
    expect(onExecute).not.toHaveBeenCalled();
    director.update(.02, readyContext);

    expect(onExecute).toHaveBeenCalledOnce();
    expect(onExecute).toHaveBeenCalledWith({ id: 'north-pair', hostiles: 2 }, expect.objectContaining({
      status: 'completed',
    }));
    expect(director.getPendingHostileCount()).toBe(0);
    expect(director.getPlannedHostileCount()).toBe(2);
  });

  it('holds a new encounter while another complication occupies the pressure slot', () => {
    const onWarning = vi.fn();
    const director = new EncounterDirector([makeEncounter()], { onWarning });

    director.update(5, { ...readyContext, complicationActive: true });
    expect(onWarning).not.toHaveBeenCalled();
    expect(director.events[0].status).toBe('waiting');

    director.update(0, { ...readyContext, complicationActive: false });
    expect(onWarning).toHaveBeenCalledOnce();
    expect(director.events[0].status).toBe('warning');
  });

  it('pauses a warned encounter delay while another complication is active', () => {
    const onExecute = vi.fn();
    const director = new EncounterDirector([makeEncounter()], { onExecute });
    director.update(0, readyContext);
    director.update(5, { ...readyContext, complicationActive: false });

    director.update(4, { ...readyContext, complicationActive: true });
    expect(director.events[0].remainingDelay).toBe(7);
    expect(director.hasActiveWarning()).toBe(true);
    expect(onExecute).not.toHaveBeenCalled();

    director.update(7, { ...readyContext, complicationActive: false });
    expect(onExecute).toHaveBeenCalledOnce();
  });

  it('cancels an encounter when its support force or combat-capable player condition is lost', () => {
    const director = new EncounterDirector([makeEncounter(), makeEncounter({ id: 'player-loss' })]);

    director.update(0, { ...readyContext, primaryGroundRemaining: 0 });
    director.update(0, { ...readyContext, playerCombatCapable: false });

    expect(director.events.map(event => event.status)).toEqual(['cancelled', 'cancelled']);
    expect(director.getPendingHostileCount()).toBe(0);
    expect(director.getPlannedHostileCount()).toBe(0);
  });

  it('cancels the support reinforcement before warning when the marked logistics relay is destroyed', () => {
    const onWarning = vi.fn();
    const director = new EncounterDirector([makeEncounter()], { onWarning });

    director.update(0, { ...readyContext, reinforcementLogisticsRemaining: 0 });

    expect(director.events[0].status).toBe('cancelled');
    expect(onWarning).not.toHaveBeenCalled();
    expect(director.getPlannedHostileCount()).toBe(0);
  });

  it('keeps the reinforcement committed after its warning even if the relay is destroyed', () => {
    const onExecute = vi.fn();
    const director = new EncounterDirector([makeEncounter()], { onExecute });
    director.update(0, readyContext);
    director.update(12, { ...readyContext, reinforcementLogisticsRemaining: 0 });

    expect(onExecute).toHaveBeenCalledOnce();
    expect(director.events[0].status).toBe('completed');
  });

  it('does not cancel an encounter after the warning has given the player time to respond', () => {
    const onExecute = vi.fn();
    const director = new EncounterDirector([makeEncounter()], { onExecute });
    director.update(0, readyContext);
    director.update(12, { ...readyContext, primaryGroundRemaining: 0, playerCombatCapable: false });

    expect(onExecute).toHaveBeenCalledOnce();
    expect(director.events[0].status).toBe('completed');
  });

  it('releases planned objective count if the spawn callback cannot execute the response', () => {
    const director = new EncounterDirector([makeEncounter()], { onExecute: () => false });
    director.update(0, readyContext);
    director.update(12, readyContext);

    expect(director.events[0].status).toBe('cancelled');
    expect(director.getPlannedHostileCount()).toBe(0);
  });
});
