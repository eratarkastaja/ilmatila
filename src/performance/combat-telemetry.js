const COUNTED_MISSILE_TEAMS = new Set(['player', 'wingman', 'hostile']);
const COUNTED_COUNTERMEASURE_TEAMS = new Set(['player', 'hostile']);

function increment(counts, key) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function incrementNested(counts, group, key) {
  counts[group] ??= {};
  increment(counts[group], key);
}

function incrementAttemptTable(table, type, team, target) {
  table[type] ??= {};
  table[type][team] ??= {};
  increment(table[type][team], target);
}

function copyTable(table) {
  return Object.fromEntries(Object.entries(table).map(([key, value]) => [key, { ...value }]));
}

function copyAttemptTable(table) {
  return Object.fromEntries(Object.entries(table).map(([type, teams]) => [
    type,
    Object.fromEntries(Object.entries(teams).map(([team, targets]) => [team, { ...targets }])),
  ]));
}

/** Event counters exposed by the development stress scenario, never a frame-loop sampler. */
export class CombatTelemetry {
  constructor({ difficulty = 'unknown' } = {}) {
    this.difficulty = typeof difficulty === 'string' ? difficulty : difficulty?.id ?? 'unknown';
    this.missiles = { total: 0, byTeam: {}, bySeeker: {} };
    this.countermeasures = {
      uses: {},
      attempts: {},
      successes: {},
    };
    this.playerDamage = { total: 0, bySource: {} };
  }

  recordMissileLaunch(team, seeker) {
    if (!COUNTED_MISSILE_TEAMS.has(team)) return;
    const seekerType = seeker || 'unknown';
    this.missiles.total++;
    incrementNested(this.missiles.byTeam, team, seekerType);
    increment(this.missiles.bySeeker, seekerType);
  }

  recordCountermeasureUse(team, type) {
    if (!COUNTED_COUNTERMEASURE_TEAMS.has(team)) return;
    this.countermeasures.uses[team] ??= {};
    increment(this.countermeasures.uses[team], type);
  }

  recordCountermeasureAttempt(team, type, target) {
    if (!COUNTED_COUNTERMEASURE_TEAMS.has(team)) return;
    incrementAttemptTable(this.countermeasures.attempts, type, team, target);
  }

  recordCountermeasureSuccess(team, type, target) {
    if (!COUNTED_COUNTERMEASURE_TEAMS.has(team)) return;
    incrementAttemptTable(this.countermeasures.successes, type, team, target);
  }

  recordPlayerDamage(source, amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.playerDamage.total += amount;
    const sourceType = source || 'unknown';
    this.playerDamage.bySource[sourceType] = (this.playerDamage.bySource[sourceType] ?? 0) + amount;
  }

  snapshot() {
    return {
      difficulty: this.difficulty,
      missileLaunches: {
        total: this.missiles.total,
        byTeam: copyTable(this.missiles.byTeam),
        bySeeker: { ...this.missiles.bySeeker },
      },
      countermeasures: {
        uses: copyTable(this.countermeasures.uses),
        attempts: copyAttemptTable(this.countermeasures.attempts),
        successes: copyAttemptTable(this.countermeasures.successes),
      },
      playerDamage: {
        total: this.playerDamage.total,
        bySource: { ...this.playerDamage.bySource },
      },
    };
  }
}
