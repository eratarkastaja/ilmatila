export const MISSION_OUTCOME = Object.freeze({
  ACTIVE: 'active',
  COMPLETE: 'complete',
  FAILED: 'failed',
  ABORTED: 'aborted',
});

export function evaluateMissionObjective(objective, {
  elapsed = 0,
  airRemaining = Infinity,
  groundRemaining = Infinity,
  destroyed = false,
  outcome = MISSION_OUTCOME.ACTIVE,
} = {}) {
  if (outcome !== MISSION_OUTCOME.ACTIVE) return outcome;
  if (destroyed) return MISSION_OUTCOME.FAILED;

  const complete = objective.type === 'training'
    ? elapsed >= (objective.duration ?? 90)
    : objective.type === 'support'
      ? airRemaining <= 0 && groundRemaining <= 0
      : airRemaining <= 0;

  return complete ? MISSION_OUTCOME.COMPLETE : MISSION_OUTCOME.ACTIVE;
}

export function advanceMissionObjective(objective, state, dt, progress = {}) {
  const current = {
    elapsed: state.elapsed ?? 0,
    outcome: state.outcome ?? MISSION_OUTCOME.ACTIVE,
  };
  if (current.outcome !== MISSION_OUTCOME.ACTIVE) return current;

  const elapsed = objective.type === 'training'
    ? Math.min(objective.duration ?? 90, current.elapsed + Math.max(0, Number.isFinite(dt) ? dt : 0))
    : current.elapsed;
  const outcome = evaluateMissionObjective(objective, { ...progress, elapsed });
  return { elapsed, outcome };
}
