/** Returns true when a point or the segment leading to it touches a circular zone. */
export function segmentIntersectsCircle(previous, current, center, radius) {
  if (!current || !center || !(radius > 0)) return false;

  const currentX = current.x - center.x;
  const currentZ = current.z - center.z;
  const radiusSquared = radius * radius;
  if (currentX * currentX + currentZ * currentZ <= radiusSquared) return true;
  if (!previous) return false;

  const previousX = previous.x - center.x;
  const previousZ = previous.z - center.z;
  if (previousX * previousX + previousZ * previousZ <= radiusSquared) return true;

  const segmentX = current.x - previous.x;
  const segmentZ = current.z - previous.z;
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  if (lengthSquared <= 0) return false;

  const projection = Math.max(0, Math.min(1,
    -(previousX * segmentX + previousZ * segmentZ) / lengthSquared,
  ));
  const closestX = previousX + segmentX * projection;
  const closestZ = previousZ + segmentZ * projection;
  return closestX * closestX + closestZ * closestZ <= radiusSquared;
}
