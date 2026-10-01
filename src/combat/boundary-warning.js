/** Returns the nearest operational edge the aircraft is actively closing on. */
export function getBoundaryApproach(position, velocity, bounds, warningRange = 5_000, minimumOutwardSpeed = 25) {
  let clearance = Infinity;

  const consider = (distance, outwardSpeed) => {
    if (outwardSpeed <= minimumOutwardSpeed || distance < 0 || distance > warningRange) return;
    clearance = Math.min(clearance, distance);
  };

  consider(bounds.maxX - position.x, velocity.x);
  consider(position.x - bounds.minX, -velocity.x);
  consider(bounds.maxZ - position.z, velocity.z);
  consider(position.z - bounds.minZ, -velocity.z);

  return Number.isFinite(clearance) ? { clearance } : null;
}
