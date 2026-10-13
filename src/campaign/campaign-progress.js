import { getCampaignDefinition } from './campaigns.js';
import { getDifficultyPreset } from '../combat/difficulty.js';

export const CAMPAIGN_STORAGE_KEY = 'ilmatila-campaign-v1';
const SAVE_VERSION = 1;
const DIFFICULTIES = new Set(['easy', 'standard', 'hard']);

const clampState = value => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
export const CAMPAIGN_STORE_KEYS = ['airMissiles', 'groundMissiles', 'gunRounds', 'flares', 'chaff'];

export function getCampaignStoreCaps(difficulty = 'standard') {
  const preset = getDifficultyPreset(difficulty);
  return {
    airMissiles: preset.player.weapons.airMissiles,
    groundMissiles: preset.player.weapons.groundMissiles,
    gunRounds: preset.player.weapons.gunRounds,
    flares: preset.player.countermeasures,
    chaff: preset.player.chaff.count,
  };
}

export function normalizeCampaignStores(value, difficulty = 'standard') {
  const caps = getCampaignStoreCaps(difficulty);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return Object.fromEntries(CAMPAIGN_STORE_KEYS.map(key => {
    const cap = caps[key];
    if (cap === null) return [key, null];
    const amount = Number(value[key]);
    return [key, Number.isFinite(amount)
      ? Math.max(0, Math.min(cap, Math.round(amount)))
      : cap];
  }));
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)]));
}

export function normalizeCampaignSave(value, expectedDifficulty = null) {
  if (!value || typeof value !== 'object' || value.version !== SAVE_VERSION) return null;
  const definition = getCampaignDefinition(value.campaignId);
  if (!definition || !DIFFICULTIES.has(value.difficulty)) return null;
  if (expectedDifficulty && value.difficulty !== expectedDifficulty) return null;

  const chapterIndex = Math.max(0, Math.min(
    definition.chapters.length,
    Number.isInteger(value.chapterIndex) ? value.chapterIndex : 0,
  ));
  const knownFlags = new Set(definition.chapters.flatMap(chapter => (
    [
      ...Object.values(chapter.effects).flatMap(effect => effect.addFlags ?? []),
      ...Object.values(chapter.optionalObjectiveEffects ?? {})
        .flatMap(outcomes => Object.values(outcomes).flatMap(effect => effect.addFlags ?? [])),
    ]
  )));
  const flags = Array.isArray(value.flags)
    ? [...new Set(value.flags.filter(flag => knownFlags.has(flag)))]
    : [];
  const acceptedAttemptIds = Array.isArray(value.acceptedAttemptIds)
    ? [...new Set(value.acceptedAttemptIds.filter(id => typeof id === 'string' && id.length <= 120))]
    : [];
  const history = Array.isArray(value.history)
    ? value.history.filter(entry => entry && typeof entry === 'object').slice(-definition.chapters.length).map(clone)
    : [];
  const attemptSequence = Number.isInteger(value.attemptSequence) && value.attemptSequence > 0
    ? value.attemptSequence
    : 1;
  const completed = chapterIndex >= definition.chapters.length || Boolean(value.completed);
  const currentChapter = definition.chapters[chapterIndex] ?? null;
  const sustainmentIds = new Set(currentChapter?.sustainmentDecision?.choices?.map(choice => choice.id) ?? []);
  const sustainmentChoice = sustainmentIds.has(value.sustainmentChoice) ? value.sustainmentChoice : null;

  return {
    version: SAVE_VERSION,
    campaignId: definition.id,
    difficulty: value.difficulty,
    chapterIndex,
    airControl: clampState(value.airControl),
    defenseIntegrity: clampState(value.defenseIntegrity),
    sortieReadiness: clampState(value.sortieReadiness),
    flags,
    acceptedAttemptIds,
    history,
    attemptSequence,
    currentAttemptId: typeof value.currentAttemptId === 'string'
      ? value.currentAttemptId
      : `${definition.id}:${value.difficulty}:${attemptSequence}`,
    currentSeed: Number(value.currentSeed) >>> 0,
    retryCount: Number.isInteger(value.retryCount) ? Math.max(0, value.retryCount) : 0,
    chapterRetryCount: Number.isInteger(value.chapterRetryCount) ? Math.max(0, value.chapterRetryCount) : 0,
    completed,
    ending: completed && typeof value.ending === 'string' ? value.ending : null,
    stores: normalizeCampaignStores(value.stores, value.difficulty),
    sustainmentChoice,
  };
}

function emptyProgress() {
  return { version: SAVE_VERSION, saves: {} };
}

function readProgress(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(CAMPAIGN_STORAGE_KEY) ?? 'null');
    if (!parsed || parsed.version !== SAVE_VERSION || !parsed.saves || typeof parsed.saves !== 'object') {
      return emptyProgress();
    }
    const progress = emptyProgress();
    for (const difficulty of DIFFICULTIES) {
      const save = normalizeCampaignSave(parsed.saves[difficulty], difficulty);
      if (save) progress.saves[difficulty] = save;
    }
    return progress;
  } catch {
    return emptyProgress();
  }
}

/** Owns versioned campaign saves, one independent run per difficulty. */
export class CampaignProgress {
  constructor(storage) {
    if (arguments.length > 0) this.storage = storage;
    else {
      try { this.storage = globalThis.localStorage; }
      catch { this.storage = null; }
    }
    this.data = readProgress(this.storage);
  }

  getSave(difficulty) {
    const save = normalizeCampaignSave(this.data.saves[difficulty], difficulty);
    return save ? clone(save) : null;
  }

  saveCampaign(state) {
    const save = normalizeCampaignSave(state);
    if (!save) return false;
    this.data.saves[save.difficulty] = save;
    this.persist();
    return true;
  }

  clear(difficulty) {
    if (!DIFFICULTIES.has(difficulty) || !this.data.saves[difficulty]) return false;
    delete this.data.saves[difficulty];
    this.persist();
    return true;
  }

  persist() {
    try {
      this.storage?.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // The campaign remains playable for the current page session.
    }
  }
}

