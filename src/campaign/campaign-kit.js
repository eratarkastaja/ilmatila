export const KIT_LIMITS = Object.freeze({
  hardpoints: 10,
  internalHardpoints: 4,
  externalHardpoints: 6,
  payloadKg: 4200,
  maxFuelMinutes: 480,
});

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

export function getKitLimits(difficulty = 'standard') {
  return {
    ...KIT_LIMITS,
    hardpoints: difficulty === 'easy' ? 12 : KIT_LIMITS.hardpoints,
    externalHardpoints: difficulty === 'easy' ? 8 : KIT_LIMITS.externalHardpoints,
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
  const keys = ['airMissiles', 'groundMissiles', 'gunRounds', 'flares', 'chaff', 'fuelMinutes'];
  for (const key of keys) {
    if (stores[key] !== null && (!Number.isFinite(stores[key]) || stores[key] < 0)) return false;
    if (Number.isFinite(inventory?.[key]) && stores[key] > inventory[key]) return false;
  }
  if (!AIR_WEAPON_OPTIONS[stores.airMissileType] || !GROUND_WEAPON_OPTIONS[stores.groundMissileType]) return false;
  return getKitHardpoints(stores) <= limits.hardpoints && getKitWeight(stores) <= limits.payloadKg;
}

export function getRecommendedKit(inventory, mission = {}) {
  const support = mission.groundBattle || mission.objective?.type === 'logisticsStrike';
  return {
    ...inventory,
    airMissiles: Math.min(inventory.airMissiles ?? 0, support ? 4 : 6),
    groundMissiles: Math.min(inventory.groundMissiles ?? 0, support ? 4 : 2),
    airMissileType: 'amraam',
    groundMissileType: support ? 'aargm' : 'stormbreaker',
    gunRounds: inventory.gunRounds,
    fuelMinutes: inventory.fuelMinutes === null
      ? null
      : Math.min(inventory.fuelMinutes ?? KIT_LIMITS.maxFuelMinutes, mission.navigationDistance > 5500 ? 300 : 240),
  };
}
