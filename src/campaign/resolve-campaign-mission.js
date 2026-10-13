import { MISSIONS } from '../mission/missions.js';
import { resolveMissionVariant } from '../mission/mission-variants.js';

const FORCE_SCALE = Object.freeze({ easy: 0.68, standard: 1, hard: 1.28 });

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)]));
}

function scaleCount(value, scale) {
  if (!Number.isInteger(value) || value <= 0) return value;
  return Math.max(1, Math.round(value * scale));
}

function tuneNumbers(config, difficulty) {
  const tuned = { ...config };
  const scale = FORCE_SCALE[difficulty] ?? 1;
  for (const key of ['hostiles', 'hostileHelicopters', 'groundPairs', 'groundShilkaCount']) {
    if (key in tuned) tuned[key] = scaleCount(tuned[key], scale);
  }
  if (Number.isFinite(tuned.openingDelay)) {
    tuned.openingDelay = Math.max(0, tuned.openingDelay + (difficulty === 'easy' ? 6 : difficulty === 'hard' ? -3 : 0));
  }
  return tuned;
}

function tuneVariant(variant, difficulty) {
  const tuned = clone(variant);
  tuned.changes = tuneNumbers(tuned.changes ?? {}, difficulty);
  if (Array.isArray(tuned.encounters)) {
    tuned.encounters = tuned.encounters.map(encounter => ({
      ...encounter,
      responses: encounter.responses.map(response => ({
        ...response,
        hostiles: scaleCount(response.hostiles, FORCE_SCALE[difficulty] ?? 1),
      })),
    }));
  }
  return tuned;
}

function applyAirControlPressure(config, airControl, inherited = false) {
  const pressured = { ...config };
  if (airControl < 40) {
    if (!inherited || Number.isInteger(pressured.hostiles)) {
      pressured.hostiles = Math.max(1, (pressured.hostiles ?? 0) + 1);
    }
    if (!inherited || Number.isFinite(pressured.openingDelay)) {
      pressured.openingDelay = Math.max(0, (pressured.openingDelay ?? 0) - 2);
    }
  } else if (airControl >= 75 && (!inherited || Number.isFinite(pressured.openingDelay))) {
    pressured.openingDelay = (pressured.openingDelay ?? 0) + 3;
  }
  return pressured;
}

function tuneOperationalObjective(objective, difficulty, hostileCount) {
  const tuned = clone(objective);
  if (tuned.type === 'airPolicing') {
    tuned.requiredContacts = hostileCount;
    if (difficulty === 'easy') {
      tuned.identifyRange = Math.round(tuned.identifyRange * 1.35);
      tuned.identifyDuration *= .5;
      tuned.escortRange = Math.round(tuned.escortRange * 1.3);
      tuned.escortDuration *= .5;
    } else if (difficulty === 'hard') {
      tuned.identifyRange = Math.round(tuned.identifyRange * .9);
      tuned.identifyDuration *= 1.25;
      tuned.escortRange = Math.round(tuned.escortRange * .95);
      tuned.escortDuration *= 1.35;
    }
  } else if (tuned.type === 'assetDefense') {
    tuned.graceDuration = Number.isFinite(tuned.graceDuration) ? tuned.graceDuration : 0;
    if (difficulty === 'easy') {
      tuned.zoneRadius = Math.round(tuned.zoneRadius * .78);
      tuned.graceDuration *= .75;
    } else if (difficulty === 'hard') {
      // Hard should demand a fast response, not fail while the player is still
      // flying the ingress leg. Give the strike a little more setup time and
      // keep the loss zone tight enough to leave a readable rescue window.
      tuned.zoneRadius = Math.round(tuned.zoneRadius * .9);
      tuned.graceDuration *= 1.5;
    }
  } else if (tuned.type === 'forceDefense') {
    if (difficulty === 'easy') {
      tuned.minimumFriendlyStrength = Math.max(.1, tuned.minimumFriendlyStrength - .2);
      tuned.maximumGroundRemaining += 3;
    } else if (difficulty === 'hard') {
      tuned.minimumFriendlyStrength = Math.min(.9, tuned.minimumFriendlyStrength + .2);
      tuned.maximumGroundRemaining = Math.max(0, tuned.maximumGroundRemaining - 2);
    }
  }
  return tuned;
}

function applyMissionOverrides(mission, overrides, difficulty) {
  if (!overrides) return mission;
  const { disableVariants = false, objective, ...values } = overrides;
  const resolved = { ...mission, ...clone(values) };
  if (disableVariants) resolved.variants = [];
  if (objective) {
    resolved.objective = tuneOperationalObjective(objective, difficulty, resolved.hostiles);
  }
  return resolved;
}

/** Resolves campaign pressure into an ordinary mission definition. */
export function resolveCampaignMission(definition, state, { seed = state.currentSeed } = {}) {
  if (!definition || !state || state.completed) return null;
  const chapter = definition.chapters[state.chapterIndex];
  const baseMission = MISSIONS[chapter?.baseMissionId];
  if (!chapter || !baseMission) return null;

  let mission = applyAirControlPressure(
    tuneNumbers(clone(baseMission), state.difficulty),
    state.airControl,
  );
  mission.variants = (mission.variants ?? []).map(variant => {
    const tuned = tuneVariant(variant, state.difficulty);
    tuned.changes = applyAirControlPressure(tuned.changes, state.airControl, true);
    return tuned;
  });
  mission = applyMissionOverrides(mission, chapter.missionOverrides, state.difficulty);
  if (state.sortieReadiness < 35) mission.wingmen = Math.max(1, mission.wingmen - 1);
  else if (state.sortieReadiness >= 80) mission.wingmen = Math.min(3, mission.wingmen + 1);

  Object.assign(mission, {
    campaignId: definition.id,
    campaignChapterId: chapter.id,
    campaignAttemptId: state.currentAttemptId,
    displayTitleKey: chapter.titleKey,
  });

  return {
    campaignId: definition.id,
    chapter,
    areaId: chapter.areaId,
    attemptId: state.currentAttemptId,
    seed: Number(seed) >>> 0,
    mission,
    preview: resolveMissionVariant(mission, seed),
  };
}

