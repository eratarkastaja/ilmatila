import { DIFFICULTY_PRESETS } from '../combat/difficulty.js';
import { MISSIONS } from '../mission/missions.js';

const number = (min, max, integer = false) => ({ type: 'number', min, max, integer });
const string = { type: 'string' };
const boolean = { type: 'boolean' };
const array = item => ({ type: 'array', item });
const optional = schema => ({ ...schema, optional: true });
const object = shape => ({ type: 'object', shape });
const ammoCapacity = { type: 'ammoCapacity' };
const nullableNumber = (min, max, integer = false) => ({ type: 'nullableNumber', min, max, integer });
const REQUIRED_DIFFICULTY_IDS = ['easy', 'standard', 'hard'];
const REQUIRED_MISSION_IDS = ['intercept', 'patrol', 'support', 'training'];
const OPTIONAL_OBJECTIVE_FIELDS = {
  allWingmenSurvive: [],
  noDamage: [],
  destroyOptionalGroundTarget: ['target'],
  completeBeforeTime: ['limitSeconds'],
  preserveMissiles: ['minimumRemaining'],
  protectFriendlyGroundUnit: ['target'],
  interceptBeforeZone: ['target', 'zoneRadius'],
};
const OPTIONAL_OBJECTIVE_COLLECTIONS = {
  destroyOptionalGroundTarget: 'groundHostiles',
  protectFriendlyGroundUnit: 'friendlyGround',
  interceptBeforeZone: 'airHostiles',
};

const difficultySchema = object({
  id: string,
  player: object({
    hull: number(1, 500),
    countermeasures: number(0, 100, true),
    weapons: object({
      airMissiles: number(0, 100, true),
      groundMissiles: number(0, 100, true),
      gunRounds: ammoCapacity,
    }),
    fuel: object({
      enduranceMinutes: nullableNumber(1, 10000, true),
      afterburnerMultiplier: number(1, 20),
    }),
    chaff: object({
      count: number(0, 100, true),
      cooldown: number(.05, 120),
      radarTrackBreakChance: number(0, 1),
      radarMissileBreakChance: number(0, 1),
      radarTrackDisruptionDuration: number(0, 60),
      radarMissileDisruptionDuration: number(0, 60),
      radarMissileEffectRange: number(0, 50000),
      radarTrackReevaluationCooldown: number(0, 120),
    }),
    incomingDamage: number(.05, 5),
  }),
  fighter: object({
    health: number(.1, 5),
    aimSpread: number(.1, 10),
    openingDelayScale: number(0, 3),
    passRangeScale: number(.1, 5),
    detection: object({ range: number(100, 50000), reactionDelay: number(0, 60) }),
    gun: object({
      maxRange: number(100, 20000), boresight: number(0, 1), leadTime: number(0, 30),
      cooldown: number(.05, 60), cooldownJitter: number(0, 60),
      burstMin: number(1, 100, true), burstMax: number(1, 100, true), burstInterval: number(.01, 10),
    }),
    handling: object({
      attackTurnRate: number(0, 10), defensiveTurnRate: number(0, 10), defensivePitchRate: number(0, 10),
    }),
    evasion: object({
      lockChance: number(0, 1), countermeasureChance: number(0, 1),
      lockDuration: number(0, 60), missileDuration: number(0, 60),
      countermeasureFollowupChance: number(0, 1), countermeasureCapacity: number(0, 100, true),
      countermeasureCooldown: number(.05, 120),
      tacticalManeuver: object({
        cooldown: number(.05, 120), jitter: number(0, 120), chance: number(0, 1), range: number(0, 50000),
      }),
      evasiveClimb: object({ min: number(0, 10000), max: number(0, 15000) }),
    }),
    targeting: object({
      airPriorityRange: number(0, 100000),
      focusFireLimit: optional(number(1, 12, true)),
      lowEnergyFocusFireLimit: optional(number(1, 12, true)),
      lowEnergySpeed: optional(number(0, 1000)),
      lowEnergyAltitudeMargin: optional(number(0, 5000)),
      groundStrafe: object({ range: number(0, 50000), chance: number(0, 1), cooldown: number(.05, 120) }),
    }),
    missile: object({
      capacity: number(0, 100, true), initialDelay: number(0, 120), cooldown: number(.05, 120),
      cooldownJitter: number(0, 120), minRange: number(0, 50000), maxRange: number(0, 50000),
      boresight: number(0, 1), leadTime: number(0, 60),
      projectile: object({
        speed: number(1, 3000), turnRate: number(.01, 10), burnTime: number(0, 60),
        life: number(.1, 120), coastDrag: number(0, 3), damage: number(0, 500),
        proximityRadius: number(0, 500),
      }),
    }),
  }),
  wingman: object({
    damage: number(0, 10), aimSpread: number(.1, 10),
    airMissile: object({
      capacity: number(0, 100, true), cooldown: number(.05, 120),
      minRange: number(0, 50000), maxRange: number(0, 50000),
    }),
  }),
  groundAA: object({
    initialDelay: number(0, 120), initialJitter: number(0, 120), maxRange: number(1, 10000),
    cooldown: number(.05, 120), cooldownJitter: number(0, 120),
    burstRounds: number(1, 100, true), burstInterval: number(.01, 10), burstScale: number(0, 10),
    dispersionScale: number(0, 10), altitudeScale: number(0, 3), damageMultiplier: number(0, 10),
    stopToFireChance: number(0, 1), t72StopToFireChance: number(0, 1),
    shilka: object({
      rangeScale: number(0, 10), altitudeScale: number(0, 3), burstScale: number(0, 10),
      cooldownScale: number(0, 10), damageScale: number(0, 10), dispersionScale: number(0, 10),
    }),
  }),
});

