import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { MISSION_OUTCOME } from '../../src/combat/mission-objective.js';
import { MISSION_PHASE, MissionFlowSystem } from '../../src/combat/mission-flow.js';

function createFlow(mission = { hostiles: 2, departureDuration: 2, navigationDistance: 4000, navigationRadius: 100, objectiveReportDuration: 1 }) {
  const player = new THREE.Object3D();
  const onIngress = vi.fn();
  const onObjectiveComplete = vi.fn();
  const onRtb = vi.fn();
  const onEnd = vi.fn();
  const flow = new MissionFlowSystem({
    mission,
    player,
    terrain: { worldSize: 16000 },
    onIngress,
    onObjectiveComplete,
    onRtb,
    onEnd,
  });
  return { flow, player, onIngress, onObjectiveComplete, onRtb, onEnd };
}

describe('MissionFlowSystem', () => {
  it('runs a sortie from departure through contact, engagement, objective, RTB, and debrief', () => {
    const { flow, player, onIngress, onObjectiveComplete, onRtb, onEnd } = createFlow();

    flow.update(2);
    expect(flow.phase).toBe(MISSION_PHASE.NAVIGATION);
    player.position.copy(flow.ingress);
    flow.update(0.1);
    expect(flow.phase).toBe(MISSION_PHASE.CONTACT);
    expect(onIngress).toHaveBeenCalledOnce();

    flow.update(0.1, { detectedHostiles: 2 });
    expect(flow.contactDetected).toBe(true);
    expect(flow.phase).toBe(MISSION_PHASE.CONTACT);
    flow.update(0.1, { playerEngaged: true });
    expect(flow.phase).toBe(MISSION_PHASE.ENGAGEMENT);
    flow.update(0.1, { targetDestroyed: true });
    expect(flow.phase).toBe(MISSION_PHASE.OBJECTIVE);

    flow.update(0.1, { objectiveSatisfied: true });
    expect(onObjectiveComplete).toHaveBeenCalledOnce();
    expect(flow.phase).toBe(MISSION_PHASE.OBJECTIVE);
    flow.update(1, { objectiveSatisfied: true });
    expect(flow.phase).toBe(MISSION_PHASE.RTB);
    expect(onRtb).toHaveBeenCalledOnce();

    player.position.copy(flow.home);
    flow.update(0.1, { objectiveSatisfied: true });
    expect(flow.phase).toBe(MISSION_PHASE.DEBRIEF);
    expect(flow.outcome).toBe(MISSION_OUTCOME.COMPLETE);
    expect(onEnd).toHaveBeenCalledWith(MISSION_OUTCOME.COMPLETE, expect.any(Number));
  });

  it('sends training sorties to the objective phase without creating hostile contact', () => {
    const { flow, player, onIngress, onRtb } = createFlow({
      hostiles: 0,
      departureDuration: 0,
      navigationDistance: 4000,
      navigationRadius: 100,
      objectiveReportDuration: 0,
    });

    flow.update(0.1);
    player.position.copy(flow.ingress);
    flow.update(0.1);
    expect(onIngress).toHaveBeenCalledOnce();
    expect(flow.phase).toBe(MISSION_PHASE.OBJECTIVE);
    flow.update(0.1, { objectiveSatisfied: true });
    expect(flow.phase).toBe(MISSION_PHASE.RTB);
    expect(onRtb).toHaveBeenCalledOnce();
  });

  it('accepts a fast ingress pass that crosses the waypoint between frames', () => {
    const { flow, player, onIngress } = createFlow({
      hostiles: 0,
      departureDuration: 0,
      navigationDistance: 4000,
      navigationRadius: 100,
    });
    flow.update(0.1);
    player.position.set(flow.ingress.x - 500, flow.ingress.y, flow.ingress.z);
    flow.update(0.1);
    expect(flow.phase).toBe(MISSION_PHASE.NAVIGATION);
    player.position.set(flow.ingress.x + 500, flow.ingress.y, flow.ingress.z);
    flow.update(0.1);
    expect(flow.phase).toBe(MISSION_PHASE.OBJECTIVE);
    expect(onIngress).toHaveBeenCalledOnce();
  });

  it('keeps the contact phase visible briefly before entering engagement', () => {
    const { flow, player } = createFlow({
      hostiles: 2,
      contactSetupDuration: .5,
      departureDuration: 0,
      navigationDistance: 100,
      navigationRadius: 20,
    });
    flow.update(0);
    player.position.copy(flow.ingress);
    flow.update(0, { detectedHostiles: 2 });
    expect(flow.phase).toBe(MISSION_PHASE.CONTACT);

    flow.update(.4, { detectedHostiles: 2, playerEngaged: true });
    expect(flow.phase).toBe(MISSION_PHASE.CONTACT);
    flow.update(.1, { detectedHostiles: 2, playerEngaged: true });
    expect(flow.phase).toBe(MISSION_PHASE.ENGAGEMENT);
  });

  it('ends a destroyed aircraft sortie as failed', () => {
    const { flow, onEnd } = createFlow();

    flow.update(0.1, { destroyed: true });

    expect(flow.phase).toBe(MISSION_PHASE.DEBRIEF);
    expect(flow.outcome).toBe(MISSION_OUTCOME.FAILED);
    expect(onEnd).toHaveBeenCalledWith(MISSION_OUTCOME.FAILED, expect.any(Number));
  });

  it('carries a resolved setback through RTB and extraction', () => {
    const { flow, player, onObjectiveComplete, onEnd } = createFlow({
      hostiles: 0,
      departureDuration: 0,
      navigationDistance: 100,
      navigationRadius: 20,
      extractionRadius: 20,
      objectiveReportDuration: 0,
    });
    flow.update(0);
    player.position.copy(flow.ingress);
    flow.update(0, {
      objectiveSatisfied: true,
      objectiveOutcome: MISSION_OUTCOME.SETBACK,
    });

    expect(onObjectiveComplete).toHaveBeenCalledWith(MISSION_OUTCOME.SETBACK);
    expect(flow.phase).toBe(MISSION_PHASE.RTB);
    player.position.copy(flow.home);
    flow.update(0, {
      objectiveSatisfied: true,
      objectiveOutcome: MISSION_OUTCOME.SETBACK,
    });

    expect(flow.outcome).toBe(MISSION_OUTCOME.SETBACK);
    expect(onEnd).toHaveBeenCalledWith(MISSION_OUTCOME.SETBACK, expect.any(Number));
  });
});
