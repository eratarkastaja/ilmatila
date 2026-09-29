import * as THREE from 'three';

const inverseWorld = new THREE.Matrix4();
const localStart = new THREE.Vector3();
const localEnd = new THREE.Vector3();
const localDelta = new THREE.Vector3();

/** Segment against the aircraft's authored ellipsoid hit zones, in local space. */
export function traceFighterHit(start, end, fighter) {
  fighter.updateWorldMatrix(true, false);
  inverseWorld.copy(fighter.matrixWorld).invert();
  const a = localStart.copy(start).applyMatrix4(inverseWorld);
  const b = localEnd.copy(end).applyMatrix4(inverseWorld);
  let best = null;

  for (const zone of fighter.userData.hitZones ?? []) {
    const ox = (a.x - zone.x) / zone.rx;
    const oy = (a.y - zone.y) / zone.ry;
    const oz = (a.z - zone.z) / zone.rz;
    const dx = (b.x - a.x) / zone.rx;
    const dy = (b.y - a.y) / zone.ry;
    const dz = (b.z - a.z) / zone.rz;
    const quadratic = dx * dx + dy * dy + dz * dz;
    const linear = 2 * (ox * dx + oy * dy + oz * dz);
    const constant = ox * ox + oy * oy + oz * oz - 1;
    const discriminant = linear * linear - 4 * quadratic * constant;
    const t = constant <= 0
      ? 0
      : quadratic > 1e-9 && discriminant >= 0
        ? (-linear - Math.sqrt(discriminant)) / (2 * quadratic)
        : Infinity;
    if (t >= 0 && t <= 1 && (!best || t < best.t)) best = { t, damage: zone.damage };
  }

  return best;
}

/** Segment against the vehicle's local axis-aligned authored hit bounds. */
export function traceVehicleHit(start, end, vehicle) {
  vehicle.updateWorldMatrix(true, false);
  inverseWorld.copy(vehicle.matrixWorld).invert();
  const a = localStart.copy(start).applyMatrix4(inverseWorld);
  const b = localEnd.copy(end).applyMatrix4(inverseWorld);
  const delta = localDelta.copy(b).sub(a);
  const bounds = vehicle.userData.hitBounds ?? { min: [-10, 0, -12], max: [10, 14, 20] };
  let enter = 0;
  let leave = 1;

  for (let axis = 0; axis < 3; axis++) {
    const key = ['x', 'y', 'z'][axis];
    const velocity = delta[key];
    if (Math.abs(velocity) < 1e-9) {
      if (a[key] < bounds.min[axis] || a[key] > bounds.max[axis]) return null;
      continue;
    }
    let near = (bounds.min[axis] - a[key]) / velocity;
    let far = (bounds.max[axis] - a[key]) / velocity;
    if (near > far) [near, far] = [far, near];
    enter = Math.max(enter, near);
    leave = Math.min(leave, far);
    if (enter > leave) return null;
  }

  return enter <= 1 && leave >= 0 ? { t: Math.max(0, enter), damage: 1 } : null;
}

export function pointSegmentDistanceSquared(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dy * dy + dz * dz;
  const t = lengthSq > 1e-9
    ? THREE.MathUtils.clamp(((point.x - start.x) * dx + (point.y - start.y) * dy + (point.z - start.z) * dz) / lengthSq, 0, 1)
    : 0;
  const x = start.x + dx * t;
  const y = start.y + dy * t;
  const z = start.z + dz * t;
  return (point.x - x) ** 2 + (point.y - y) ** 2 + (point.z - z) ** 2;
}