const missionSchema = object({
  id: string,
  unlocks: array(string),
  deferredHostiles: boolean,
  navigationDistance: number(1, 100000),
  navigationRadius: number(1, 10000),
  ingressAltitudeAgl: optional(number(1, 10000)),
  departureDuration: number(0, 120),
  hostiles: number(0, 100, true),
  hostileSpawnDistance: optional(number(1, 100000)),
  hostileMinimumSpawnDistance: optional(number(1, 100000)),
  hostileLateralSpacing: optional(number(1, 20000)),
  hostileStagingDistance: optional(number(1, 100000)),
  openingDelay: optional(number(0, 300)),
  hostileComposition: optional(array(string)),
  hostileEntry: optional(string),
  wingmen: number(0, 10, true),
  groundBattle: boolean,
  groundPairs: number(0, 200, true),
  groundTrucks: number(0, 500, true),
  groundFriendlyTrucks: optional(number(0, 500, true)),
  groundFrontSpan: number(0, 100000),
  convoyArea: number(0, 100000),
  hostileHelicopters: optional(number(0, 100, true)),
  hostileHelicopterSpawnDistance: optional(number(1, 100000)),
  hostileHelicopterMinimumSpawnDistance: optional(number(1, 100000)),
  hostileHelicopterLateralSpacing: optional(number(1, 20000)),
  hostileHelicopterSpawnAltitude: optional(number(1, 10000)),
  groundIto90Count: optional(number(0, 100, true)),
  groundShilkaCount: optional(number(0, 100, true)),
  battlefieldIngressOffset: optional(number(0, 50000)),
  objective: { type: 'objective' },
  optionalObjectives: optional(array({ type: 'optionalObjective' })),
  variants: optional(array({ type: 'missionVariant' })),
});

const MISSION_VARIANT_CHANGE_FIELDS = new Set([
  'navigationDistance', 'navigationRadius', 'ingressAltitudeAgl', 'departureDuration',
  'hostiles', 'hostileSpawnDistance', 'hostileMinimumSpawnDistance', 'hostileLateralSpacing',
  'hostileStagingDistance', 'openingDelay', 'hostileComposition', 'hostileEntry',
  'groundPairs', 'groundTrucks', 'groundFriendlyTrucks', 'groundFrontSpan', 'convoyArea',
  'hostileHelicopters', 'hostileHelicopterSpawnDistance', 'hostileHelicopterMinimumSpawnDistance',
  'hostileHelicopterLateralSpacing', 'hostileHelicopterSpawnAltitude', 'groundIto90Count',
  'groundShilkaCount', 'battlefieldIngressOffset', 'objective', 'optionalObjectives',
]);

