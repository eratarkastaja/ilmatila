import { MISSIONS } from './missions.js';

const STORAGE_KEY = 'ilmatila-career-v1';
const VALID_DIFFICULTIES = new Set(['easy', 'standard', 'hard']);
const DEFAULT_UNLOCKS = ['patrol', 'training'];

function emptyState() {
  return {
    version: 1,
    difficulty: 'standard',
    unlockedMissions: [...DEFAULT_UNLOCKS],
    records: {},
  };
}

function nonNegativeFinite(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function readState(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    if (!parsed || parsed.version !== 1) return emptyState();
    const state = emptyState();
    state.difficulty = VALID_DIFFICULTIES.has(parsed.difficulty) ? parsed.difficulty : 'standard';
    const unlocked = Array.isArray(parsed.unlockedMissions) ? parsed.unlockedMissions : [];
    state.unlockedMissions = [...new Set([
      ...DEFAULT_UNLOCKS,
      ...unlocked.filter(id => Object.hasOwn(MISSIONS, id)),
    ])];
    if (parsed.records && typeof parsed.records === 'object') {
      for (const [missionId, byDifficulty] of Object.entries(parsed.records)) {
        if (!Object.hasOwn(MISSIONS, missionId) || !byDifficulty || typeof byDifficulty !== 'object') continue;
        state.records[missionId] = {};
        for (const difficulty of VALID_DIFFICULTIES) {
          const record = byDifficulty[difficulty];
          if (!record || !Number.isFinite(record.score)) continue;
          state.records[missionId][difficulty] = {
            score: Math.max(0, Math.round(record.score)),
            accuracy: Number.isFinite(record.accuracy) ? Math.max(0, Math.min(1, record.accuracy)) : 0,
            damageTaken: Number.isFinite(record.damageTaken) ? Math.max(0, record.damageTaken) : 0,
            missionTime: Number.isFinite(record.missionTime) ? Math.max(0, record.missionTime) : 0,
            completed: Boolean(record.completed),
          };
        }
      }
    }
    return state;
  } catch {
    return emptyState();
  }
}

/** Stores local mission progression and a separate high score per difficulty. */
export class CareerProgress {
  constructor(storage) {
    if (arguments.length > 0) this.storage = storage;
    else {
      try { this.storage = globalThis.localStorage; }
      catch { this.storage = null; }
    }
    this.state = readState(this.storage);
  }

  get difficulty() {
    return this.state.difficulty;
  }

  setDifficulty(id) {
    if (!VALID_DIFFICULTIES.has(id) || id === this.state.difficulty) return false;
    this.state.difficulty = id;
    this.save();
    return true;
  }

  isUnlocked(missionId) {
    return this.state.unlockedMissions.includes(missionId);
  }

  getBest(missionId, difficulty = this.difficulty) {
    return this.state.records[missionId]?.[difficulty] ?? null;
  }

  recordMission(result) {
    const missionId = result?.missionId;
    if (typeof missionId !== 'string' || !Object.hasOwn(MISSIONS, missionId)) {
      return { newRecord: false, unlocked: [] };
    }
    const mission = MISSIONS[missionId];
    const difficulty = VALID_DIFFICULTIES.has(result.difficulty) ? result.difficulty : this.difficulty;
    const entry = {
      score: Math.round(nonNegativeFinite(result.score)),
      accuracy: Math.min(1, nonNegativeFinite(result.accuracy)),
      damageTaken: nonNegativeFinite(result.damageTaken),
      missionTime: nonNegativeFinite(result.missionTime),
      completed: result.outcome === 'complete',
    };
    const previous = this.getBest(mission.id, difficulty);
    const newRecord = !previous
      || entry.score > previous.score
      || (entry.score === previous.score && entry.completed && !previous.completed)
      || (entry.score === previous.score && entry.completed === previous.completed && entry.accuracy > previous.accuracy)
      || (entry.score === previous.score && entry.completed === previous.completed && entry.accuracy === previous.accuracy && entry.damageTaken < previous.damageTaken)
      || (entry.score === previous.score && entry.completed === previous.completed && entry.accuracy === previous.accuracy && entry.damageTaken === previous.damageTaken && entry.missionTime < previous.missionTime);
    if (newRecord) {
      this.state.records[mission.id] ??= {};
      this.state.records[mission.id][difficulty] = entry;
    }

    const unlocked = [];
    if (entry.completed) {
      for (const id of mission.unlocks ?? []) {
        if (!this.isUnlocked(id)) {
          this.state.unlockedMissions.push(id);
          unlocked.push(id);
        }
      }
    }
    if (newRecord || unlocked.length) this.save();
    return { newRecord, record: this.getBest(mission.id, difficulty), unlocked };
  }

  save() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // The sortie remains playable if browser storage is unavailable or full.
    }
  }
}
