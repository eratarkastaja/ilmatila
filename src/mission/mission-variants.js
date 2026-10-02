import { createSeededRandom } from '../combat/random.js';

function deriveVariantSeed(seed, missionId) {
  let hash = 2166136261;
  for (let index = 0; index < missionId.length; index++) {
    hash = Math.imul(hash ^ missionId.charCodeAt(index), 16777619);
  }
  return ((Number(seed) >>> 0) ^ hash) >>> 0;
}

function chooseVariant(variants, random) {
  let totalWeight = 0;
  for (const variant of variants) totalWeight += variant.weight;
  if (!(totalWeight > 0)) return null;

  let roll = random() * totalWeight;
  for (const variant of variants) {
    roll -= variant.weight;
    if (roll < 0) return variant;
  }
  return variants[variants.length - 1] ?? null;
}

/** Resolves authored mission alternatives using a stream isolated from combat RNG. */
export function resolveMissionVariant(mission, seed) {
  const variants = mission.variants;
  if (!Array.isArray(variants) || variants.length === 0) {
    return { mission: { ...mission }, variant: null, reinforcement: null };
  }

  const missionId = typeof mission.id === 'string' ? mission.id : '';
  const random = createSeededRandom(deriveVariantSeed(seed, missionId));
  const variant = chooseVariant(variants, random);
  if (!variant) return { mission: { ...mission }, variant: null, reinforcement: null };

  const resolvedMission = {
    ...mission,
    ...variant.changes,
    id: mission.id,
    unlocks: mission.unlocks,
    variants,
  };
  if (variant.changes?.objective) resolvedMission.objective = { ...variant.changes.objective };
  if (variant.changes?.optionalObjectives) {
    resolvedMission.optionalObjectives = variant.changes.optionalObjectives.map(objective => ({
      ...objective,
      ...(objective.target ? { target: { ...objective.target } } : {}),
    }));
  }

  let reinforcement = null;
  if (variant.reinforcement) {
    reinforcement = {
      ...variant.reinforcement,
      composition: [...variant.reinforcement.composition],
      scheduled: random() < variant.reinforcement.probability,
    };
  }

  return {
    mission: resolvedMission,
    variant: { id: variant.id, labelKey: variant.labelKey },
    reinforcement,
  };
}
