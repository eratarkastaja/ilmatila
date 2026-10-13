import { describe, expect, it, vi } from 'vitest';
import { CampaignProgress, CAMPAIGN_STORAGE_KEY } from '../../src/campaign/campaign-progress.js';

function createStorage(initialValue = null) {
  let value = initialValue;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((key, nextValue) => {
      if (key === CAMPAIGN_STORAGE_KEY) value = nextValue;
    }),
  };
}

function save(overrides = {}) {
  return {
    version: 1,
    campaignId: 'shadow-border',
    difficulty: 'standard',
    chapterIndex: 2,
    airControl: 64,
    defenseIntegrity: 72,
    sortieReadiness: 68,
    flags: ['intruders-profiled'],
    acceptedAttemptIds: ['shadow-border:standard:1'],
    history: [],
    attemptSequence: 2,
    currentAttemptId: 'shadow-border:standard:2',
    currentSeed: 1234,
    retryCount: 0,
    chapterRetryCount: 0,
    completed: false,
    ending: null,
    ...overrides,
  };
}

describe('CampaignProgress', () => {
  it('stores independent, versioned campaign runs per difficulty', () => {
    const storage = createStorage();
    const progress = new CampaignProgress(storage);

    expect(progress.saveCampaign(save({ difficulty: 'easy' }))).toBe(true);
    expect(progress.saveCampaign(save({ difficulty: 'hard', airControl: 31 }))).toBe(true);

    expect(progress.getSave('easy')).toMatchObject({ difficulty: 'easy', airControl: 64 });
    expect(progress.getSave('hard')).toMatchObject({ difficulty: 'hard', airControl: 31 });
    expect(progress.getSave('standard')).toBeNull();
    expect(JSON.parse(storage.setItem.mock.calls.at(-1)[1]).version).toBe(1);
  });

  it('clamps state and removes unknown flags when loading', () => {
    const storage = createStorage(JSON.stringify({
      version: 1,
      saves: {
        standard: save({
          airControl: 140,
          defenseIntegrity: -20,
          sortieReadiness: Number.NaN,
          flags: ['intruders-profiled', 'not-authored'],
        }),
      },
    }));

    const loaded = new CampaignProgress(storage).getSave('standard');

    expect(loaded).toMatchObject({ airControl: 100, defenseIntegrity: 0, sortieReadiness: 0 });
    expect(loaded.flags).toEqual(['intruders-profiled']);
  });

  it('recovers from corrupt or unavailable storage', () => {
    const brokenStorage = {
      getItem() { throw new Error('unavailable'); },
      setItem() { throw new Error('full'); },
    };
    const progress = new CampaignProgress(brokenStorage);

    expect(progress.getSave('standard')).toBeNull();
    expect(() => progress.saveCampaign(save())).not.toThrow();
    expect(progress.getSave('standard')).toMatchObject({ chapterIndex: 2 });
  });
});

