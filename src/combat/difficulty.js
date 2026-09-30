export const DIFFICULTY_PRESETS = Object.freeze({
  easy: Object.freeze({
    id: 'easy', playerHull: 135, countermeasures: 20, incomingDamage: .72,
    enemyHealth: .82, enemyAimSpread: 1.35, wingmanDamage: 1.15, wingmanAimSpread: .9,
    enemyOpeningDelayScale: .62, enemyPassRangeScale: .88,
    enemyGunMaxRange: 1900, enemyGunBoresight: .91, enemyGunCooldown: 2.4,
    enemyGunCooldownJitter: 1.45, enemyGunBurstMin: 4, enemyGunBurstMax: 6,
    enemyGunBurstInterval: .12, enemyAttackTurnRate: .32,
    enemyDefensiveTurnRate: .54, enemyDefensivePitchRate: .25,
    enemyLockEvasionChance: .18, enemyLockCountermeasureChance: .48,
    enemyLockEvasionDuration: 2.5, enemyMissileEvasionDuration: 3.2,
    enemyMissileCapacity: 1, enemyMissileInitialDelay: 9, enemyMissileCooldown: 19,
    enemyMissileCooldownJitter: 5, enemyMissileMinRange: 3400, enemyMissileMaxRange: 5700,
    enemyMissileBoresight: .95, hostileMissileTurnRate: 1.05,
  }),
  standard: Object.freeze({
    id: 'standard', playerHull: 100, countermeasures: 20, incomingDamage: 1,
    enemyHealth: 1, enemyAimSpread: 1, wingmanDamage: 1, wingmanAimSpread: 1,
    enemyOpeningDelayScale: .44, enemyPassRangeScale: 1.12,
    enemyGunMaxRange: 2500, enemyGunBoresight: .82, enemyGunCooldown: 1.3,
    enemyGunCooldownJitter: 1, enemyGunBurstMin: 6, enemyGunBurstMax: 9,
    enemyGunBurstInterval: .09, enemyAttackTurnRate: .42,
    enemyDefensiveTurnRate: .61, enemyDefensivePitchRate: .29,
    enemyLockEvasionChance: .38, enemyLockCountermeasureChance: .68,
    enemyLockEvasionDuration: 3, enemyMissileEvasionDuration: 3.6,
    enemyMissileCapacity: 2, enemyMissileInitialDelay: 7, enemyMissileCooldown: 14,
    enemyMissileCooldownJitter: 5, enemyMissileMinRange: 3000, enemyMissileMaxRange: 6400,
    enemyMissileBoresight: .93, hostileMissileTurnRate: 1.18,
  }),
  hard: Object.freeze({
    id: 'hard', playerHull: 88, countermeasures: 20, incomingDamage: 1.25,
    enemyHealth: 1.16, enemyAimSpread: .68, wingmanDamage: .9, wingmanAimSpread: 1.1,
    enemyOpeningDelayScale: .22, enemyPassRangeScale: 1.32,
    enemyGunMaxRange: 2850, enemyGunBoresight: .72, enemyGunCooldown: .78,
    enemyGunCooldownJitter: .62, enemyGunBurstMin: 9, enemyGunBurstMax: 13,
    enemyGunBurstInterval: .075, enemyAttackTurnRate: .54,
    enemyDefensiveTurnRate: .82, enemyDefensivePitchRate: .4,
    enemyLockEvasionChance: .72, enemyLockCountermeasureChance: .92,
    enemyLockEvasionDuration: 3.5, enemyMissileEvasionDuration: 4.1,
    enemyMissileCapacity: 3, enemyMissileInitialDelay: 3.2, enemyMissileCooldown: 8,
    enemyMissileCooldownJitter: 3, enemyMissileMinRange: 2400, enemyMissileMaxRange: 8200,
    enemyMissileBoresight: .78, hostileMissileTurnRate: 1.3,
  }),
});

export function getDifficultyPreset(id = 'standard') {
  return DIFFICULTY_PRESETS[id] ?? DIFFICULTY_PRESETS.standard;
}
