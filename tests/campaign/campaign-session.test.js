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
    expect(first.mission.weather.timeOfDay).toBe(5.5);
    expect(first.preview.mission.weather.timeOfDay).toBe(5.5);

    expect(session.retryCurrent()).toBe(true);
    expect(session.state.sortieReadiness).toBe(67);
    const retry = session.resolveCurrentMission();
    expect(retry.seed).toBe(first.seed);
    expect(retry.preview.variant).toEqual(first.preview.variant);
    expect(retry.preview.encounters).toEqual(first.preview.encounters);
    expect(retry.preview.mission.hostiles).toBe(first.preview.mission.hostiles);
    expect(retry.preview.mission.weather.timeOfDay).toBe(first.preview.mission.weather.timeOfDay);
    expect(retry.attemptId).not.toBe(first.attemptId);
  });

  it('consumes a selected sustainment window when retrying and does not restore it', () => {
    const session = new CampaignSession({
      progress: new CampaignProgress(memoryStorage()),
      difficulty: 'standard',
      seedFactory: () => 321,
    });
    session.state.chapterIndex = 2;
    session.state.stores = { airMissiles: 4, groundMissiles: 4, gunRounds: 1000, flares: 8, chaff: 8 };
    expect(session.getStoresAfterChoice()).toEqual(session.getCurrentStores());
    expect(session.selectSustainmentChoice('partial-rearm')).toBe(true);
    expect(session.getStoresAfterChoice('partial-rearm').airMissiles)
      .toBeGreaterThan(session.getCurrentStores().airMissiles);
    expect(session.retryReadinessCost).toBe(7);

    expect(session.retryCurrent()).toBe(true);

    expect(session.state.sortieReadiness).toBe(63);
    expect(session.state.sustainmentChoice).toBeNull();
    expect(session.state.sustainmentUsed).toBe(true);
    expect(session.selectSustainmentChoice('partial-rearm')).toBe(false);
    expect(session.resolveCurrentMission().mission.campaignStores).toEqual(session.getCurrentStores());
  });

  it('authors an acceptable operational setback for every campaign chapter', () => {
    const progress = new CampaignProgress(memoryStorage());
    const session = new CampaignSession({ progress, seedFactory: () => 123 });
    const setbacks = session.definition.chapters.map(chapter => {
      const objective = chapter.missionOverrides?.objective;
      if (objective?.setback) return objective.setback;
      if (objective?.type === 'assetDefense') return { type: 'assetLost' };
      if (objective?.type === 'forceDefense') return { type: 'friendlyStrength' };
      return null;
    });

    expect(setbacks.every(Boolean)).toBe(true);
  });

  it('turns strategic metrics into mission pressure and support', () => {
    const makeSession = () => new CampaignSession({
      progress: new CampaignProgress(memoryStorage()),
      difficulty: 'standard',
      seedFactory: () => 987,
    });
    const low = makeSession();
    low.state.airControl = 39;
    low.state.defenseIntegrity = 34;
    low.state.sortieReadiness = 34;
    low.state.chapterIndex = 5;
    const lowMission = low.resolveCurrentMission().mission;

    const high = makeSession();
    high.state.airControl = 75;
    high.state.defenseIntegrity = 75;
    high.state.sortieReadiness = 80;
    high.state.chapterIndex = 5;
    const highMission = high.resolveCurrentMission().mission;

    expect(lowMission.campaignRadarRangeScale).toBeLessThan(highMission.campaignRadarRangeScale);
    expect(lowMission.campaignFriendlyGroundHealthScale).toBeLessThan(highMission.campaignFriendlyGroundHealthScale);
    expect(lowMission.groundIto90Count).toBeLessThan(highMission.groundIto90Count);
    expect(lowMission.groundFriendlyTrucks).toBeLessThan(highMission.groundFriendlyTrucks);
    expect(lowMission.campaignLoadoutScale).toBeLessThan(highMission.campaignLoadoutScale);
    expect(lowMission.campaignDefenseFrontOffset).toBeLessThan(highMission.campaignDefenseFrontOffset);
    expect(lowMission.wingmen).toBeLessThan(highMission.wingmen);
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

  it('applies authored optional objective effects to the next campaign state', () => {
    const session = new CampaignSession({
      progress: new CampaignProgress(memoryStorage()),
      difficulty: 'standard',
      seedFactory: () => 27,
    });
    session.state.chapterIndex = 1;
    const attemptId = session.state.currentAttemptId;
    const result = {
      campaignAttemptId: attemptId,
      optionalObjectives: [
        { id: 'lead-intercept', status: 'failed' },
        { id: 'wingmen-home', status: 'completed' },
      ],
    };

    const preview = session.previewResult('complete', result);

    expect(preview.classification).toBe('success');
    expect(preview.changes).toMatchObject({
      airControl: 3,
      defenseIntegrity: -4,
      sortieReadiness: 5,
    });
    expect(preview.optionalObjectiveChanges).toEqual([
      { id: 'lead-intercept', status: 'failed', changes: {
        airControl: -2, defenseIntegrity: -5, sortieReadiness: 0,
      } },
      { id: 'wingmen-home', status: 'completed', changes: {
        airControl: 0, defenseIntegrity: 0, sortieReadiness: 3,
      } },
    ]);

    expect(session.acceptResult('complete', result).applied).toBe(true);
    expect(session.state.history[0].optionalObjectives).toEqual(result.optionalObjectives);
    expect(session.state.flags).toContain('relay-saved');
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

  it('uses campaign history to branch later sorties', () => {
    const makeSession = () => new CampaignSession({
      progress: new CampaignProgress(memoryStorage()),
      difficulty: 'standard',
      seedFactory: () => 77,
    });

    const relayLost = makeSession();
    relayLost.state.chapterIndex = 2;
    const relayLostMission = relayLost.resolveCurrentMission();
    const relaySaved = makeSession();
    relaySaved.state.chapterIndex = 2;
    relaySaved.state.flags = ['relay-protected'];
    const relaySavedMission = relaySaved.resolveCurrentMission();
    expect(relayLostMission.mission.campaignRadarRangeScale)
      .toBeLessThan(relaySavedMission.mission.campaignRadarRangeScale);

    const northernFailure = makeSession();
    northernFailure.state.chapterIndex = 4;
    const northernFailureMission = northernFailure.resolveCurrentMission();
    const northernSuccess = makeSession();
    northernSuccess.state.chapterIndex = 4;
    northernSuccess.state.flags = ['main-axis-confirmed'];
    expect(northernFailure.resolveCurrentMission().mission.hostiles)
      .toBeGreaterThan(northernSuccess.resolveCurrentMission().mission.hostiles);
    expect(northernFailureMission.preview.mission.hostileRoles).toContain('strike');

    const logisticsBroken = makeSession();
    logisticsBroken.state.chapterIndex = 8;
    logisticsBroken.state.flags = ['relay-logistics-broken'];
    const reinforcementsBlocked = logisticsBroken.resolveCurrentMission();
    expect(reinforcementsBlocked.preview.encounters.every(encounter => !encounter.scheduled)).toBe(true);

    const stabilized = makeSession();
    stabilized.state.chapterIndex = 9;
    stabilized.state.flags = ['border-line-stabilized'];
    const stabilizedMission = stabilized.resolveCurrentMission().mission;
    const exposed = makeSession();
    exposed.state.chapterIndex = 9;
    const exposedMission = exposed.resolveCurrentMission().mission;
    expect(stabilizedMission.groundFriendlyTrucks).toBeGreaterThan(exposedMission.groundFriendlyTrucks);
    expect(stabilizedMission.campaignDefenseFrontOffset).toBeGreaterThan(exposedMission.campaignDefenseFrontOffset);
  });

  it('makes First Wave protect the strike corridor instead of clearing every aircraft', () => {
    const session = new CampaignSession({
      progress: new CampaignProgress(memoryStorage()),
      difficulty: 'standard',
      seedFactory: () => 77,
    });
    session.state.chapterIndex = 4;

    expect(session.resolveCurrentMission().mission.objective.type).toBe('strikeDefense');
  });

  it('offers rare partial sustainment and carries the sortie remainder forward', () => {
    const session = new CampaignSession({
      progress: new CampaignProgress(memoryStorage()),
      difficulty: 'standard',
      seedFactory: () => 91,
    });
    session.state.chapterIndex = 2;
    session.state.stores = {
      airMissiles: 1,
      groundMissiles: 0,
      gunRounds: 120,
      flares: 2,
      chaff: 3,
    };

    expect(session.currentSustainmentDecision.choices).toHaveLength(2);
    expect(session.selectSustainmentChoice('partial-rearm')).toBe(true);
    const resolved = session.resolveCurrentMission();
    expect(resolved.mission.campaignStores).toMatchObject({
      airMissiles: 3,
      groundMissiles: 2,
      gunRounds: 470,
      flares: 2,
      chaff: 3,
    });

    const accepted = session.acceptResult('complete', {
      campaignAttemptId: session.state.currentAttemptId,
      remainingStores: { airMissiles: 2, groundMissiles: 1, gunRounds: 80, flares: 1, chaff: 2 },
      optionalObjectives: [],
    });
    expect(accepted.applied).toBe(true);
    expect(session.state.stores).toEqual({
      airMissiles: 2,
      groundMissiles: 1,
      gunRounds: 80,
      flares: 1,
      chaff: 2,
    });
    expect(session.state.sortieReadiness).toBe(72);
    expect(session.state.sustainmentChoice).toBeNull();
  });

  it('can jump to a campaign chapter for development testing without saving the jump', () => {
    const progress = new CampaignProgress(memoryStorage());
    const session = new CampaignSession({
      progress,
      difficulty: 'standard',
      seedFactory: () => 77,
    });

    expect(session.selectDevelopmentChapter(5)).toBe(true);
    expect(session.currentChapter.id).toBe('border-breaks');
    expect(session.resolveCurrentMission().chapter.id).toBe('border-breaks');
    expect(progress.getSave('standard').chapterIndex).toBe(0);
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

  it('leaves Hard asset defense a readable response window', () => {
    const easySession = new CampaignSession({
      progress: new CampaignProgress(memoryStorage()), difficulty: 'easy', seedFactory: () => 3,
    });
    const hardSession = new CampaignSession({
      progress: new CampaignProgress(memoryStorage()), difficulty: 'hard', seedFactory: () => 3,
    });
    easySession.state.chapterIndex = 1;
    hardSession.state.chapterIndex = 1;

    const easyMission = easySession.resolveCurrentMission().mission;
    const hardMission = hardSession.resolveCurrentMission().mission;
    const easy = easyMission.objective;
    const hard = hardMission.objective;

    expect(easy.type).toBe('assetDefense');
    expect(hard.graceDuration).toBeGreaterThan(easy.graceDuration);
    expect(hard.zoneRadius).toBeLessThan(7200);
    expect(hardMission.hostileRoles).toEqual(['sweep', 'sweep', 'strike', 'strike']);
    expect(hardMission.hostileSpawnDistance).toBe(18000);
    expect(hardMission.hostileMinimumSpawnDistance).toBe(16500);
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

