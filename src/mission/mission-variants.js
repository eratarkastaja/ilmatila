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

function chooseEncounterResponse(responses, random) {
  let totalWeight = 0;
  for (const response of responses) totalWeight += response.weight;
  if (!(totalWeight > 0)) return null;

  let roll = random() * totalWeight;
  for (const response of responses) {
    roll -= response.weight;
    if (roll < 0) return response;
  }
  return responses[responses.length - 1] ?? null;
}

/** Resolves authored mission alternatives using a stream isolated from combat RNG. */
export function resolveMissionVariant(mission, seed) {
  const variants = mission.variants;
  if (!Array.isArray(variants) || variants.length === 0) {
    return { mission: { ...mission }, variant: null, encounters: [] };
  }

  const missionId = typeof mission.id === 'string' ? mission.id : '';
  const random = createSeededRandom(deriveVariantSeed(seed, missionId));
  const variant = chooseVariant(variants, random);
  if (!variant) return { mission: { ...mission }, variant: null, encounters: [] };

  const resolvedMission = {
    ...mission,
    ...variant.changes,
    id: mission.id,
    unlocks: mission.unlocks,
    variants,
  };
  if (variant.changes?.hostileRoles) resolvedMission.hostileRoles = [...variant.changes.hostileRoles];
  if (variant.changes?.objective) resolvedMission.objective = { ...variant.changes.objective };
  if (variant.changes?.optionalObjectives) {
    resolvedMission.optionalObjectives = variant.changes.optionalObjectives.map(objective => ({
      ...objective,
      ...(objective.target ? { target: { ...objective.target } } : {}),
    }));
  }

  const encounters = (variant.encounters ?? []).map(encounter => {
    const response = chooseEncounterResponse(encounter.responses, random);
    const minimumDelay = encounter.delayRangeSeconds.min;
    const maximumDelay = encounter.delayRangeSeconds.max;
    const delaySeconds = minimumDelay + Math.floor(random() * (maximumDelay - minimumDelay + 1));
    return {
      ...encounter,
      trigger: { ...encounter.trigger },
      scheduled: random() < encounter.probability,
      delaySeconds,
      response: response ? {
        ...response,
        composition: [...response.composition],
        hostileRoles: [...response.hostileRoles],
      } : null,
    };
  });

  return {
    mission: resolvedMission,
    variant: { id: variant.id, labelKey: variant.labelKey },
    encounters,
  };
}
