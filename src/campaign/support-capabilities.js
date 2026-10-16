/** Campaign support availability is data-driven and independent of combat DOM/state. */
export function isSupportChoiceAvailable(choice, state, chapter) {
  if (!choice || !state || !chapter) return false;
  const requirement = choice.requiredMetric;
  if (requirement) {
    const value = Number(state[requirement.key]);
    if (!Number.isFinite(value) || value < requirement.minimum) return false;
  }
  const mission = choice.mission ?? {};
  const baseMissionId = chapter.baseMissionId;
  if (mission.supportRequiresGroundBattle) {
    const groundBattle = chapter.missionOverrides?.groundBattle
      ?? baseMissionId === 'support';
    if (!groundBattle) return false;
  }
  if (mission.supportRequiresAirCombat && baseMissionId === 'training') return false;
  if (mission.supportRequiresAirCombat && chapter.missionOverrides?.hostileDisposition === 'noncombatant') return false;
  return true;
}
