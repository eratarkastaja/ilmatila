import * as THREE from 'three';

/** Fades the world-space boundary marker in only near the operational edge. */
export function getBoundaryLineFade(clearance) {
  if (!Number.isFinite(clearance)) return 0;
  return 1 - THREE.MathUtils.smoothstep(Math.max(0, clearance), 1_500, 6_000);
}

/** Returns the nearest operational edge the aircraft is actively closing on. */
export function getBoundaryApproach(position, velocity, bounds, warningRange = 5_000, minimumOutwardSpeed = 25, result) {
  let clearance = Infinity;
  let distance = bounds.maxX - position.x;
  if (velocity.x > minimumOutwardSpeed && distance >= 0 && distance <= warningRange) clearance = distance;
  distance = position.x - bounds.minX;
  if (-velocity.x > minimumOutwardSpeed && distance >= 0 && distance <= warningRange) clearance = Math.min(clearance, distance);
  distance = bounds.maxZ - position.z;
  if (velocity.z > minimumOutwardSpeed && distance >= 0 && distance <= warningRange) clearance = Math.min(clearance, distance);
  distance = position.z - bounds.minZ;
  if (-velocity.z > minimumOutwardSpeed && distance >= 0 && distance <= warningRange) clearance = Math.min(clearance, distance);

  if (!Number.isFinite(clearance)) return null;
  const approach = result ?? {};
  approach.clearance = clearance;
  return approach;
}