const reinforcementSchema = object({
  probability: number(0, 1),
  delaySeconds: number(5, 600),
  hostiles: number(1, 20, true),
  composition: array(string),
  spawnDistance: optional(number(1, 100000)),
  minimumSpawnDistance: optional(number(1, 100000)),
  lateralSpacing: optional(number(1, 20000)),
  entry: optional(string),
});

function validateNode(value, schema, path, errors) {
  if (schema.optional && value === undefined) return;
  if (schema.type === 'ammoCapacity') {
    if (value === null) return;
    if (!Number.isInteger(value) || value < 0 || value > 100000) {
      errors.push(`${path} must be null or an integer between 0 and 100000`);
    }
    return;
  }
  if (schema.type === 'nullableNumber') {
    if (value === null) return;
    validateNode(value, number(schema.min, schema.max, schema.integer), path, errors);
    return;
  }
  if (schema.type === 'optionalObjective') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${path} must be an object`);
    }
    return;
  }
  if (schema.type === 'missionVariant') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${path} must be an object`);
    }
    return;
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${path} must be an object`);
      return;
    }
    for (const [key, childSchema] of Object.entries(schema.shape)) {
      validateNode(value[key], childSchema, `${path}.${key}`, errors);
    }
    for (const key of Object.keys(value)) {
      if (!(key in schema.shape)) errors.push(`${path}.${key} is not a recognized setting`);
    }
    return;
  }
  if (schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`${path} must be a finite number`);
      return;
    }
    if (value < schema.min || value > schema.max) {
      errors.push(`${path} must be between ${schema.min} and ${schema.max}`);
    }
    if (schema.integer && !Number.isInteger(value)) errors.push(`${path} must be an integer`);
    return;
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string' || value.length === 0) errors.push(`${path} must be a non-empty string`);
    return;
  }
  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') errors.push(`${path} must be a boolean`);
    return;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array`);
      return;
    }
    value.forEach((item, index) => validateNode(item, schema.item, `${path}[${index}]`, errors));
  }
}

function validateObjective(objective, path, errors) {
  if (!objective || typeof objective !== 'object' || Array.isArray(objective)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!['clearAir', 'support', 'training'].includes(objective.type)) {
    errors.push(`${path}.type must be clearAir, support, or training`);
    return;
  }
  const keys = objective.type === 'training' ? ['type', 'duration'] : ['type'];
  for (const key of keys) {
    if (!(key in objective)) errors.push(`${path}.${key} is required`);
  }
  for (const key of Object.keys(objective)) {
    if (!keys.includes(key)) errors.push(`${path}.${key} is not valid for ${objective.type}`);
  }
  if (objective.type === 'training') validateNode(objective.duration, number(1, 3600), `${path}.duration`, errors);
}

function validateOptionalObjectiveTarget(target, path, expectedCollection, errors) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const allowedKeys = ['collection', 'index', 'role', 'team', 'armed', 'labelKey'];
  for (const key of Object.keys(target)) {
    if (!allowedKeys.includes(key)) errors.push(`${path}.${key} is not a recognized target selector setting`);
  }
  if (target.collection !== expectedCollection) {
    errors.push(`${path}.collection must be ${expectedCollection}`);
  }
  if (target.index !== undefined) validateNode(target.index, number(0, 500, true), `${path}.index`, errors);
  if (target.role !== undefined) validateNode(target.role, string, `${path}.role`, errors);
  if (target.team !== undefined) validateNode(target.team, string, `${path}.team`, errors);
  if (target.armed !== undefined) validateNode(target.armed, boolean, `${path}.armed`, errors);
  if (target.labelKey !== undefined) validateNode(target.labelKey, string, `${path}.labelKey`, errors);
}

