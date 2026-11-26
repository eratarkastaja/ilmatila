export const KIT_LIMITS = Object.freeze({
  hardpoints: 10,
  internalHardpoints: 4,
  externalHardpoints: 6,
  payloadKg: 4200,
  maxFuelMinutes: 480,
});

// This is the boundary between campaign persistence, the standalone menu and
// the combat loadout. Keep it in the shared kit module so those systems cannot
// silently grow different store sets.
export const KIT_STORE_KEYS = Object.freeze([
  'airMissiles', 'groundMissiles', 'gunRounds', 'flares', 'chaff', 'fuelMinutes',
]);
export const KIT_TYPE_KEYS = Object.freeze(['airMissileType', 'groundMissileType']);

export const AIR_WEAPON_OPTIONS = Object.freeze({
  amraam: Object.freeze({ designation: 'AIM-120D-3 · AMRAAM', massKg: 161 }),
  sidewinder: Object.freeze({ designation: 'AIM-9X Block II+', massKg: 85 }),
});

export const GROUND_WEAPON_OPTIONS = Object.freeze({
  jassm: Object.freeze({ designation: 'AGM-158B · JASSM-ER', massKg: 1020 }),
  aargm: Object.freeze({ designation: 'AGM-88G · AARGM-ER', massKg: 361 }),
  stormbreaker: Object.freeze({ designation: 'GBU-53/B · STORMBREAKER', massKg: 93 }),
  jdam: Object.freeze({ designation: 'GBU-31 · JDAM', massKg: 908 }),
});

const ITEM_WEIGHT = Object.freeze({ gunRounds: .018, flares: 1, chaff: 1 });

export function getKitLimits(difficulty = 'standard', mission = {}) {
  const extraHardpoints = Number.isInteger(mission?.campaignKitHardpointDelta)
    ? Math.max(0, mission.campaignKitHardpointDelta)
    : 0;
  const extraPayload = Number.isFinite(mission?.campaignKitPayloadDeltaKg)
    ? Math.max(0, mission.campaignKitPayloadDeltaKg)
    : 0;
  return {
    ...KIT_LIMITS,
    hardpoints: (difficulty === 'easy' ? 12 : KIT_LIMITS.hardpoints) + extraHardpoints,
    externalHardpoints: (difficulty === 'easy' ? 8 : KIT_LIMITS.externalHardpoints) + extraHardpoints,
    payloadKg: KIT_LIMITS.payloadKg + extraPayload,
  };
}

function getWeaponMass(stores, domain) {
  const options = domain === 'air' ? AIR_WEAPON_OPTIONS : GROUND_WEAPON_OPTIONS;
  const type = domain === 'air' ? stores?.airMissileType : stores?.groundMissileType;
  const fallback = domain === 'air' ? 'amraam' : 'stormbreaker';
  return options[type]?.massKg ?? options[fallback].massKg;
}

export function getKitWeight(stores) {
  const genericWeight = Object.entries(ITEM_WEIGHT).reduce((total, [key, weight]) => (
    total + (Number.isFinite(stores?.[key]) ? stores[key] * weight : 0)
  ), 0);
  return genericWeight
    + (Number.isFinite(stores?.airMissiles) ? stores.airMissiles * getWeaponMass(stores, 'air') : 0)
    + (Number.isFinite(stores?.groundMissiles) ? stores.groundMissiles * getWeaponMass(stores, 'ground') : 0)
    + (Number.isFinite(stores?.fuelMinutes) ? stores.fuelMinutes * 8 : 0);
}

export function getKitHardpoints(stores) {
  return (stores?.airMissiles ?? 0) + (stores?.groundMissiles ?? 0);
}

