import { createSortieSeed } from '../combat/random.js';
import { CAMPAIGN_CONTENT_VERSION, getCampaignStoreCaps, normalizeCampaignStores } from './campaign-progress.js';
import { getCampaignDefinition } from './campaigns.js';
import { resolveCampaignMission } from './resolve-campaign-mission.js';
import {
  getKitLimits,
  getRecommendedKit,
  KIT_STORE_KEYS,
  validateKit,
} from './campaign-kit.js';
import { scaleMissileReserveObjectives } from '../mission/optional-objectives.js';
import { isSupportChoiceAvailable } from './support-capabilities.js';

const STATE_KEYS = ['airControl', 'defenseIntegrity', 'sortieReadiness'];
const clamp = value => Math.max(0, Math.min(100, value));
// Kept as a compatibility export for integrations that displayed the old
// value. Retry is practice and has no persistent readiness cost now.
export const CAMPAIGN_RETRY_READINESS_COST = 0;

function resupplyStoresForNextSortie(stores, difficulty) {
  const caps = getCampaignStoreCaps(difficulty);
  const next = { ...stores };
  for (const key of KIT_STORE_KEYS) {
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
    roster: {},
    attemptSequence,
    currentAttemptId: createAttemptId(definition, difficulty, attemptSequence),
    currentSeed: Number(seedFactory()) >>> 0,
    retryCount: 0,
    chapterRetryCount: 0,
    completed: false,
    ending: null,
    stores: null,
    sustainmentChoice: null,
    kitSelection: null,
  };
}

function scaleInventoryForReadiness(inventory, readiness) {
  if (readiness >= 35) return { ...inventory };
  return Object.fromEntries(KIT_STORE_KEYS.map(key => [
    key,
    inventory[key] === null || key === 'fuelMinutes'
      ? inventory[key]
      : Math.floor(inventory[key] * .8),
  ]));
}