function validateOptionalObjectives(objectives, path, errors) {
  if (!Array.isArray(objectives)) {
    errors.push(`${path} must be an array`);
    return;
  }
  const ids = new Set();
  objectives.forEach((objective, index) => {
    const objectivePath = `${path}[${index}]`;
    if (!objective || typeof objective !== 'object' || Array.isArray(objective)) {
      errors.push(`${objectivePath} must be an object`);
      return;
    }
    validateNode(objective.id, string, `${objectivePath}.id`, errors);
    if (ids.has(objective.id)) errors.push(`${path} contains duplicate id "${objective.id}"`);
    ids.add(objective.id);
    const expectedFields = OPTIONAL_OBJECTIVE_FIELDS[objective.type];
    if (!expectedFields) {
      errors.push(`${objectivePath}.type is not a recognized optional objective type`);
      return;
    }
    if (!('type' in objective)) errors.push(`${objectivePath}.type is required`);
    const allowedFields = ['id', 'type', ...expectedFields];
    for (const key of Object.keys(objective)) {
      if (!allowedFields.includes(key)) errors.push(`${objectivePath}.${key} is not valid for ${objective.type}`);
    }
    for (const key of expectedFields) {
      if (!(key in objective)) errors.push(`${objectivePath}.${key} is required`);
    }
    if (OPTIONAL_OBJECTIVE_COLLECTIONS[objective.type] && objective.target !== undefined) {
      validateOptionalObjectiveTarget(
        objective.target,
        `${objectivePath}.target`,
        OPTIONAL_OBJECTIVE_COLLECTIONS[objective.type],
        errors,
      );
    }
    if (objective.type === 'completeBeforeTime' && objective.limitSeconds !== undefined) {
      validateNode(objective.limitSeconds, number(1, 3600), `${objectivePath}.limitSeconds`, errors);
    }
    if (objective.type === 'preserveMissiles' && objective.minimumRemaining !== undefined) {
      validateNode(objective.minimumRemaining, number(0, 20, true), `${objectivePath}.minimumRemaining`, errors);
    }
    if (objective.type === 'interceptBeforeZone' && objective.zoneRadius !== undefined) {
      validateNode(objective.zoneRadius, number(100, 100000), `${objectivePath}.zoneRadius`, errors);
    }
  });
}

function validateHostileComposition(composition, path, errors) {
  if (composition !== undefined && Array.isArray(composition)) {
    if (composition.length === 0) errors.push(`${path} must contain at least one aircraft type`);
    composition.forEach((aircraft, index) => {
      if (!['su27', 'mig29'].includes(aircraft)) {
        errors.push(`${path}[${index}] must be su27 or mig29`);
      }
    });
  }
}

function validateReinforcement(reinforcement, path, mission, changes, errors) {
  validateNode(reinforcement, reinforcementSchema, path, errors);
  if (!reinforcement || typeof reinforcement !== 'object' || Array.isArray(reinforcement)) return;
  validateHostileComposition(reinforcement.composition, `${path}.composition`, errors);
  if (reinforcement.entry !== undefined && !['staging', 'scramble'].includes(reinforcement.entry)) {
    errors.push(`${path}.entry must be staging or scramble`);
  }
  const spawnDistance = reinforcement.spawnDistance
    ?? changes.hostileSpawnDistance
    ?? mission.hostileSpawnDistance;
  const minimumSpawnDistance = reinforcement.minimumSpawnDistance
    ?? changes.hostileMinimumSpawnDistance
    ?? mission.hostileMinimumSpawnDistance;
  if (spawnDistance !== undefined && minimumSpawnDistance !== undefined
    && minimumSpawnDistance > spawnDistance) {
    errors.push(`${path}.minimumSpawnDistance must not exceed spawnDistance`);
  }
}

