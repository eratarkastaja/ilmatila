/** Runs authored, seed-resolved encounter events when their sortie conditions are met. */
export class EncounterDirector {
  constructor(encounters = [], { onWarning, onExecute } = {}) {
    this.onWarning = onWarning;
    this.onExecute = onExecute;
    this.events = encounters.map(encounter => ({
      ...encounter,
      status: encounter.scheduled ? 'waiting' : 'unscheduled',
      remainingDelay: encounter.delaySeconds,
    }));
  }

  update(dt, context) {
    const delta = Math.max(0, Number.isFinite(dt) ? dt : 0);
    for (const event of this.events) {
      if (event.status === 'waiting') {
        if (this.shouldCancel(event, context)) {
          event.status = 'cancelled';
          continue;
        }
        if (!this.matchesTrigger(event.trigger, context)) continue;
        event.status = 'warning';
        event.remainingDelay = event.delaySeconds;
        this.onWarning?.(event);
        continue;
      }
      if (event.status !== 'warning') continue;
      if (context.complicationActive) continue;
      event.remainingDelay = Math.max(0, event.remainingDelay - delta);
      if (event.remainingDelay > 0) continue;
      event.status = 'completed';
      if (this.onExecute?.(event.response, event) === false) event.status = 'cancelled';
    }
  }

  matchesTrigger(trigger, context) {
    if (context.complicationActive) return false;
    if (trigger.objectiveActive && !context.objectiveActive) return false;
    if (trigger.playerCombatCapable && !context.playerCombatCapable) return false;
    if (context.primaryGroupRemaining > trigger.primaryGroupRemainingAtMost) return false;
    if (trigger.primaryGroundRemainingAtLeast !== undefined
      && context.primaryGroundRemaining < trigger.primaryGroundRemainingAtLeast) return false;
    if (trigger.reinforcementLogisticsRemainingAtLeast !== undefined
      && (context.reinforcementLogisticsRemaining ?? 0) < trigger.reinforcementLogisticsRemainingAtLeast) return false;
    return true;
  }

  shouldCancel(event, context) {
    if (event.trigger.playerCombatCapable && !context.playerCombatCapable) return true;
    if (event.trigger.primaryGroundRemainingAtLeast !== undefined
      && context.primaryGroundRemaining < event.trigger.primaryGroundRemainingAtLeast) return true;
    return event.trigger.reinforcementLogisticsRemainingAtLeast !== undefined
      && (context.reinforcementLogisticsRemaining ?? 0) < event.trigger.reinforcementLogisticsRemainingAtLeast;
  }

  getPendingHostileCount() {
    let count = 0;
    for (const event of this.events) {
      if (event.status === 'waiting' || event.status === 'warning') count += event.response?.hostiles ?? 0;
    }
    return count;
  }

  hasActiveWarning() {
    for (const event of this.events) {
      if (event.status === 'warning') return true;
    }
    return false;
  }

  getPlannedHostileCount() {
    let count = 0;
    for (const event of this.events) {
      if (event.scheduled && event.status !== 'cancelled') count += event.response?.hostiles ?? 0;
    }
    return count;
  }

  dispose() {
    this.events.length = 0;
    this.onWarning = null;
    this.onExecute = null;
  }
}
