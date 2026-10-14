const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const SECTORS = ['north', 'northeast', 'east', 'southeast', 'southwest', 'west', 'northwest'];

export function resolveCampaignIntel(resolved, state) {
  const mission = resolved?.mission ?? {};
  const flags = new Set(state?.flags ?? []);
  const knownStrength = (mission.hostiles ?? 0) + (mission.hostileHelicopters ?? 0);
  const reliability = clamp(
    52 + ((state?.airControl ?? 50) - 50) * .65
      + (flags.has('relay-protected') ? 14 : 0)
      - (state?.chapterIndex >= 2 && !flags.has('relay-protected') ? 12 : 0),
    28,
    92,
  );
  const spread = reliability >= 75 ? 1 : reliability >= 50 ? 2 : 3;
  const sectorIndex = mission.groundBattle
    ? (state.chapterIndex % 2 ? 3 : 1)
    : (state.chapterIndex % 3 === 0 ? 0 : state.chapterIndex % 3 === 1 ? 6 : 2);
  return {
    sectorKey: `campaign.intel.sector.${SECTORS[sectorIndex]}`,
    minimumStrength: Math.max(1, knownStrength - spread),
    maximumStrength: Math.max(knownStrength + spread, 2),
    reliability: Math.round(reliability),
    samKey: mission.groundShilkaCount > 0
      ? reliability >= 70 ? 'campaign.intel.sam.likely' : 'campaign.intel.sam.uncertain'
      : 'campaign.intel.sam.low',
    reserveKey: mission.variants?.length || mission.hostiles > 2
      ? reliability >= 70 ? 'campaign.intel.reserve.likely' : 'campaign.intel.reserve.uncertain'
      : 'campaign.intel.reserve.low',
  };
}
