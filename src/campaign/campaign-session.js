import { createSortieSeed } from '../combat/random.js';
import { getCampaignStoreCaps, normalizeCampaignStores } from './campaign-progress.js';
import { getCampaignDefinition } from './campaigns.js';
import { resolveCampaignMission } from './resolve-campaign-mission.js';

const STATE_KEYS = ['airControl', 'defenseIntegrity', 'sortieReadiness'];
const STORE_KEYS = ['airMissiles', 'groundMissiles', 'gunRounds', 'flares', 'chaff'];
const clamp = value => Math.max(0, Math.min(100, value));

function restoreStores(stores, restore, difficulty) {
  const caps = getCampaignStoreCaps(difficulty);
  const next = { ...stores };
  for (const key of STORE_KEYS) {
    if (caps[key] === null) {
      next[key] = null;
      continue;
    }
    const amount = Number(next[key]);
    const addition = Number(restore?.[key] ?? 0);
    next[key] = Math.max(0, Math.min(caps[key], (Number.isFinite(amount) ? amount : caps[key]) + addition));
  }
  return next;
}

function createAttemptId(definition, difficulty, sequence) {
  return `${definition.id}:${difficulty}:${sequence}`;
}

function createState(definition, difficulty, seedFactory) {
  const attemptSequence = 1;
  return {
    version: 1,
    campaignId: definition.id,
    difficulty,
    chapterIndex: 0,
    ...definition.initialState,
    flags: [...definition.initialState.flags],
    acceptedAttemptIds: [],
    history: [],
    attemptSequence,
    currentAttemptId: createAttemptId(definition, difficulty, attemptSequence),
    currentSeed: Number(seedFactory()) >>> 0,
    retryCount: 0,
    chapterRetryCount: 0,
    completed: false,
    ending: null,
    stores: null,
    sustainmentChoice: null,
  };
}

function classifyResult(chapter, outcome, result) {
  if (outcome === 'complete') {
    const decisive = result?.optionalObjectives?.some(objective => (
      objective.id === chapter.decisiveObjectiveId && objective.status === 'completed'
    ));
    return decisive ? 'decisive' : 'success';
  }
  if (outcome === 'setback' || (outcome === 'failed' && result?.playerRecovered === true)) return 'setback';
  return null;
}

function applyEffects(state, effects) {
  const next = { ...state, flags: [...state.flags] };
  const changes = {};
  for (const key of STATE_KEYS) {
    const before = state[key];
    const after = clamp(before + (effects?.[key] ?? 0));
    next[key] = after;
    changes[key] = after - before;
  }
  for (const flag of effects?.addFlags ?? []) {
    if (!next.flags.includes(flag)) next.flags.push(flag);
  }
  return { next, changes };
}

function applyOptionalObjectiveEffects(state, chapter, objectives = []) {
  let next = state;
  const changes = Object.fromEntries(STATE_KEYS.map(key => [key, 0]));
  const applied = [];
  for (const result of objectives) {
    const objectiveEffects = chapter.optionalObjectiveEffects?.[result?.id];
    const effect = objectiveEffects?.[result?.status];
    if (!effect) continue;
    const outcome = applyEffects(next, effect);
    next = outcome.next;
    for (const key of STATE_KEYS) changes[key] += outcome.changes[key];
    applied.push({
      id: result.id,
      ...(result.type ? { type: result.type } : {}),
      status: result.status,
      changes: outcome.changes,
    });
  }
  return { next, changes, applied };
}

/** Owns one campaign run and commits accepted sortie results exactly once. */
export class CampaignSession {
  constructor({
    progress,
    difficulty = 'standard',
    campaignId = 'shadow-border',
    seedFactory = createSortieSeed,
  }) {
    this.definition = getCampaignDefinition(campaignId);
    if (!this.definition) throw new Error(`Unknown campaign: ${campaignId}`);
    this.progress = progress;
    this.seedFactory = seedFactory;
    this.state = progress?.getSave(difficulty) ?? createState(this.definition, difficulty, seedFactory);
    this.progress?.saveCampaign(this.state);
  }

  get difficulty() { return this.state.difficulty; }
  get currentChapter() { return this.definition.chapters[this.state.chapterIndex] ?? null; }
  get completed() { return this.state.completed; }
  get currentSustainmentDecision() { return this.currentChapter?.sustainmentDecision ?? null; }
  get selectedSustainmentChoice() {
    const choices = this.currentSustainmentDecision?.choices ?? [];
    return choices.find(choice => choice.id === this.state.sustainmentChoice) ?? null;
  }

  getCurrentStores() {
    const caps = getCampaignStoreCaps(this.difficulty);
    return normalizeCampaignStores(this.state.stores ?? caps, this.difficulty) ?? caps;
  }

  selectSustainmentChoice(choiceId) {
    if (choiceId !== null && typeof choiceId !== 'string') return false;
    const choices = this.currentSustainmentDecision?.choices ?? [];
    const choice = choices.find(item => item.id === choiceId);
    if (choiceId !== null && (!choice || this.state.sortieReadiness < choice.readinessCost)) return false;
    this.state = { ...this.state, sustainmentChoice: choiceId };
    if (!this.developmentSelection) this.progress?.saveCampaign(this.state);
    return true;
  }