function mergeWingmanRoster(previous, entries) {
  if (!Array.isArray(entries)) return { ...previous };
  const next = { ...previous };
  for (const entry of entries) {
    if (!entry || typeof entry.radioId !== 'string') continue;
    const status = ['returned', 'lost', 'survived', 'absent'].includes(entry.status)
      ? entry.status
      : null;
    if (status) next[entry.radioId] = status;
  }
  return next;
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
    const savedState = progress?.getSave(difficulty);
    this.state = savedState ?? createState(this.definition, difficulty, seedFactory);
    this.selectionSnapshot = null;
    this.developmentSelection = false;
    this.replaySelection = false;
    this.replayPractice = false;
    this.currentLaunchSnapshot = null;
    if (!savedState) this.progress?.saveCampaign(this.state);
  }

  get difficulty() { return this.state.difficulty; }
  get currentChapter() { return this.definition.chapters[this.state.chapterIndex] ?? null; }
  get completed() { return this.state.completed; }
  get progressChapterIndex() { return this.selectionSnapshot?.chapterIndex ?? this.state.chapterIndex; }
  get isReplay() { return this.replaySelection; }
  get isReplayPractice() { return this.replayPractice; }
  isChapterCompleted(chapterIndex) {
    if (!Number.isInteger(chapterIndex) || chapterIndex < 0 || chapterIndex >= this.progressChapterIndex) return false;
    const chapterId = this.definition.chapters[chapterIndex]?.id;
    return (this.selectionSnapshot?.history ?? this.state.history ?? []).some(entry => (
      entry.chapterId === chapterId && ['success', 'decisive'].includes(entry.classification)
    ));
  }
  get currentSustainmentDecision() { return this.currentChapter?.sustainmentDecision ?? null; }
  getSustainmentChoices() {
    return (this.currentSustainmentDecision?.choices ?? []).map(choice => ({
      ...choice,
      available: isSupportChoiceAvailable(choice, this.state, this.currentChapter),
    }));
  }
  get selectedSustainmentChoice() {
    const choices = this.currentSustainmentDecision?.choices ?? [];
    return choices.find(choice => choice.id === this.state.sustainmentChoice) ?? null;
  }
  get retryReadinessCost() {
    return CAMPAIGN_RETRY_READINESS_COST;
  }

  getCurrentStores() {
    const caps = getCampaignStoreCaps(this.difficulty);
    return normalizeCampaignStores(this.state.stores ?? caps, this.difficulty) ?? caps;
  }

  getStoresAfterChoice(choiceId = null) {
    // Support changes the sortie composition, not the base inventory. The
    // method remains as a tolerant boundary for older callers.
    return this.getCurrentStores();
  }

  getEffectiveInventory() {
    return scaleInventoryForReadiness(this.getCurrentStores(), this.state.sortieReadiness);
  }

  getKitState() {
    const choice = this.selectedSustainmentChoice;
    const inventory = scaleInventoryForReadiness(this.getStoresAfterChoice(choice?.id), this.state.sortieReadiness);
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
    if (this.replaySelection) this.replayPractice = true;
    if (!this.selectionSnapshot) this.progress?.saveCampaign(this.state);
    return true;
  }

  selectSustainmentChoice(choiceId) {
    if (choiceId !== null && typeof choiceId !== 'string') return false;
    const choices = this.currentSustainmentDecision?.choices ?? [];
    const choice = choices.find(item => item.id === choiceId);
    if (choiceId !== null && (!choice
      || !isSupportChoiceAvailable(choice, this.state, this.currentChapter))) return false;
    this.state = { ...this.state, sustainmentChoice: choiceId };
    if (this.replaySelection) this.replayPractice = true;
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
    const replayEntry = selectionType === 'replay'
      ? [...this.state.history].reverse().find(entry => entry.chapterId === this.definition.chapters[chapterIndex]?.id)
      : null;
    const replaySnapshot = replayEntry?.launchSnapshot ?? null;
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
      sustainmentChoice: replaySnapshot?.sustainmentChoice ?? null,
      kitSelection: null,
    };
    if (replaySnapshot) {
      this.state = {
        ...this.state,
        airControl: replaySnapshot.metrics.airControl,
        defenseIntegrity: replaySnapshot.metrics.defenseIntegrity,
        sortieReadiness: replaySnapshot.metrics.sortieReadiness,
        flags: [...replaySnapshot.flags],
        roster: { ...replaySnapshot.roster },
        currentSeed: replaySnapshot.seed,
        kitSelection: { ...replaySnapshot.kit },
      };
    }
    this.selectionSnapshot = snapshot;
    this.developmentSelection = selectionType === 'development';
    this.replaySelection = selectionType === 'replay';
    this.replayPractice = selectionType === 'replay' && !replaySnapshot;
    this.currentLaunchSnapshot = null;
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
    this.replayPractice = false;
    this.currentLaunchSnapshot = null;
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
    const optionalObjectives = scaleMissileReserveObjectives(
      resolved.preview.mission.optionalObjectives,
      stores,
      getCampaignStoreCaps('standard'),
    );
    resolved.mission.campaignStores = stores;
    resolved.mission.campaignSustainmentChoice = choice?.id ?? null;
    resolved.mission.campaignKit = kit.selected;
    resolved.mission.campaignOptionalObjectivesResolved = true;
    resolved.mission.campaignOptionalObjectives = optionalObjectives;
    resolved.mission.optionalObjectives = optionalObjectives;
    resolved.preview.mission.campaignStores = stores;
    resolved.preview.mission.campaignSustainmentChoice = choice?.id ?? null;
    resolved.preview.mission.campaignKit = kit.selected;
    resolved.preview.mission.campaignOptionalObjectivesResolved = true;
    resolved.preview.mission.campaignOptionalObjectives = optionalObjectives;
    resolved.preview.mission.optionalObjectives = optionalObjectives;
    resolved.stores = stores;
    this.currentLaunchSnapshot = {
      version: 1,
      contentVersion: CAMPAIGN_CONTENT_VERSION,
      chapterId: resolved.chapter.id,
      difficulty: this.difficulty,
      seed: resolved.seed,
      metrics: Object.fromEntries(STATE_KEYS.map(key => [key, this.state[key]])),
      flags: [...this.state.flags],
      roster: { ...this.state.roster },
      kit: { ...kit.selected },
      sustainmentChoice: choice?.id ?? null,
      variantId: resolved.preview.variant?.id ?? null,
      objectiveIds: optionalObjectives.map(objective => objective.id),
    };
    resolved.resolvedSortie = {
      identity: {
        campaignId: resolved.campaignId,
        chapterId: resolved.chapter.id,
        attemptId: resolved.attemptId,
      },
      seed: resolved.seed,
      areaId: resolved.areaId,
      mission: structuredClone(resolved.preview.mission),
      variant: resolved.preview.variant ? { ...resolved.preview.variant } : null,
      encounters: structuredClone(resolved.preview.encounters),
      effectiveKit: { ...kit.selected },
      objectives: structuredClone(optionalObjectives),
      support: choice?.id ?? null,
      provenance: { source: 'campaign', contentVersion: CAMPAIGN_CONTENT_VERSION },
    };
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
    return {
      canAccept: true,
      classification,
      narrativeKey: chapter.debriefNarrativeKeys?.[classification]
        ?? `campaign.debrief.narrative.${classification}`,
      practice: this.developmentSelection || this.replaySelection,
      changes,
      optionalObjectiveChanges: optional.applied,
      nextState: next,
      sustainmentChoice: choice?.id ?? null,
      retryReadinessCost: this.retryReadinessCost,
    };
  }

  acceptResult(outcome, result = {}) {
    if (this.replaySelection) return { applied: false, reason: 'replay-not-committable' };
    const attemptId = result.campaignAttemptId ?? this.state.currentAttemptId;
    if (attemptId !== this.state.currentAttemptId || this.state.acceptedAttemptIds.includes(attemptId)) {
      return { applied: false, reason: 'stale-or-duplicate' };
    }
    const preview = this.previewResult(outcome, result);
    if (!preview.canAccept) return { applied: false, reason: 'result-not-committable' };

    const chapter = this.currentChapter;
    if (!this.currentLaunchSnapshot) this.resolveCurrentMission();
    const temporary = Boolean(this.selectionSnapshot);
    const nextRoster = mergeWingmanRoster(this.state.roster, result.wingmenRoster);
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
      launchSnapshot: this.currentLaunchSnapshot ? structuredClone(this.currentLaunchSnapshot) : null,
      wingmenRoster: result.wingmenRoster ? structuredClone(result.wingmenRoster) : null,
    }];
    if (result.remainingStores) {
      const remainingStores = normalizeCampaignStores(result.remainingStores, state.difficulty);
      state.stores = resupplyStoresForNextSortie(remainingStores, state.difficulty);
    }
    state.roster = nextRoster;
    state.sustainmentChoice = null;
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
    this.currentLaunchSnapshot = null;
    if (!temporary) this.progress?.saveCampaign(this.state);
    return { applied: true, preview, completed: state.completed, ending: state.ending };
  }

  retryCurrent() {
    if (this.state.completed) return false;
    const temporary = Boolean(this.selectionSnapshot);
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
    this.currentLaunchSnapshot = null;
    if (!temporary) this.progress?.saveCampaign(this.state);
    return true;
  }
}

