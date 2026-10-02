const terminalStatuses = new Set(['completed', 'failed', 'notApplicable']);

function isDestroyed(unit) {
  return !unit || unit.dead === true || (Number.isFinite(unit.hp) && unit.hp <= 0);
}

const TARGET_FOUND = 1;
const TARGET_DESTROYED = 2;

/** Scales authored missile reserves when a difficulty carries fewer stores. */
export function scaleMissileReserveObjectives(objectives, currentWeapons, referenceWeapons) {
  const rows = Array.isArray(objectives) ? objectives : [];
  const capacity = weapons => (weapons?.airMissiles ?? 0) + (weapons?.groundMissiles ?? 0);
  const available = capacity(currentWeapons);
  const reference = capacity(referenceWeapons);
  if (reference <= 0 || available >= reference) return rows;

  return rows.map(objective => {
    if (objective.type !== 'preserveMissiles') return objective;
    return {
      ...objective,
      minimumRemaining: Math.min(
        available,
        Math.max(0, Math.round((objective.minimumRemaining ?? 0) * available / reference)),
      ),
    };
  });
}

function matchesSelector(unit, selector) {
  if (selector.role && unit.role !== selector.role) return false;
  if (selector.team && unit.team !== selector.team) return false;
  if (selector.armed !== undefined && unit.armed !== selector.armed) return false;
  return true;
}

/** Returns bit flags for whether a selector matched and whether a match was destroyed. */
function targetStatus(state, selector) {
  const collection = state[selector?.collection];
  if (!Array.isArray(collection)) return 0;
  let matchIndex = 0;
  let status = 0;
  for (const unit of collection) {
    if (!matchesSelector(unit, selector)) continue;
    if (selector.index !== undefined && matchIndex++ !== selector.index) continue;
    status |= TARGET_FOUND;
    if (isDestroyed(unit)) status |= TARGET_DESTROYED;
    if (selector.index !== undefined || (status & TARGET_DESTROYED)) return status;
  }
  return status;
}

function selectedTarget(state, selector) {
  const collection = state[selector?.collection];
  if (!Array.isArray(collection)) return null;
  let matchIndex = 0;
  const targetIndex = selector.index ?? 0;
  for (const unit of collection) {
    if (!matchesSelector(unit, selector)) continue;
    if (matchIndex++ === targetIndex) return unit;
  }
  return null;
}

function setResult(result, status, detailKey, key1, value1, key2, value2) {
  result.status = status;
  result.detailKey = detailKey;
  if (key1) result.params[key1] = value1;
  if (key2) result.params[key2] = value2;
}

