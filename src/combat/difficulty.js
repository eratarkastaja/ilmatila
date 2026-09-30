export const DIFFICULTY_PRESETS = Object.freeze({
  easy: Object.freeze({ id: 'easy', playerHull: 135, countermeasures: 16, incomingDamage: .72, enemyHealth: .82, enemyAimSpread: 1.35, wingmanDamage: 1.15, wingmanAimSpread: .9 }),
  standard: Object.freeze({ id: 'standard', playerHull: 100, countermeasures: 12, incomingDamage: 1, enemyHealth: 1, enemyAimSpread: 1, wingmanDamage: 1, wingmanAimSpread: 1 }),
  hard: Object.freeze({ id: 'hard', playerHull: 88, countermeasures: 10, incomingDamage: 1.25, enemyHealth: 1.16, enemyAimSpread: .78, wingmanDamage: .9, wingmanAimSpread: 1.1 }),
});

export function getDifficultyPreset(id = 'standard') {
  return DIFFICULTY_PRESETS[id] ?? DIFFICULTY_PRESETS.standard;
}
