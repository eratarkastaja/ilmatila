const terminalStatuses = new Set(['completed', 'failed', 'notApplicable']);

function isDestroyed(unit) {
  return !unit || unit.dead === true || (Number.isFinite(unit.hp) && unit.hp <= 0);
}

const TARGET_FOUND = 1;
const TARGET_DESTROYED = 2;

function isCommittableOutcome(state) {
  return state.outcome === 'complete' || state.outcome === 'setback';
}

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
  const authoredRole = unit.authoredRole ?? unit.role;
  if (selector.role && authoredRole !== selector.role) return false;
  if (selector.team && unit.team !== selector.team) return false;
  if (selector.armed !== undefined && unit.armed !== selector.armed) return false;
  if (selector.radioId && unit.radioId !== selector.radioId) return false;
  if (selector.platform && unit.platform !== selector.platform) return false;
  if (selector.reinforcementSource !== undefined
    && unit.reinforcementSource !== selector.reinforcementSource) return false;
  return true;
}

function selectTargets(state, selector) {
  const collection = state[selector?.collection];
  if (!Array.isArray(collection)) return [];
  const matches = collection.filter(unit => matchesSelector(unit, selector ?? {}));
  if (selector?.index === undefined) return matches;
  return matches[selector.index] ? [matches[selector.index]] : [];
}

/** Returns bit flags for whether a selector matched and whether a match was destroyed. */
function targetStatus(state, selector) {
  const targets = selectTargets(state, selector);
  if (targets.length === 0) return 0;
  let status = TARGET_FOUND;
  if (targets.some(isDestroyed)) status |= TARGET_DESTROYED;
  return status;
}

function selectedTarget(state, selector) {
  return selectTargets(state, selector)[0] ?? null;
}