const evaluators = {
  allWingmenSurvive(result, _objective, state, final) {
    if (state.wingmenTotal === 0) return setResult(result, 'notApplicable', 'mission.optionalObjective.result.noWingmen');
    if (state.wingmenReturned < state.wingmenTotal) {
      return setResult(result, 'failed', 'mission.optionalObjective.result.wingmenReturned',
        'returned', state.wingmenReturned, 'total', state.wingmenTotal);
    }
    if (!final) return setResult(result, 'pending', 'mission.optionalObjective.result.wingmenStillFlying',
      'total', state.wingmenTotal);
    return state.outcome === 'complete'
      ? setResult(result, 'completed', 'mission.optionalObjective.result.wingmenReturned',
        'returned', state.wingmenReturned, 'total', state.wingmenTotal)
      : setResult(result, 'failed', 'mission.optionalObjective.result.sortieIncomplete');
  },
  noDamage(result, _objective, state, final) {
    if (state.damageTaken > 0) {
      return setResult(result, 'failed', 'mission.optionalObjective.result.damageTaken',
        'damage', Math.round(state.damageTaken));
    }
    if (!final) return setResult(result, 'pending', 'mission.optionalObjective.result.noDamageYet');
    return state.outcome === 'complete'
      ? setResult(result, 'completed', 'mission.optionalObjective.result.noDamageTaken')
      : setResult(result, 'failed', 'mission.optionalObjective.result.sortieIncomplete');
  },
  destroyOptionalGroundTarget(result, objective, state, final) {
    const targets = targetStatus(state, objective.target);
    if (!(targets & TARGET_FOUND)) {
      return final
        ? setResult(result, 'notApplicable', 'mission.optionalObjective.result.targetUnavailable')
        : setResult(result, 'pending', 'mission.optionalObjective.result.waitingForTarget');
    }
    if (targets & TARGET_DESTROYED) return setResult(result, 'completed', 'mission.optionalObjective.result.groundTargetDestroyed');
    return final
      ? setResult(result, 'failed', 'mission.optionalObjective.result.groundTargetAlive')
      : setResult(result, 'pending', 'mission.optionalObjective.result.groundTargetAlive');
  },
  completeBeforeTime(result, objective, state, final) {
    if (!final) return setResult(result, 'pending', 'mission.optionalObjective.result.timeLimit',
      'limit', objective.limitSeconds);
    const completedInTime = state.outcome === 'complete' && state.elapsed <= objective.limitSeconds;
    return setResult(result, completedInTime ? 'completed' : 'failed',
      state.outcome !== 'complete'
        ? 'mission.optionalObjective.result.sortieIncomplete'
        : completedInTime
          ? 'mission.optionalObjective.result.completedInTime'
          : 'mission.optionalObjective.result.timeLimitMissed',
    'elapsed', Math.ceil(state.elapsed), 'limit', objective.limitSeconds);
  },
  preserveMissiles(result, objective, state, final) {
    if (!final) return setResult(result, 'pending', 'mission.optionalObjective.result.missileReserve',
      'remaining', state.missilesRemaining, 'minimum', objective.minimumRemaining);
    const preserved = state.outcome === 'complete' && state.missilesRemaining >= objective.minimumRemaining;
    return setResult(result, preserved ? 'completed' : 'failed',
      state.outcome !== 'complete'
        ? 'mission.optionalObjective.result.sortieIncomplete'
        : preserved
          ? 'mission.optionalObjective.result.missilesPreserved'
          : 'mission.optionalObjective.result.missilesBelowReserve',
    'remaining', state.missilesRemaining, 'minimum', objective.minimumRemaining);
  },
  protectFriendlyGroundUnit(result, objective, state, final) {
    const targets = targetStatus(state, objective.target);
    if (!(targets & TARGET_FOUND)) {
      return final
        ? setResult(result, 'notApplicable', 'mission.optionalObjective.result.targetUnavailable')
        : setResult(result, 'pending', 'mission.optionalObjective.result.waitingForTarget');
    }
    if (targets & TARGET_DESTROYED) return setResult(result, 'failed', 'mission.optionalObjective.result.friendlyTargetLost');
    if (!final) return setResult(result, 'pending', 'mission.optionalObjective.result.friendlyTargetProtected');
    return state.outcome === 'complete'
      ? setResult(result, 'completed', 'mission.optionalObjective.result.friendlyTargetProtected')
      : setResult(result, 'failed', 'mission.optionalObjective.result.sortieIncomplete');
  },
  interceptBeforeZone(result, objective, state, final) {
    const target = selectedTarget(state, objective.target);
    if (!target?.mesh?.position || !state.extractionCenter) {
      return final
        ? setResult(result, 'notApplicable', 'mission.optionalObjective.result.targetUnavailable')
        : setResult(result, 'pending', 'mission.optionalObjective.result.waitingForTarget');
    }
    const dx = target.mesh.position.x - state.extractionCenter.x;
    const dz = target.mesh.position.z - state.extractionCenter.z;
    const reachedZone = dx * dx + dz * dz <= objective.zoneRadius * objective.zoneRadius;
    if (reachedZone) {
      return setResult(result, 'failed', 'mission.optionalObjective.result.zoneReached',
        'target', objective.target.labelKey);
    }
    if (isDestroyed(target)) return setResult(result, 'completed', 'mission.optionalObjective.result.interceptedBeforeZone',
      'target', objective.target.labelKey);
    return final
      ? setResult(result, 'failed', 'mission.optionalObjective.result.targetNotIntercepted',
        'target', objective.target.labelKey)
      : setResult(result, 'pending', 'mission.optionalObjective.result.targetApproachingZone',
        'target', objective.target.labelKey);
  },
};

/** Tracks mission-configured secondary criteria without changing the primary mission outcome. */
export class MissionOptionalObjectives {
  constructor(objectives = []) {
    this.objectives = objectives;
    this.results = objectives.map(objective => ({
      id: objective.id,
      type: objective.type,
      status: 'pending',
      detailKey: 'mission.optionalObjective.result.pending',
      params: {},
    }));
    this.finished = false;
  }

  update(state, final = false) {
    if (this.finished) return this.results;
    for (let index = 0; index < this.objectives.length; index++) {
      const result = this.results[index];
      if (terminalStatuses.has(result.status)) continue;
      const objective = this.objectives[index];
      const evaluate = evaluators[objective.type];
      if (evaluate) evaluate(result, objective, state, final);
      else setResult(result, 'notApplicable', 'mission.optionalObjective.result.unsupported');
    }
    if (final) this.finished = true;
    return this.results;
  }
}