function validateMissionVariants(variants, path, mission, errors) {
  if (!Array.isArray(variants)) {
    errors.push(`${path} must be an array`);
    return;
  }
  const ids = new Set();
  variants.forEach((variant, index) => {
    const variantPath = `${path}[${index}]`;
    if (!variant || typeof variant !== 'object' || Array.isArray(variant)) {
      errors.push(`${variantPath} must be an object`);
      return;
    }
    const allowedKeys = ['id', 'labelKey', 'weight', 'changes', 'reinforcement'];
    for (const key of Object.keys(variant)) {
      if (!allowedKeys.includes(key)) errors.push(`${variantPath}.${key} is not a recognized variant setting`);
    }
    validateNode(variant.id, string, `${variantPath}.id`, errors);
    if (ids.has(variant.id)) errors.push(`${path} contains duplicate id "${variant.id}"`);
    ids.add(variant.id);
    validateNode(variant.labelKey, string, `${variantPath}.labelKey`, errors);
    validateNode(variant.weight, number(.001, 1000), `${variantPath}.weight`, errors);
    if (!variant.changes || typeof variant.changes !== 'object' || Array.isArray(variant.changes)) {
      errors.push(`${variantPath}.changes must be an object`);
    } else {
      const changes = variant.changes;
      for (const key of Object.keys(changes)) {
        if (!MISSION_VARIANT_CHANGE_FIELDS.has(key)) {
          errors.push(`${variantPath}.changes.${key} is not allowed`);
          continue;
        }
        if (key === 'objective') {
          validateObjective(changes[key], `${variantPath}.changes.${key}`, errors);
        } else {
          validateNode(changes[key], missionSchema.shape[key], `${variantPath}.changes.${key}`, errors);
        }
      }
      validateHostileComposition(changes.hostileComposition, `${variantPath}.changes.hostileComposition`, errors);
      if (changes.hostileEntry !== undefined && !['staging', 'scramble'].includes(changes.hostileEntry)) {
        errors.push(`${variantPath}.changes.hostileEntry must be staging or scramble`);
      }
      if (changes.optionalObjectives !== undefined) {
        validateOptionalObjectives(changes.optionalObjectives, `${variantPath}.changes.optionalObjectives`, errors);
      }
      if (changes.objective?.type === 'support'
        && (changes.groundBattle === false || (changes.groundPairs ?? mission.groundPairs) < 1)) {
        errors.push(`${variantPath}.changes support objective requires ground pairs`);
      }
      const spawnDistance = changes.hostileSpawnDistance ?? mission.hostileSpawnDistance;
      const minimumSpawnDistance = changes.hostileMinimumSpawnDistance ?? mission.hostileMinimumSpawnDistance;
      if (spawnDistance !== undefined && minimumSpawnDistance !== undefined
        && minimumSpawnDistance > spawnDistance) {
        errors.push(`${variantPath}.changes.hostileMinimumSpawnDistance must not exceed hostileSpawnDistance`);
      }
    }
    if (variant.reinforcement !== undefined) {
      validateReinforcement(variant.reinforcement, `${variantPath}.reinforcement`, mission,
        variant.changes && typeof variant.changes === 'object' ? variant.changes : {}, errors);
    }
  });
}

function validateDifficultyRelations(preset, path, errors) {
  const fighter = preset?.fighter;
  if (fighter?.gun && fighter.gun.burstMin > fighter.gun.burstMax) {
    errors.push(`${path}.fighter.gun.burstMin must not exceed burstMax`);
  }
  if (fighter?.missile && fighter.missile.minRange >= fighter.missile.maxRange) {
    errors.push(`${path}.fighter.missile.minRange must be less than maxRange`);
  }
  if (fighter?.evasion?.evasiveClimb && fighter.evasion.evasiveClimb.min > fighter.evasion.evasiveClimb.max) {
    errors.push(`${path}.fighter.evasion.evasiveClimb.min must not exceed max`);
  }
  if (fighter?.targeting?.focusFireLimit !== undefined
    && fighter.targeting.lowEnergyFocusFireLimit !== undefined
    && fighter.targeting.lowEnergyFocusFireLimit < fighter.targeting.focusFireLimit) {
    errors.push(`${path}.fighter.targeting.lowEnergyFocusFireLimit must not be less than focusFireLimit`);
  }
  if (preset?.wingman?.airMissile && preset.wingman.airMissile.minRange >= preset.wingman.airMissile.maxRange) {
    errors.push(`${path}.wingman.airMissile.minRange must be less than maxRange`);
  }
}