export function validateKit(stores, inventory, limits = KIT_LIMITS) {
  if (!stores || typeof stores !== 'object' || Array.isArray(stores)) return false;
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) return false;
  if (!limits || !Number.isInteger(limits.hardpoints) || limits.hardpoints < 0
    || !Number.isFinite(limits.payloadKg) || limits.payloadKg < 0) return false;
  const allowedKeys = new Set([...KIT_STORE_KEYS, ...KIT_TYPE_KEYS]);
  if (Object.keys(stores).some(key => !allowedKeys.has(key))) return false;
  if (KIT_STORE_KEYS.some(key => !Object.hasOwn(stores, key) || !Object.hasOwn(inventory, key))) return false;
  for (const key of KIT_STORE_KEYS) {
    const value = stores[key];
    const capacity = inventory[key];
    if (value === null) {
      // null is the explicit unlimited-inventory representation. A finite
      // inventory can never be bypassed by writing null into a saved kit.
      if (capacity !== null) return false;
      continue;
    }
    if (!Number.isInteger(value) || value < 0) return false;
    if (capacity === null) continue;
    const validCapacity = key === 'fuelMinutes'
      ? Number.isFinite(capacity) && capacity >= 0
      : Number.isInteger(capacity) && capacity >= 0;
    if (!validCapacity || value > capacity) return false;
  }
  if (typeof stores.airMissileType !== 'string'
    || typeof stores.groundMissileType !== 'string'
    || !AIR_WEAPON_OPTIONS[stores.airMissileType]
    || !GROUND_WEAPON_OPTIONS[stores.groundMissileType]) return false;
  return getKitHardpoints(stores) <= limits.hardpoints && getKitWeight(stores) <= limits.payloadKg;
}

export function getRecommendedKit(inventory, mission = {}) {
  const support = mission.groundBattle || mission.objective?.type === 'logisticsStrike';
  const extraAirCapacity = Number.isInteger(mission.campaignKitHardpointDelta)
    ? Math.max(0, mission.campaignKitHardpointDelta)
    : 0;
  return {
    ...inventory,
    airMissiles: Math.min(inventory.airMissiles ?? 0, (support ? 4 : 6) + extraAirCapacity),
    groundMissiles: Math.min(inventory.groundMissiles ?? 0, support ? 4 : 2),
    airMissileType: 'amraam',
    groundMissileType: support ? 'aargm' : 'stormbreaker',
    gunRounds: inventory.gunRounds,
    fuelMinutes: inventory.fuelMinutes === null
      ? null
      : Math.min(inventory.fuelMinutes ?? KIT_LIMITS.maxFuelMinutes, mission.navigationDistance > 5500 ? 300 : 240),
  };
}

function fitPreset(candidate, inventory, limits) {
  const next = { ...candidate };
  const reduce = ['groundMissiles', 'airMissiles', 'fuelMinutes'];
  while (!validateKit(next, inventory, limits)) {
    const key = reduce.find(item => Number.isInteger(next[item]) && next[item] > 0);
    if (!key) return getRecommendedKit(inventory, {});
    next[key] = Math.max(0, next[key] - (key === 'fuelMinutes' ? 15 : 1));
  }
  return next;
}

/** Returns three valid starting points; manual editing remains available. */
export function getKitPresets(inventory, mission = {}, limits = getKitLimits('standard', mission)) {
  const balanced = getRecommendedKit(inventory, mission);
  const light = {
    ...balanced,
    airMissiles: Math.min(balanced.airMissiles, 2),
    groundMissiles: Math.min(balanced.groundMissiles, 1),
    fuelMinutes: balanced.fuelMinutes === null ? null : Math.min(balanced.fuelMinutes, 180),
  };
  const heavy = {
    ...balanced,
    airMissiles: Math.min(inventory.airMissiles ?? 0, mission.groundBattle ? 6 : 8),
    groundMissiles: Math.min(inventory.groundMissiles ?? 0, mission.groundBattle ? 4 : 3),
    fuelMinutes: inventory.fuelMinutes === null ? null : Math.min(inventory.fuelMinutes ?? 0, 240),
  };
  return {
    light: fitPreset(light, inventory, limits),
    balanced: fitPreset(balanced, inventory, limits),
    heavy: fitPreset(heavy, inventory, limits),
  };
}
