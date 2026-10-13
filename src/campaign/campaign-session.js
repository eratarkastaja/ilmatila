import { createSortieSeed } from '../combat/random.js';
import { getCampaignDefinition } from './campaigns.js';
import { resolveCampaignMission } from './resolve-campaign-mission.js';

const STATE_KEYS = ['airControl', 'defenseIntegrity', 'sortieReadiness'];
const clamp = value => Math.max(0, Math.min(100, value));

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
    };
    return true;
  }

  snapshot() {
    return structuredClone(this.state);
  }

  resolveCurrentMission() {
    return resolveCampaignMission(this.definition, this.state);
  }

  previewResult(outcome, result = {}) {
    const chapter = this.currentChapter;
    if (!chapter) return { canAccept: false, classification: null, changes: {} };
    const classification = classifyResult(chapter, outcome, result);
    if (!classification) return { canAccept: false, classification: null, changes: {} };
    const { next, changes } = applyEffects(this.state, chapter.effects[classification]);
    return { canAccept: true, classification, changes, nextState: next };
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
      score: Number.isFinite(result.score) ? Math.max(0, Math.round(result.score)) : 0,
    }];
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