function validateMissionRelations(mission, key, validIds, errors) {
  const path = `missions.${key}`;
  if (!mission || typeof mission !== 'object' || Array.isArray(mission)) return;
  if (mission.id !== key) errors.push(`${path}.id must match its key`);
  validateObjective(mission.objective, `${path}.objective`, errors);
  if (mission.optionalObjectives !== undefined) {
    validateOptionalObjectives(mission.optionalObjectives, `${path}.optionalObjectives`, errors);
  }
  validateHostileComposition(mission.hostileComposition, `${path}.hostileComposition`, errors);
  if (mission.hostileEntry !== undefined && !['staging', 'scramble'].includes(mission.hostileEntry)) {
    errors.push(`${path}.hostileEntry must be staging or scramble`);
  }
  if (mission.variants !== undefined) validateMissionVariants(mission.variants, `${path}.variants`, mission, errors);
  for (const unlock of Array.isArray(mission.unlocks) ? mission.unlocks : []) {
    if (!validIds.has(unlock)) errors.push(`${path}.unlocks contains unknown mission "${unlock}"`);
    if (unlock === key) errors.push(`${path}.unlocks must not contain itself`);
  }
  if ((mission.hostileMinimumSpawnDistance !== undefined) !== (mission.hostileSpawnDistance !== undefined)) {
    errors.push(`${path} must configure hostileSpawnDistance and hostileMinimumSpawnDistance together`);
  }
  if (mission.hostileMinimumSpawnDistance !== undefined && mission.hostileSpawnDistance !== undefined
    && mission.hostileMinimumSpawnDistance > mission.hostileSpawnDistance) {
    errors.push(`${path}.hostileMinimumSpawnDistance must not exceed hostileSpawnDistance`);
  }
  if ((mission.hostileHelicopterMinimumSpawnDistance !== undefined)
    !== (mission.hostileHelicopterSpawnDistance !== undefined)) {
    errors.push(`${path} must configure helicopter spawn and minimum spawn distances together`);
  }
  if (mission.hostileHelicopterMinimumSpawnDistance !== undefined && mission.hostileHelicopterSpawnDistance !== undefined
    && mission.hostileHelicopterMinimumSpawnDistance > mission.hostileHelicopterSpawnDistance) {
    errors.push(`${path}.hostileHelicopterMinimumSpawnDistance must not exceed hostileHelicopterSpawnDistance`);
  }
  if (mission.groundBattle === false && [mission.groundPairs, mission.groundTrucks, mission.groundFriendlyTrucks ?? 0,
    mission.groundFrontSpan, mission.convoyArea, mission.groundIto90Count ?? 0,
    mission.groundShilkaCount ?? 0].some(value => value > 0)) {
    errors.push(`${path} has ground forces configured while groundBattle is false`);
  }
  if (mission.objective?.type === 'support' && (!mission.groundBattle || mission.groundPairs < 1)) {
    errors.push(`${path} support objective requires a ground battle with ground pairs`);
  }
  if (mission.objective?.type === 'training' && mission.hostiles !== 0) {
    errors.push(`${path} training objective must not spawn hostiles`);
  }
}

export function validateDifficultyPresets(difficulties = DIFFICULTY_PRESETS) {
  const errors = [];
  if (!difficulties || typeof difficulties !== 'object' || Array.isArray(difficulties)) {
    return ['difficulties must be an object keyed by preset id'];
  }
  for (const [key, preset] of Object.entries(difficulties)) {
    const path = `difficulties.${key}`;
    validateNode(preset, difficultySchema, path, errors);
    if (preset?.id !== key) errors.push(`${path}.id must match its key`);
    validateDifficultyRelations(preset, path, errors);
  }
  for (const id of REQUIRED_DIFFICULTY_IDS) {
    if (!(id in difficulties)) errors.push(`difficulties.${id} is required`);
  }
  if (Object.keys(difficulties).length === 0) errors.push('difficulties must contain at least one preset');
  return errors;
}

export function validateMissions(missions = MISSIONS) {
  const errors = [];
  if (!missions || typeof missions !== 'object' || Array.isArray(missions)) {
    return ['missions must be an object keyed by mission id'];
  }
  const validIds = new Set(Object.keys(missions));
  for (const [key, mission] of Object.entries(missions)) {
    const path = `missions.${key}`;
    validateNode(mission, missionSchema, path, errors);
    validateMissionRelations(mission, key, validIds, errors);
  }
  for (const id of REQUIRED_MISSION_IDS) {
    if (!(id in missions)) errors.push(`missions.${id} is required`);
  }
  if (validIds.size === 0) errors.push('missions must contain at least one mission');
  return errors;
}

export function validateGameConfig({ difficulties = DIFFICULTY_PRESETS, missions = MISSIONS } = {}) {
  return [...validateDifficultyPresets(difficulties), ...validateMissions(missions)];
}
