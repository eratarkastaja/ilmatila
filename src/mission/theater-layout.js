/** Applies source-authored theater limits without mutating the mission definition. */
export function resolveTheaterMissionLayout(mission, terrain) {
  const layout = terrain?.sortieLayout;
  if (!mission?.groundBattle || !layout) return mission;

  const resolved = { ...mission };
  if (Number.isFinite(layout.battlefieldIngressOffset)) {
    resolved.battlefieldIngressOffset = Math.max(0, layout.battlefieldIngressOffset);
  }
  if (Number.isFinite(layout.maximumGroundFrontSpan) && Number.isFinite(mission.groundFrontSpan)) {
    resolved.groundFrontSpan = Math.min(mission.groundFrontSpan, layout.maximumGroundFrontSpan);
  }
  if (Number.isFinite(layout.maximumConvoyArea) && Number.isFinite(mission.convoyArea)) {
    resolved.convoyArea = Math.min(mission.convoyArea, layout.maximumConvoyArea);
  }
  return resolved;
}