  /** Selects a chapter for the development campaign selector without saving the jump. */
  selectDevelopmentChapter(chapterIndex) {
    if (!Number.isInteger(chapterIndex) || chapterIndex < 0 || chapterIndex >= this.definition.chapters.length) {
      return false;
    }
    const attemptSequence = this.state.attemptSequence + 1;
    this.state = {
      ...this.state,
      chapterIndex,
      attemptSequence,
      currentAttemptId: createAttemptId(this.definition, this.difficulty, attemptSequence),
      currentSeed: Number(this.seedFactory()) >>> 0,
      chapterRetryCount: 0,
      completed: false,
      ending: null,
      sustainmentChoice: null,
    };
    this.developmentSelection = true;
    return true;
  }

  snapshot() {
    return structuredClone(this.state);
  }

  resolveCurrentMission() {
    const resolved = resolveCampaignMission(this.definition, this.state);
    if (!resolved) return null;
    const choice = this.selectedSustainmentChoice;
    const stores = choice
      ? restoreStores(this.getCurrentStores(), choice.restore, this.difficulty)
      : this.getCurrentStores();
    resolved.mission.campaignStores = stores;
    resolved.mission.campaignSustainmentChoice = choice?.id ?? null;
    resolved.stores = stores;
    return resolved;
  }

  previewResult(outcome, result = {}) {
    const chapter = this.currentChapter;
    if (!chapter) return { canAccept: false, classification: null, changes: {} };
    const classification = classifyResult(chapter, outcome, result);
    if (!classification) return { canAccept: false, classification: null, changes: {} };
    const base = applyEffects(this.state, chapter.effects[classification]);
    const optional = applyOptionalObjectiveEffects(base.next, chapter, result.optionalObjectives);
    const next = optional.next;
    const changes = Object.fromEntries(STATE_KEYS.map(key => [
      key,
      base.changes[key] + optional.changes[key],
    ]));
    const choice = this.selectedSustainmentChoice;
    if (choice?.readinessCost) {
      const before = next.sortieReadiness;
      next.sortieReadiness = clamp(before - choice.readinessCost);
      changes.sortieReadiness += next.sortieReadiness - before;
    }
    return {
      canAccept: true,
      classification,
      changes,
      optionalObjectiveChanges: optional.applied,
      nextState: next,
      sustainmentChoice: choice?.id ?? null,
    };
  }

  acceptResult(outcome, result = {}) {
    const attemptId = result.campaignAttemptId ?? this.state.currentAttemptId;
    if (attemptId !== this.state.currentAttemptId || this.state.acceptedAttemptIds.includes(attemptId)) {
      return { applied: false, reason: 'stale-or-duplicate' };
    }
    const preview = this.previewResult(outcome, result);
    if (!preview.canAccept) return { applied: false, reason: 'result-not-committable' };

    const chapter = this.currentChapter;
    const state = preview.nextState;
    state.acceptedAttemptIds = [...state.acceptedAttemptIds, attemptId];
    state.history = [...state.history, {
      chapterId: chapter.id,
      attemptId,
      classification: preview.classification,
      outcome,
      changes: preview.changes,
      optionalObjectives: Array.isArray(result.optionalObjectives)
        ? result.optionalObjectives.map(objective => ({ ...objective }))
        : [],
      sustainmentChoice: preview.sustainmentChoice,
      stores: result.remainingStores ? normalizeCampaignStores(result.remainingStores, state.difficulty) : state.stores,
      score: Number.isFinite(result.score) ? Math.max(0, Math.round(result.score)) : 0,
    }];
    if (result.remainingStores) state.stores = normalizeCampaignStores(result.remainingStores, state.difficulty);
    state.sustainmentChoice = null;
    state.chapterIndex += 1;
    state.chapterRetryCount = 0;
    if (state.chapterIndex >= this.definition.chapters.length) {
      state.completed = true;
      state.ending = preview.classification === 'setback'
        ? 'unresolved-front'
        : state.defenseIntegrity >= 60 ? 'border-secured' : 'invasion-contained';
    } else {
      state.attemptSequence += 1;
      state.currentAttemptId = createAttemptId(this.definition, state.difficulty, state.attemptSequence);
      state.currentSeed = Number(this.seedFactory()) >>> 0;
    }
    this.state = state;
    this.progress?.saveCampaign(this.state);
    return { applied: true, preview, completed: state.completed, ending: state.ending };
  }

  retryCurrent() {
    if (this.state.completed) return false;
    this.state = {
      ...this.state,
      attemptSequence: this.state.attemptSequence + 1,
      retryCount: this.state.retryCount + 1,
      chapterRetryCount: this.state.chapterRetryCount + 1,
    };
    this.state.currentAttemptId = createAttemptId(
      this.definition,
      this.state.difficulty,
      this.state.attemptSequence,
    );
    this.progress?.saveCampaign(this.state);
    return true;
  }
}

