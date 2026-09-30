const clamp01 = value => Math.max(0, Math.min(1, value));

function smoothstep(value, edge0, edge1) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Updates the shared visual and handling condition used by player and AI aircraft. */
export function applyAirframeCondition(mesh, hull, maxHull) {
  if (!mesh?.userData) return 1;
  const health = clamp01(hull / Math.max(1, maxHull));
  const smoke = smoothstep(0.5 - health, 0, 0.38);
  const controlDegradation = 1 - smoothstep(health, 0, 0.3);

  mesh.userData.airframeHealthRatio = health;
  mesh.userData.damageSmokeSeverity = smoke;
  mesh.userData.handlingFactor = 1 - controlDegradation * 0.38;
  return health;
}