function snapshotTargets(state, selector, final, runtime) {
  if (runtime.targets === null) {
    const targets = selectTargets(state, selector);
    const ready = state.targetCollectionsReady?.[selector?.collection] ?? true;
    if (targets.length === 0 && !final && !ready) return null;
    runtime.targets = targets;
  }
  return runtime.targets;
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
    return setResult(result, isCommittableOutcome(state) ? 'completed' : 'failed',
      isCommittableOutcome(state)
        ? 'mission.optionalObjective.result.wingmenReturned'
        : 'mission.optionalObjective.result.sortieIncomplete',
      'returned', state.wingmenReturned, 'total', state.wingmenTotal);
  },
  allWingmenReturned(result, _objective, state, final) {
    if (state.wingmenTotal === 0) return setResult(result, 'notApplicable', 'mission.optionalObjective.result.noWingmen');
    if (state.wingmenAtBase < state.wingmenTotal) {
      return final
        ? setResult(result, 'failed', 'mission.optionalObjective.result.wingmenNotHome',
          'returned', state.wingmenAtBase, 'total', state.wingmenTotal)
        : setResult(result, 'pending', 'mission.optionalObjective.result.wingmenHeadingHome',
          'returned', state.wingmenAtBase, 'total', state.wingmenTotal);
    }
    return setResult(result, 'completed', 'mission.optionalObjective.result.wingmenHome',
      'returned', state.wingmenAtBase, 'total', state.wingmenTotal);
  },
  noDamage(result, _objective, state, final) {
    if (state.damageTaken > 0) {
      return setResult(result, 'failed', 'mission.optionalObjective.result.damageTaken',
        'damage', Math.round(state.damageTaken));
    }
    if (!final) return setResult(result, 'pending', 'mission.optionalObjective.result.noDamageYet');
    return setResult(result, isCommittableOutcome(state) ? 'completed' : 'failed',
      isCommittableOutcome(state)
        ? 'mission.optionalObjective.result.noDamageTaken'
        : 'mission.optionalObjective.result.sortieIncomplete');
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
    const preserved = isCommittableOutcome(state) && state.missilesRemaining >= objective.minimumRemaining;
    return setResult(result, preserved ? 'completed' : 'failed',
      preserved
        ? 'mission.optionalObjective.result.missilesPreserved'
        : isCommittableOutcome(state)
          ? 'mission.optionalObjective.result.missilesBelowReserve'
          : 'mission.optionalObjective.result.sortieIncomplete',
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
    return setResult(result, isCommittableOutcome(state) ? 'completed' : 'failed',
      isCommittableOutcome(state)
        ? 'mission.optionalObjective.result.friendlyTargetProtected'
        : 'mission.optionalObjective.result.sortieIncomplete');
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
  destroyTargets(result, objective, state, final, runtime) {
    const targets = snapshotTargets(state, objective.target, final, runtime);
    if (targets === null) return setResult(result, 'pending', 'mission.optionalObjective.result.waitingForTarget');
    const total = targets.length;
    const destroyed = targets.filter(isDestroyed).length;
    const required = Math.max(0, objective.required ?? 0);
    const remaining = Math.max(0, required - destroyed);
    if (total === 0) {
      return final
        ? setResult(result, 'notApplicable', 'mission.optionalObjective.result.targetUnavailable')
        : setResult(result, 'pending', 'mission.optionalObjective.result.waitingForTarget');
    }
    if (destroyed >= required) {
      return setResult(result, 'completed', 'mission.optionalObjective.result.targetsDestroyed',
        'destroyed', destroyed, 'required', required);
    }
    if (total - destroyed < remaining) {
      return setResult(result, 'failed', 'mission.optionalObjective.result.targetsImpossible',
        'destroyed', destroyed, 'required', required);
    }
    return setResult(result, final ? 'failed' : 'pending',
      final ? 'mission.optionalObjective.result.targetsNotDestroyed' : 'mission.optionalObjective.result.targetsProgress',
      'destroyed', destroyed, 'required', required);
  },
  preserveForce(result, objective, state, final, runtime) {
    const targets = snapshotTargets(state, objective.target, final, runtime);
    if (targets === null) return setResult(result, 'pending', 'mission.optionalObjective.result.waitingForTarget');
    const total = targets.length;
    const alive = targets.filter(target => !isDestroyed(target)).length;
    const minimumAlive = objective.minimumAlive ?? 0;
    const minimumFraction = objective.minimumFraction ?? 0;
    const fraction = total > 0 ? alive / total : 0;
    const meetsAlive = alive >= minimumAlive;
    const meetsFraction = fraction >= minimumFraction;
    if (total === 0) {
      return final
        ? setResult(result, 'notApplicable', 'mission.optionalObjective.result.targetUnavailable')
        : setResult(result, 'pending', 'mission.optionalObjective.result.waitingForTarget');
    }
    if (!meetsAlive || !meetsFraction) {
      return setResult(result, 'failed', 'mission.optionalObjective.result.forceBelowThreshold',
        'alive', alive, 'total', total);
    }
    if (!final) return setResult(result, 'pending', 'mission.optionalObjective.result.forceProgress',
      'alive', alive, 'total', total);
    return setResult(result, isCommittableOutcome(state) ? 'completed' : 'failed',
      isCommittableOutcome(state)
        ? 'mission.optionalObjective.result.forcePreserved'
        : 'mission.optionalObjective.result.sortieIncomplete',
      'alive', alive, 'total', total);
  },
  denyZone(result, objective, state, final, runtime) {
    const targets = snapshotTargets(state, objective.target, final, runtime);
    if (targets === null) return setResult(result, 'pending', 'mission.optionalObjective.result.waitingForTarget');
    const center = resolveZoneCenter(state, objective.zone?.center);
    const radius = objective.zone?.radius ?? 0;
    if (targets.length === 0 || !center || !(radius > 0)) {
      return final
        ? setResult(result, 'notApplicable', 'mission.optionalObjective.result.targetUnavailable')
        : setResult(result, 'pending', 'mission.optionalObjective.result.waitingForTarget');
    }
    runtime.penetrated ??= new Set();
    for (const target of targets) {
      const position = target?.mesh?.position;
      if (!position) continue;
      const dx = position.x - center.x;
      const dz = position.z - center.z;
      if (dx * dx + dz * dz <= radius * radius) runtime.penetrated.add(target);
    }
    const penetrations = runtime.penetrated.size;
    const maximum = Math.max(0, objective.maximumPenetrations ?? 0);
    if (penetrations > maximum) {
      return setResult(result, 'failed', 'mission.optionalObjective.result.zonePenetrated',
        'penetrations', penetrations, 'maximum', maximum);
    }
    if (!final) return setResult(result, 'pending', 'mission.optionalObjective.result.zoneClear',
      'penetrations', penetrations, 'maximum', maximum);
    return setResult(result, isCommittableOutcome(state) ? 'completed' : 'failed',
      isCommittableOutcome(state)
        ? 'mission.optionalObjective.result.zoneClear'
        : 'mission.optionalObjective.result.sortieIncomplete',
      'penetrations', penetrations, 'maximum', maximum);
  },
};

function resolveZoneCenter(state, center) {
  if (center && typeof center === 'object') return center;
  if (center === 'protectedAsset') return state.protectedAssetCenter ?? state.extractionCenter;
  if (center === 'extraction') return state.extractionCenter;
  if (typeof center === 'string') return state[center] ?? state[`${center}Center`] ?? null;
  return null;
}

/** Tracks mission-configured secondary criteria without changing the primary mission outcome. */
export class MissionOptionalObjectives {
  constructor(objectives = []) {
    this.objectives = objectives;
    this.results = objectives.map(objective => ({
      id: objective.id,
      type: objective.type,
      ...(objective.titleKey ? { titleKey: objective.titleKey } : {}),
      status: 'pending',
      detailKey: 'mission.optionalObjective.result.pending',
      params: {},
    }));
    this.runtime = objectives.map(() => ({ targets: null, penetrated: null }));
    this.finished = false;
  }

  update(state, final = false) {
    if (this.finished) return this.results;
    for (let index = 0; index < this.objectives.length; index++) {
      const result = this.results[index];
      if (terminalStatuses.has(result.status)) continue;
      const objective = this.objectives[index];
      const evaluate = evaluators[objective.type];
      if (evaluate) evaluate(result, objective, state, final, this.runtime[index]);
      else setResult(result, 'notApplicable', 'mission.optionalObjective.result.unsupported');
    }
    if (final) this.finished = true;
    return this.results;
  }
}
