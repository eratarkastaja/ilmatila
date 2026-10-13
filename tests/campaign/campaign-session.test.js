import { describe, expect, it } from 'vitest';
import { CampaignProgress } from '../../src/campaign/campaign-progress.js';
import { CampaignSession } from '../../src/campaign/campaign-session.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe('CampaignSession', () => {
  it('resolves the same chapter and encounter plan across retries', () => {
    const progress = new CampaignProgress(memoryStorage());
    const seeds = [0x12345678];
    const session = new CampaignSession({
      progress,
      difficulty: 'hard',
      seedFactory: () => seeds[0],
    });
    const first = session.resolveCurrentMission();

    expect(first.chapter.id).toBe('unknown-track');
    expect(first.areaId).toBe('virolahti');
    expect(first.mission.hostiles).toBeGreaterThanOrEqual(2);
    expect(first.mission.displayTitleKey).toBe(first.chapter.titleKey);
    expect(first.preview.variant).toBeNull();
    expect(first.mission.objective.type).toBe('airPolicing');
    expect(first.mission.rulesOfEngagement).toBe('weaponsHold');

    expect(session.retryCurrent()).toBe(true);
    const retry = session.resolveCurrentMission();
    expect(retry.seed).toBe(first.seed);
    expect(retry.preview.variant).toEqual(first.preview.variant);
    expect(retry.preview.encounters).toEqual(first.preview.encounters);
    expect(retry.preview.mission.hostiles).toBe(first.preview.mission.hostiles);
    expect(retry.attemptId).not.toBe(first.attemptId);
  });

  it('previews and commits a decisive result exactly once', () => {
    let nextSeed = 100;
    const progress = new CampaignProgress(memoryStorage());
    const session = new CampaignSession({
      progress,
      difficulty: 'standard',
      seedFactory: () => nextSeed++,
    });
    const attemptId = session.state.currentAttemptId;
    const result = {
      campaignAttemptId: attemptId,
      score: 1200,
      optionalObjectives: [{ id: 'no-damage', status: 'completed' }],
    };

    const preview = session.previewResult('complete', result);
    expect(preview).toMatchObject({ canAccept: true, classification: 'decisive' });
    expect(preview.changes.airControl).toBeGreaterThan(0);
    expect(session.state.chapterIndex).toBe(0);

    const accepted = session.acceptResult('complete', result);
    expect(accepted.applied).toBe(true);
    expect(session.state.chapterIndex).toBe(1);
    expect(session.state.flags).toContain('intruders-profiled');
    expect(session.state.currentSeed).toBe(101);
    expect(session.acceptResult('complete', result)).toMatchObject({
      applied: false,
      reason: 'stale-or-duplicate',
    });
    expect(session.state.history).toHaveLength(1);
  });

  it('does not commit aircraft losses or boundary aborts', () => {
    const session = new CampaignSession({
      progress: new CampaignProgress(memoryStorage()),
      difficulty: 'easy',
      seedFactory: () => 9,
    });
    const before = session.snapshot();

    expect(session.acceptResult('failed', {})).toMatchObject({ applied: false });
    expect(session.acceptResult('aborted', {})).toMatchObject({ applied: false });
    expect(session.state).toEqual(before);
  });

  it('accepts a recovered operational setback and advances with its consequences', () => {
    const session = new CampaignSession({
      progress: new CampaignProgress(memoryStorage()),
      difficulty: 'standard',
      seedFactory: () => 19,
    });
    session.state.chapterIndex = 1;
    const before = session.snapshot();

    const accepted = session.acceptResult('setback', {
      campaignAttemptId: before.currentAttemptId,
      score: 400,
      optionalObjectives: [],
    });

    expect(accepted.applied).toBe(true);
    expect(accepted.preview.classification).toBe('setback');
    expect(session.state.chapterIndex).toBe(2);
    expect(session.state.airControl).toBe(before.airControl - 9);
    expect(session.state.defenseIntegrity).toBe(before.defenseIntegrity - 5);
  });

  it('applies state pressure to later mission resolution without removing minimum support', () => {
    const session = new CampaignSession({
      progress: new CampaignProgress(memoryStorage()),
      difficulty: 'hard',
      seedFactory: () => 77,
    });
    session.state.chapterIndex = 1;
    session.state.airControl = 20;
    session.state.sortieReadiness = 10;

    const resolved = session.resolveCurrentMission();

    expect(resolved.mission.hostiles).toBeGreaterThan(2);
    expect(resolved.mission.wingmen).toBeGreaterThanOrEqual(1);
  });

  it('keeps Easy force counts below Hard for the same seeded chapter', () => {
    const easySession = new CampaignSession({
      progress: new CampaignProgress(memoryStorage()),
      difficulty: 'easy',
      seedFactory: () => 12345,
    });
    const hardSession = new CampaignSession({
      progress: new CampaignProgress(memoryStorage()),
      difficulty: 'hard',
      seedFactory: () => 12345,
    });
    const easyOpening = easySession.resolveCurrentMission();
    const hardOpening = hardSession.resolveCurrentMission();

    expect(easyOpening.mission.objective.identifyRange)
      .toBeGreaterThan(hardOpening.mission.objective.identifyRange);
    expect(easyOpening.mission.objective.escortDuration)
      .toBeLessThan(hardOpening.mission.objective.escortDuration);

    easySession.state.chapterIndex = 1;
    hardSession.state.chapterIndex = 1;
    const easy = easySession.resolveCurrentMission();
    const hard = hardSession.resolveCurrentMission();

    expect(easy.preview.variant.id).toBe(hard.preview.variant.id);
    expect(easy.preview.mission.hostiles).toBeLessThan(hard.preview.mission.hostiles);
    expect(easy.preview.mission.openingDelay).toBeGreaterThan(hard.preview.mission.openingDelay);
  });

  it('can resolve and advance through all ten campaign chapters', () => {
    let seed = 400;
    const session = new CampaignSession({
      progress: new CampaignProgress(memoryStorage()),
      difficulty: 'standard',
      seedFactory: () => seed++,
    });
    const visited = [];

    while (!session.completed) {
      const resolved = session.resolveCurrentMission();
      visited.push(resolved.chapter.id);
      expect(session.acceptResult('complete', {
        campaignAttemptId: resolved.attemptId,
        score: 1000,
        optionalObjectives: [],
      }).applied).toBe(true);
    }

    expect(visited).toHaveLength(10);
    expect(new Set(visited).size).toBe(10);
    expect(session.state.ending).toBeTruthy();
    expect(session.resolveCurrentMission()).toBeNull();
  });
});

