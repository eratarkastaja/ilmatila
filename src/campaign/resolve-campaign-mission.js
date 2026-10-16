import { MISSIONS } from '../mission/missions.js';
import { resolveMissionVariant } from '../mission/mission-variants.js';

const FORCE_SCALE = Object.freeze({ easy: 0.68, standard: 1, hard: 1.28 });

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

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
  for (const key of ['hostiles', 'hostileHelicopters', 'groundPairs', 'groundShilkaCount', 'groundSergeiCount', 'groundMlrsCount']) {
    if (key in tuned) tuned[key] = scaleCount(tuned[key], scale);
  }
  if (Number.isFinite(tuned.openingDelay)) {
    tuned.openingDelay = Math.max(0, tuned.openingDelay + (difficulty === 'easy' ? 6 : difficulty === 'hard' ? -3 : 0));
  }
  return tuned;
}

function tuneVariant(variant, difficulty, airControl) {
  const tuned = clone(variant);
  tuned.changes = tuneNumbers(tuned.changes ?? {}, difficulty);
  if (Array.isArray(tuned.encounters)) {
    tuned.encounters = tuned.encounters.map(encounter => ({
      ...encounter,
      probability: Number.isFinite(encounter.probability)
        ? clamp(encounter.probability + (airControl < 40 ? .12 : airControl >= 75 ? -.08 : 0), 0, 1)
        : encounter.probability,
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
  if (!inherited) {
    pressured.campaignRadarRangeScale = airControl < 40 ? .88 : airControl >= 75 ? 1.1 : 1;
    pressured.campaignWingmanDelta = airControl >= 70 ? 1 : airControl < 30 ? -1 : 0;
  }
  return pressured;
}

function applyDefenseIntegrityPressure(config, defenseIntegrity) {
  const pressured = { ...config };
  if (defenseIntegrity < 35) {
    pressured.groundFriendlyTrucks = Math.max(0, (pressured.groundFriendlyTrucks ?? 0) - 2);
    pressured.groundIto90Count = Math.max(0, (pressured.groundIto90Count ?? 0) - 1);
    pressured.campaignFriendlyGroundHealthScale = .82;
    pressured.campaignDefenseFrontOffset = -800;
  } else if (defenseIntegrity >= 75) {
    pressured.groundFriendlyTrucks = (pressured.groundFriendlyTrucks ?? 0) + 2;
    pressured.groundIto90Count = (pressured.groundIto90Count ?? 0) + 1;
    pressured.campaignFriendlyGroundHealthScale = 1.12;
    pressured.campaignDefenseFrontOffset = 800;
  } else {
    pressured.campaignFriendlyGroundHealthScale = 1;
    pressured.campaignDefenseFrontOffset = 0;
  }
  return pressured;
}

function applyReadinessPressure(config, readiness) {
  const pressured = { ...config };
  if (readiness < 35) {
    pressured.campaignLoadoutScale = .8;
    pressured.campaignAirframeHealthScale = .88;
  } else if (readiness >= 80) {
    pressured.campaignLoadoutScale = 1;
    pressured.campaignAirframeHealthScale = 1.08;
  } else {
    pressured.campaignLoadoutScale = 1;
    pressured.campaignAirframeHealthScale = 1;
  }
  return pressured;
}

function addStrikePair(config) {
  const next = { ...config };
  if (Number.isInteger(next.hostiles)) next.hostiles += 2;
  if (Array.isArray(next.hostileComposition)) {
    next.hostileComposition = [...next.hostileComposition, 'su27', 'su27'];
  }
  if (Array.isArray(next.hostileRoles)) {
    next.hostileRoles = [...next.hostileRoles, 'strike', 'strike'];
  }
  return next;
}

function disableReinforcements(config) {
  return {
    ...config,
    encounters: Array.isArray(config.encounters)
      ? config.encounters.map(encounter => ({ ...encounter, probability: 0 }))
      : config.encounters,
  };
}

function applyCampaignHistory(mission, state, chapter) {
  const flags = new Set(state.flags ?? []);
  let resolved = { ...mission };

  if (state.chapterIndex >= 2 && !flags.has('relay-protected')) {
    resolved.campaignRadarRangeScale *= .78;
  }

  if (chapter.id === 'first-wave' && !flags.has('main-axis-confirmed')) {
    resolved = addStrikePair(resolved);
    resolved.variants = (resolved.variants ?? []).map(variant => ({
      ...variant,
      changes: addStrikePair(variant.changes ?? {}),
    }));
  }

  if (chapter.id === 'counterstroke' && flags.has('relay-logistics-broken')) {
    resolved.variants = (resolved.variants ?? []).map(variant => disableReinforcements(variant));
  }

  if (chapter.id === 'counterstroke' && flags.has('counterattack-window-open')) {
    resolved.campaignDefenseFrontOffset += 600;
  }

  if (chapter.id === 'border-holds' && flags.has('border-line-stabilized')) {
    resolved.groundFriendlyTrucks = (resolved.groundFriendlyTrucks ?? 0) + 2;
    resolved.campaignFriendlyGroundHealthScale *= 1.1;
    resolved.campaignDefenseFrontOffset += 1000;
  }

  return resolved;
}

function tuneOperationalObjective(objective, difficulty, hostileCount) {
  const tuned = clone(objective);
  if (tuned.type === 'staged') {
    tuned.stages = (tuned.stages ?? []).map(stage => tuneOperationalObjective(stage, difficulty, hostileCount));
    return tuned;
  }
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

function applySustainmentChoice(mission, chapter, state) {
  const choice = chapter.sustainmentDecision?.choices?.find(item => item.id === state.sustainmentChoice);
  if (!choice?.mission) return mission;
  const resolved = { ...mission, ...clone(choice.mission) };
  const ito90SupportCount = choice.mission.groundIto90SupportCount;
  if (Number.isFinite(ito90SupportCount)) {
    resolved.groundIto90Count = (resolved.groundIto90Count ?? 0) + ito90SupportCount;
    resolved.variants = (resolved.variants ?? []).map(variant => {
      if (!Number.isFinite(variant.changes?.groundIto90Count)) return variant;
      return {
        ...variant,
        changes: {
          ...variant.changes,
          groundIto90Count: variant.changes.groundIto90Count + ito90SupportCount,
        },
      };
    });
  }
  return resolved;
}

function getSelectedSustainmentChoice(chapter, state) {
  return chapter.sustainmentDecision?.choices?.find(item => item.id === state.sustainmentChoice) ?? null;
}

function resolveCampaignOptionalObjectives(chapter, mission, sustainmentChoice) {
  const authored = Array.isArray(chapter.optionalObjectives)
    ? chapter.optionalObjectives
    : mission.optionalObjectives ?? [];
  const difficulty = mission.campaignDifficulty ?? 'standard';
  const objectives = authored.map(objective => {
    const resolved = {
      ...clone(objective),
      ...(objective.requiredByDifficulty?.[difficulty] !== undefined
        ? { required: objective.requiredByDifficulty[difficulty] }
        : {}),
    };
    return {
      ...resolved,
    ...(objective.target ? { target: clone(objective.target) } : {}),
    ...(objective.zone ? { zone: clone(objective.zone) } : {}),
    };
  });
  const supportObjective = sustainmentChoice?.optionalObjectiveByChapter?.[chapter.id]
    ?? sustainmentChoice?.optionalObjective;
  if (supportObjective) objectives.push({
    ...clone(supportObjective),
    ...(supportObjective.target ? { target: clone(supportObjective.target) } : {}),
    ...(supportObjective.zone ? { zone: clone(supportObjective.zone) } : {}),
  });
  return objectives;
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
    const tuned = tuneVariant(variant, state.difficulty, state.airControl);
    tuned.changes = applyAirControlPressure(tuned.changes, state.airControl, true);
    return tuned;
  });
  mission = applyMissionOverrides(mission, chapter.missionOverrides, state.difficulty);
  mission = applyDefenseIntegrityPressure(mission, state.defenseIntegrity);
  mission = applyReadinessPressure(mission, state.sortieReadiness);
  mission = applyCampaignHistory(mission, state, chapter);
  mission = applySustainmentChoice(mission, chapter, state);
  const sustainmentChoice = getSelectedSustainmentChoice(chapter, state);
  mission.campaignSupportId = sustainmentChoice?.id ?? null;
  mission.campaignSupport = clone(sustainmentChoice?.mission?.campaignSupport ?? null);
  if (Number.isFinite(chapter.timeOfDay)) {
    const weather = typeof mission.weather === 'string'
      ? { preset: mission.weather }
      : { ...(mission.weather ?? {}) };
    mission.weather = { ...weather, timeOfDay: chapter.timeOfDay };
  }
  const baseWingmanCount = mission.wingmen;
  const readinessWingmanDelta = state.sortieReadiness < 35 ? -1 : state.sortieReadiness >= 80 ? 1 : 0;
  const maximumWingmen = mission.campaignWingmanDelta ? 4 : 3;
  mission.wingmen = Math.max(1, Math.min(maximumWingmen, mission.wingmen + readinessWingmanDelta + (mission.campaignWingmanDelta ?? 0)));
  const addedWingmanCount = Math.max(0, mission.wingmen - baseWingmanCount);
  const addedWingmanRadioIds = [];
  if (mission.campaignWingmanDelta) addedWingmanRadioIds.push('wingman3');
  if (readinessWingmanDelta > 0) addedWingmanRadioIds.push('owl');
  if (mission.campaignWingmanRadioId) addedWingmanRadioIds.push(mission.campaignWingmanRadioId);
  mission.campaignBaseWingmen = baseWingmanCount;
  mission.campaignWingmanRadioIds = addedWingmanRadioIds.slice(-addedWingmanCount);

  Object.assign(mission, {
    campaignId: definition.id,
    campaignChapterId: chapter.id,
    campaignAttemptId: state.currentAttemptId,
    displayTitleKey: chapter.titleKey,
    campaignRadioBriefingKey: chapter.radioBriefingKey,
    campaignDifficulty: state.difficulty,
  });

  const preview = resolveMissionVariant(mission, seed);
  const optionalObjectives = resolveCampaignOptionalObjectives(chapter, mission, sustainmentChoice);
  mission.campaignOptionalObjectives = optionalObjectives;
  mission.optionalObjectives = optionalObjectives;
  preview.mission.campaignOptionalObjectives = optionalObjectives;
  preview.mission.optionalObjectives = optionalObjectives.map(objective => ({
    ...clone(objective),
    ...(objective.target ? { target: clone(objective.target) } : {}),
    ...(objective.zone ? { zone: clone(objective.zone) } : {}),
  }));
  if (Number.isFinite(chapter.timeOfDay)) {
    const weather = typeof preview.mission.weather === 'string'
      ? { preset: preview.mission.weather }
      : { ...(preview.mission.weather ?? {}) };
    preview.mission.weather = { ...weather, timeOfDay: chapter.timeOfDay };
  }

  return {
    campaignId: definition.id,
    chapter,
    areaId: chapter.areaId,
    attemptId: state.currentAttemptId,
    seed: Number(seed) >>> 0,
    mission,
    preview,
  };
}

