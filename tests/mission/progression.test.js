import { describe, expect, it, vi } from 'vitest';
import { CareerProgress } from '../../src/mission/progression.js';

const STORAGE_KEY = 'ilmatila-career-v1';

function createStorage(initialValue = null) {
  let value = initialValue;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((key, nextValue) => {
      if (key === STORAGE_KEY) value = nextValue;
    }),
  };
}

describe('CareerProgress', () => {
  it('recovers from corrupted JSON with the default progression state', () => {
    const progress = new CareerProgress(createStorage('{not valid JSON'));

    expect(progress.difficulty).toBe('standard');
    expect(progress.isUnlocked('patrol')).toBe(true);
    expect(progress.isUnlocked('training')).toBe(true);
    expect(progress.isUnlocked('intercept')).toBe(false);
    expect(progress.getBest('patrol')).toBeNull();
  });

  it('ignores saved data from an older version', () => {
    const storage = createStorage(JSON.stringify({
      version: 0,
      difficulty: 'hard',
      unlockedMissions: ['support'],
      records: { patrol: { hard: { score: 500 } } },
    }));
    const progress = new CareerProgress(storage);

    expect(progress.difficulty).toBe('standard');
    expect(progress.isUnlocked('support')).toBe(false);
    expect(progress.getBest('patrol', 'hard')).toBeNull();
  });

  it('keeps progression usable when storage reads and writes throw', () => {
    const storage = {
      getItem() { throw new Error('storage unavailable'); },
      setItem() { throw new Error('storage unavailable'); },
    };
    const progress = new CareerProgress(storage);

    expect(() => progress.recordMission({
      missionId: 'patrol',
      outcome: 'complete',
      score: 100,
    })).not.toThrow();
    expect(progress.getBest('patrol').score).toBe(100);
    expect(progress.isUnlocked('intercept')).toBe(true);
  });

  it.each([
    ['score', Number.NaN],
    ['score', Number.POSITIVE_INFINITY],
    ['accuracy', Number.NaN],
    ['accuracy', Number.POSITIVE_INFINITY],
    ['damageTaken', Number.NaN],
    ['damageTaken', Number.POSITIVE_INFINITY],
    ['missionTime', Number.NaN],
    ['missionTime', Number.POSITIVE_INFINITY],
    ['score', '123'],
  ])('normalizes non-finite or non-number %s values before saving', (field, value) => {
    const storage = createStorage();
    const progress = new CareerProgress(storage);

    const result = progress.recordMission({
      missionId: 'patrol',
      difficulty: 'standard',
      score: 240,
      accuracy: 0.75,
      damageTaken: 12,
      missionTime: 90,
      [field]: value,
    });

    expect(result.record[field]).toBe(0);
    expect(progress.getBest('patrol')[field]).toBe(0);
    const stored = JSON.parse(storage.setItem.mock.calls.at(-1)[1]);
    const storedRecord = stored.records.patrol.standard;
    expect(Object.values(storedRecord)
      .filter(value => typeof value === 'number')
      .every(Number.isFinite)).toBe(true);
    expect(storedRecord[field]).toBe(0);
    expect(new CareerProgress(storage).getBest('patrol')[field]).toBe(0);
  });

  it('unlocks missions in sequence after each completed prerequisite', () => {
    const progress = new CareerProgress(createStorage());

    const patrol = progress.recordMission({ missionId: 'patrol', outcome: 'complete' });
    expect(patrol.unlocked).toEqual(['intercept']);
    expect(progress.isUnlocked('intercept')).toBe(true);
    expect(progress.isUnlocked('support')).toBe(false);

    const intercept = progress.recordMission({ missionId: 'intercept', outcome: 'complete' });
    expect(intercept.unlocked).toEqual(['support']);
    expect(progress.isUnlocked('support')).toBe(true);
  });

  it('keeps best records separate for each difficulty', () => {
    const progress = new CareerProgress(createStorage());

    progress.recordMission({ missionId: 'patrol', difficulty: 'easy', score: 120 });
    progress.recordMission({ missionId: 'patrol', difficulty: 'hard', score: 320 });
    progress.recordMission({ missionId: 'patrol', difficulty: 'easy', score: 80 });

    expect(progress.getBest('patrol', 'easy').score).toBe(120);
    expect(progress.getBest('patrol', 'hard').score).toBe(320);
    expect(progress.getBest('patrol', 'standard')).toBeNull();
  });

  it('ignores invalid mission input without changing progression', () => {
    const progress = new CareerProgress(createStorage());

    expect(progress.recordMission(null)).toEqual({ newRecord: false, unlocked: [] });
    expect(progress.recordMission({ missionId: 'toString', outcome: 'complete' }))
      .toEqual({ newRecord: false, unlocked: [] });
    expect(progress.isUnlocked('intercept')).toBe(false);
  });
});
