import { createSortieSeed } from '../combat/random.js';
import { getCampaignStoreCaps, normalizeCampaignStores } from './campaign-progress.js';
import { getCampaignDefinition } from './campaigns.js';
import { resolveCampaignMission } from './resolve-campaign-mission.js';
import { getKitLimits, getRecommendedKit, validateKit } from './campaign-kit.js';

const STATE_KEYS = ['airControl', 'defenseIntegrity', 'sortieReadiness'];
const STORE_KEYS = ['airMissiles', 'groundMissiles', 'gunRounds', 'flares', 'chaff', 'fuelMinutes'];
const clamp = value => Math.max(0, Math.min(100, value));
export const CAMPAIGN_RETRY_READINESS_COST = 3;

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

function resupplyStoresForNextSortie(stores, difficulty) {
  const caps = getCampaignStoreCaps(difficulty);
  const next = { ...stores };
  for (const key of STORE_KEYS) {
    if (caps[key] === null) {
      next[key] = null;
      continue;
    }
    next[key] = caps[key];
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
    sustainmentUsed: false,
    kitSelection: null,
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

function applyOptionalObjectiveEffects(state, chapter, objectives = [], sustainmentChoice = null) {
  let next = state;
  const changes = Object.fromEntries(STATE_KEYS.map(key => [key, 0]));
  const applied = [];
  for (const result of objectives) {
    const objectiveEffects = chapter.optionalObjectiveEffects?.[result?.id]
      ?? (result?.id === sustainmentChoice?.optionalObjective?.id
        || result?.id === sustainmentChoice?.optionalObjectiveByChapter?.[chapter.id]?.id
        ? sustainmentChoice.optionalObjectiveEffects
        : null);
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
    this.selectionSnapshot = null;
    this.developmentSelection = false;
    this.replaySelection = false;
    this.progress?.saveCampaign(this.state);
  }

  get difficulty() { return this.state.difficulty; }
  get currentChapter() { return this.definition.chapters[this.state.chapterIndex] ?? null; }
  get completed() { return this.state.completed; }
  get progressChapterIndex() { return this.selectionSnapshot?.chapterIndex ?? this.state.chapterIndex; }
  get isReplay() { return this.replaySelection; }
  isChapterCompleted(chapterIndex) {
    if (!Number.isInteger(chapterIndex) || chapterIndex < 0 || chapterIndex >= this.progressChapterIndex) return false;
    const chapterId = this.definition.chapters[chapterIndex]?.id;
    return (this.selectionSnapshot?.history ?? this.state.history ?? []).some(entry => (
      entry.chapterId === chapterId && ['success', 'decisive'].includes(entry.classification)
    ));
  }
  get currentSustainmentDecision() { return this.currentChapter?.sustainmentDecision ?? null; }
  get selectedSustainmentChoice() {
    const choices = this.currentSustainmentDecision?.choices ?? [];
    return choices.find(choice => choice.id === this.state.sustainmentChoice) ?? null;
  }
  get retryReadinessCost() {
    return CAMPAIGN_RETRY_READINESS_COST + (this.selectedSustainmentChoice?.readinessCost ?? 0);
  }

  getCurrentStores() {
    const caps = getCampaignStoreCaps(this.difficulty);
    return normalizeCampaignStores(this.state.stores ?? caps, this.difficulty) ?? caps;
  }

  getStoresAfterChoice(choiceId = null) {
    if (!choiceId) return this.getCurrentStores();
    const choice = this.currentSustainmentDecision?.choices?.find(item => item.id === choiceId);
    return choice ? restoreStores(this.getCurrentStores(), choice.restore, this.difficulty) : this.getCurrentStores();
  }

  getKitState() {
    const choice = this.selectedSustainmentChoice;
    const inventory = this.getStoresAfterChoice(choice?.id);
    const mission = resolveCampaignMission(this.definition, this.state)?.mission ?? {};
    const recommended = getRecommendedKit(inventory, mission);
    const limits = getKitLimits(this.difficulty, mission);
    const selected = this.state.kitSelection && validateKit(this.state.kitSelection, inventory, limits)
      ? { ...recommended, ...this.state.kitSelection }
      : recommended;
    return { inventory, recommended, selected, limits };
  }

  selectKit(kit) {
    if (!kit || typeof kit !== 'object') return false;
    const { inventory, limits } = this.getKitState();
    if (!validateKit(kit, inventory, limits)) return false;
    this.state = { ...this.state, kitSelection: { ...kit } };
    if (!this.selectionSnapshot) this.progress?.saveCampaign(this.state);
    return true;
  }

  selectSustainmentChoice(choiceId) {
    if (choiceId !== null && typeof choiceId !== 'string') return false;
    if (choiceId !== null && this.state.sustainmentUsed) return false;
    const choices = this.currentSustainmentDecision?.choices ?? [];
    const choice = choices.find(item => item.id === choiceId);
    if (choiceId !== null && (!choice || this.state.sortieReadiness < choice.readinessCost)) return false;
    this.state = { ...this.state, sustainmentChoice: choiceId };
    if (!this.selectionSnapshot) this.progress?.saveCampaign(this.state);
    return true;
  }

  selectChapter(chapterIndex, selectionType) {
    if (!Number.isInteger(chapterIndex) || chapterIndex < 0 || chapterIndex >= this.definition.chapters.length) {
      return false;
    }
    const progressChapterIndex = this.progressChapterIndex;
    if (selectionType === 'replay' && chapterIndex >= progressChapterIndex) return false;
    if (this.selectionSnapshot) this.exitChapterSelection();
    const snapshot = structuredClone(this.state);
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
      sustainmentUsed: false,
      kitSelection: null,
    };
    this.selectionSnapshot = snapshot;
    this.developmentSelection = selectionType === 'development';
    this.replaySelection = selectionType === 'replay';
    return true;
  }

  /** Selects a chapter for the development campaign selector without saving the jump. */
  selectDevelopmentChapter(chapterIndex) {
    return this.selectChapter(chapterIndex, 'development');
  }

  /** Selects an already accepted chapter for a production-mode replay. */
  selectCompletedChapter(chapterIndex) {
    if (!this.isChapterCompleted(chapterIndex)) return false;
    return this.selectChapter(chapterIndex, 'replay');
  }

  /** Restores the saved campaign position after a temporary chapter selection. */
  exitChapterSelection() {
    if (!this.selectionSnapshot) return false;
    this.state = this.selectionSnapshot;
    this.selectionSnapshot = null;
    this.developmentSelection = false;
    this.replaySelection = false;
    return true;
  }

  snapshot() {
    return structuredClone(this.state);
  }

  resolveCurrentMission() {
    const resolved = resolveCampaignMission(this.definition, this.state);
    if (!resolved) return null;
    const choice = this.selectedSustainmentChoice;
    const kit = this.getKitState();
    const stores = kit.selected;
    resolved.mission.campaignStores = stores;
    resolved.mission.campaignSustainmentChoice = choice?.id ?? null;
    resolved.mission.campaignKit = kit.selected;
    resolved.stores = stores;
    return resolved;
  }

  previewResult(outcome, result = {}) {
    const chapter = this.currentChapter;
    if (!chapter) return {
      canAccept: false,
      classification: null,
      changes: {},
      retryReadinessCost: this.retryReadinessCost,
    };
    const classification = classifyResult(chapter, outcome, result);
    if (!classification) return {
      canAccept: false,
      classification: null,
      changes: {},
      retryReadinessCost: this.retryReadinessCost,
    };
    const base = applyEffects(this.state, chapter.effects[classification]);
    const choice = this.selectedSustainmentChoice;
    const optional = applyOptionalObjectiveEffects(base.next, chapter, result.optionalObjectives, choice);
    const next = optional.next;
    const changes = Object.fromEntries(STATE_KEYS.map(key => [
      key,
      base.changes[key] + optional.changes[key],
    ]));
    if (choice?.readinessCost) {
      const before = next.sortieReadiness;
      next.sortieReadiness = clamp(before - choice.readinessCost);
      changes.sortieReadiness += next.sortieReadiness - before;
    }
    return {
      canAccept: true,
      classification,
      narrativeKey: `campaign.debrief.narrative.${classification}`,
      changes,
      optionalObjectiveChanges: optional.applied,
      nextState: next,
      sustainmentChoice: choice?.id ?? null,
      retryReadinessCost: this.retryReadinessCost,
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
      wingmen: Number.isFinite(result.wingmenSurvived) || Number.isFinite(result.wingmenTotal)
        ? { survived: result.wingmenSurvived ?? 0, total: result.wingmenTotal ?? 0 }
        : null,
      stores: result.remainingStores ? normalizeCampaignStores(result.remainingStores, state.difficulty) : state.stores,
      score: Number.isFinite(result.score) ? Math.max(0, Math.round(result.score)) : 0,
    }];
    if (result.remainingStores) {
      const remainingStores = normalizeCampaignStores(result.remainingStores, state.difficulty);
      state.stores = resupplyStoresForNextSortie(remainingStores, state.difficulty);
    }
    state.sustainmentChoice = null;
    state.sustainmentUsed = false;
    state.kitSelection = null;
    state.chapterIndex += 1;
    state.chapterRetryCount = 0;
    if (state.chapterIndex >= this.definition.chapters.length) {
      state.completed = true;
      state.ending = preview.classification === 'setback'
        ? 'unresolved-front'
        : state.defenseIntegrity >= 60
          && state.flags.includes('border-line-stabilized')
          && state.flags.includes('local-air-defense-breached')
          ? 'border-secured'
          : 'invasion-contained';
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
    const sustainmentChoice = this.selectedSustainmentChoice;
    const retryReadinessCost = this.retryReadinessCost;
    this.state = {
      ...this.state,
      sortieReadiness: clamp(this.state.sortieReadiness - retryReadinessCost),
      attemptSequence: this.state.attemptSequence + 1,
      retryCount: this.state.retryCount + 1,
      chapterRetryCount: this.state.chapterRetryCount + 1,
      sustainmentChoice: null,
      sustainmentUsed: Boolean(sustainmentChoice),
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

