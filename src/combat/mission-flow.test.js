import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { MISSION_OUTCOME } from './mission-objective.js';
import { MISSION_PHASE, MissionFlowSystem } from './mission-flow.js';

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

  it('ends a destroyed aircraft sortie as failed', () => {
    const { flow, onEnd } = createFlow();

    flow.update(0.1, { destroyed: true });

    expect(flow.phase).toBe(MISSION_PHASE.DEBRIEF);
    expect(flow.outcome).toBe(MISSION_OUTCOME.FAILED);
    expect(onEnd).toHaveBeenCalledWith(MISSION_OUTCOME.FAILED, expect.any(Number));
  });
});
