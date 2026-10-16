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

function targetCount(mission, target = {}) {
  const collection = target.collection;
  if (collection === 'airHostiles') {
    const roles = mission.hostileRoles ?? Array.from({ length: mission.hostiles ?? 0 }, () => 'sweep');
    const matches = roles.filter(role => !target.role || role === target.role);
    return target.index === undefined ? matches.length : matches[target.index] === undefined ? 0 : 1;
  }
  if (collection === 'airFriendly') {
    return target.role === 'wingman' ? mission.wingmen ?? 0 : 0;
  }
  if (collection === 'groundHostiles') {
    if (target.role === 'airDefense') return mission.groundShilkaCount ?? 0;
    if (target.role === 'assault') return mission.groundPairs ?? 0;
    if (target.role === 'logistics') return target.reinforcementSource
      ? Number((mission.groundTrucks ?? 0) > 0)
      : mission.groundTrucks ?? 0;
  }
  if (collection === 'friendlyGround') {
    if (target.role === 'defender') return mission.groundPairs ?? 0;
    if (target.role === 'logistics') return mission.groundFriendlyTrucks ?? 0;
    if (target.role === 'airDefense' && target.platform === 'sergei23') return mission.groundSergeiCount ?? 0;
    if (target.role === 'artillery' && target.platform === 'rsrakh06') return mission.groundMlrsCount ?? 0;
  }
  return 0;
}

function variantCases(session, chapterIndex, difficulty, choiceId) {
  const variants = new Map();
  let expectedVariants = 1;
  // Walk enough deterministic seeds to observe every variant authored by the
  // resolved mission, while keeping this a configuration matrix rather than a
  // second campaign simulation.
  for (let seed = 0; seed < 256 && variants.size < expectedVariants; seed++) {
    session.state = {
      ...session.state,
      chapterIndex,
      difficulty,
      currentSeed: seed,
      sustainmentChoice: choiceId,
    };
    const resolved = session.resolveCurrentMission();
    expectedVariants = Math.max(1, resolved.mission.variants?.length ?? 0);
    const variantId = resolved.preview.variant?.id ?? 'base';
    if (!variants.has(variantId)) variants.set(variantId, resolved);
  }
  return variants;
}

function assertObjectiveFeasible(resolved) {
  const mission = resolved.preview.mission;
  for (const objective of resolved.mission.optionalObjectives ?? []) {
    const count = targetCount(mission, objective.target);
    if (objective.type === 'destroyTargets' || objective.type === 'destroyOptionalGroundTarget') {
      expect(count, `${resolved.chapter.id}/${objective.id} target count`).toBeGreaterThanOrEqual(objective.required ?? 1);
    }
    if (objective.type === 'preserveForce') {
      expect(count, `${resolved.chapter.id}/${objective.id} force count`).toBeGreaterThan(0);
      expect(objective.minimumAlive ?? 0).toBeLessThanOrEqual(count);
      expect(objective.minimumFraction ?? 0).toBeLessThanOrEqual(1);
    }
    if (objective.type === 'allWingmenSurvive' || objective.type === 'allWingmenReturned') {
      expect(mission.wingmen ?? 0, `${resolved.chapter.id}/${objective.id} wingmen`).toBeGreaterThan(0);
    }
    if (objective.type === 'denyZone') {
      expect(count, `${resolved.chapter.id}/${objective.id} zone target count`).toBeGreaterThan(0);
      expect(objective.zone?.center).toBe('protectedAsset');
      expect(objective.zone?.radius).toBeGreaterThan(0);
    }
  }
}

describe('campaign objective feasibility', () => {
  it('keeps every authored objective reachable across difficulty, variants, and sustainment choices', () => {
    const session = new CampaignSession({
      progress: new CampaignProgress(memoryStorage()),
      seedFactory: () => 1,
    });

    for (let chapterIndex = 0; chapterIndex < session.definition.chapters.length; chapterIndex++) {
      const chapter = session.definition.chapters[chapterIndex];
      const choices = [null, ...(chapter.sustainmentDecision?.choices ?? []).map(choice => choice.id)];
      for (const difficulty of ['easy', 'standard', 'hard']) {
        for (const choiceId of choices) {
          const cases = variantCases(session, chapterIndex, difficulty, choiceId);
          expect(cases.size, `${chapter.id}/${difficulty}/${choiceId ?? 'none'} variants`).toBeGreaterThan(0);
          for (const resolved of cases.values()) {
            assertObjectiveFeasible(resolved);
            const choice = chapter.sustainmentDecision?.choices?.find(item => item.id === choiceId);
            const supportObjective = choice?.optionalObjectiveByChapter?.[chapter.id]
              ?? choice?.optionalObjective;
            if (supportObjective) {
              const matches = resolved.mission.optionalObjectives.filter(objective => objective.id === supportObjective.id);
              expect(matches, `${chapter.id}/${choiceId} support objective`).toHaveLength(1);
              const equivalentAuthored = (chapter.optionalObjectives ?? []).some(objective => (
                objective.type === supportObjective.type
                && JSON.stringify(objective.target) === JSON.stringify(supportObjective.target)
              ));
              expect(equivalentAuthored, `${chapter.id}/${choiceId} duplicate support predicate`).toBe(false);
            }
          }
        }
      }
    }
  });
});
