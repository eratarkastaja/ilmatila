import * as THREE from 'three';

export const forward = new THREE.Vector3(0, 0, 1);
export const projectileAxis = new THREE.Vector3(0, 1, 0);
export const zeroVelocity = new THREE.Vector3();
export const eventLeadPoint = new THREE.Vector3();
export const eventLeadOffset = new THREE.Vector3();
export const contactOffset = new THREE.Vector3();
export const AIR_SPAWN_BEARINGS = [0, 10, -10, 20, -20, 30, -30, 40, -40, 50, -50, 60, -60, 70, -70, 80, -80, 90, -90];
export const ENEMY_ATTACK_RUNS = [
  { trail: -850, lateral: 260, altitude: 0, passRange: 1450 },
  { trail: -1350, lateral: 540, altitude: 320, passRange: 1650 },
  { trail: -1750, lateral: 430, altitude: -100, passRange: 1850 },
];

export const wrapAngle = angle => THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;

export function flightDirection(heading, pitch, target = new THREE.Vector3()) {
  const horizontal = Math.cos(pitch);
  return target.set(Math.sin(heading) * horizontal, Math.sin(pitch), Math.cos(heading) * horizontal);
}

export function leadPoint(origin, target, targetVelocity, projectileSpeed, maxTime, result=eventLeadPoint, offset=eventLeadOffset) {
  offset.subVectors(target,origin);
  const velocity = targetVelocity ?? zeroVelocity;
  const a = velocity.lengthSq() - projectileSpeed * projectileSpeed;
  const b = 2 * offset.dot(velocity);
  const c = offset.lengthSq();
  const discriminant = b * b - 4 * a * c;
  let time = offset.length() / projectileSpeed;

  if (Math.abs(a) > 1e-6 && discriminant >= 0) {
    const root = Math.sqrt(discriminant);
    const first = (-b - root) / (2 * a);
    const second = (-b + root) / (2 * a);
    const intercept = first > 0 ? first : second > 0 ? second : time;
    if (intercept > 0) time = intercept;
  }

  return result.copy(target).addScaledVector(velocity, THREE.MathUtils.clamp(time, 0, maxTime));
}

export function steerAircraft(unit, target, dt, turnRate, pitchRate, acceleration, speed, maxSpeed) {
  const offset = unit.steeringOffset.subVectors(target,unit.mesh.position);
  const horizontalDistance = Math.max(1, Math.hypot(offset.x, offset.z));
  const desiredHeading = Math.atan2(offset.x, offset.z);
  const yawStep = THREE.MathUtils.clamp(wrapAngle(desiredHeading - unit.heading), -turnRate * dt, turnRate * dt);
  unit.heading = wrapAngle(unit.heading + yawStep);

  const desiredPitch = THREE.MathUtils.clamp(Math.atan2(offset.y, horizontalDistance), -.2, .2);
  unit.pitch += THREE.MathUtils.clamp(desiredPitch - unit.pitch, -pitchRate * dt, pitchRate * dt);
  unit.speed = THREE.MathUtils.clamp(
    unit.speed + THREE.MathUtils.clamp(speed - unit.speed, -acceleration * dt, acceleration * dt),
    0,
    maxSpeed,
  );

  const direction = flightDirection(unit.heading, unit.pitch,unit.direction);
  unit.velocity.copy(direction).multiplyScalar(unit.speed);
  unit.mesh.position.addScaledVector(unit.velocity, dt);
  unit.mesh.rotation.order = 'YXZ';
  unit.mesh.rotation.y = unit.heading;
  unit.mesh.rotation.x = -unit.pitch;
  unit.mesh.rotation.z = THREE.MathUtils.clamp(-(yawStep / Math.max(dt, 1e-4)) * 1.55, -.7, .7);
  return direction;
}

export function rightOfHeading(heading,target=new THREE.Vector3()) {
  return target.set(Math.cos(heading), 0, -Math.sin(heading));
}

export function forwardOfHeading(heading,target=new THREE.Vector3()) {
  return target.set(Math.sin(heading), 0, Math.cos(heading));
}

export function chooseAirSpawnLayout(origin, forward, right, terrain, requestedDistance, minimumDistance, lateralHalfSpan, forwardExtra, margin) {
  const bounds = terrain?.operationBounds;
  const half = (terrain?.worldSize ?? 32000) * 0.5;
  const minX = (bounds?.minX ?? -half) + margin;
  const maxX = (bounds?.maxX ?? half) - margin;
  const minZ = (bounds?.minZ ?? -half) + margin;
  const maxZ = (bounds?.maxZ ?? half) - margin;
  const direction = new THREE.Vector3();
  const lowerBound = Math.min(requestedDistance, minimumDistance);

  // Preserve the requested stand-off first, then fan to either side when the
  // theater edge would otherwise clamp the formation close to the player.
  for (let distance = requestedDistance; distance >= lowerBound; distance -= 250) {
    for (const degrees of AIR_SPAWN_BEARINGS) {
      const angle = THREE.MathUtils.degToRad(degrees);
      direction.copy(forward).multiplyScalar(Math.cos(angle)).addScaledVector(right, Math.sin(angle)).normalize();
      const centerX = origin.x + direction.x * (distance + forwardExtra);
      const centerZ = origin.z + direction.z * (distance + forwardExtra);
      const spreadX = Math.abs(right.x) * lateralHalfSpan;
      const spreadZ = Math.abs(right.z) * lateralHalfSpan;
      if (centerX - spreadX >= minX && centerX + spreadX <= maxX
        && centerZ - spreadZ >= minZ && centerZ + spreadZ <= maxZ) {
        return { direction: direction.clone(), distance };
      }
    }
  }

  // A normal sortie has ample theater room for the minimum separation. Keep a
  // stable forward fallback for unusually narrow custom/stress scenarios.
  return { direction: forward.clone(), distance: lowerBound };
}

export function keepAircraftClear(battle, unit, waypoint, playerRight, friendly, target = null) {
  const awayFromPlayer = unit.away.subVectors(unit.mesh.position, battle.player.position);
  const playerDistance = awayFromPlayer.length();
  const minimumPlayerDistance = friendly ? 260 : 600;
  if (playerDistance < minimumPlayerDistance) {
    awayFromPlayer.y *= 1.4;
    if (awayFromPlayer.lengthSq() < 1) awayFromPlayer.copy(playerRight).multiplyScalar(unit.wing || 1);
    awayFromPlayer.normalize();
    waypoint.addScaledVector(awayFromPlayer, (minimumPlayerDistance - playerDistance) * 2.4);
  }

  if (friendly) {
    for (const other of battle.allies) {
      if (other === unit || other.dead) continue;
      const separation = unit.separation.subVectors(unit.mesh.position, other.mesh.position);
      const distance = separation.length();
      if (distance < 270) {
        separation.y *= 1.5;
        if (separation.lengthSq() < 1) separation.copy(playerRight).multiplyScalar(unit.wing);
        waypoint.addScaledVector(separation.normalize(), (270 - distance) * 1.8);
      }
    }
  }

  // A wingman avoids crossing another hostile, while keeping its selected target in sight.
  if (friendly) {
    for (const enemy of battle.enemies) {
      if (enemy === target || enemy.dead) continue;
      const separation = unit.separation.subVectors(unit.mesh.position, enemy.mesh.position);
      const distance = separation.length();
      if (distance < 430) waypoint.addScaledVector(separation.normalize(), (430 - distance) * 1.5);
    }
  }
}

export function getTheaterLimit(battle, margin = 500) {
  if (!battle.terrain?.worldSize) return Infinity;
  return Math.max(1200, battle.terrain.worldSize * .5 - margin);
}

export function getAircraftEdgeMargin(battle) {
  const bounds = battle.terrain?.operationBounds;
  if (!bounds) return Math.min(2400, getTheaterLimit(battle, 500) * .14);
  const span = Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  return Math.min(2400, Math.max(700, span * .075));
}

export function clampToTheater(battle, position, margin = 500) {
  const limit = getTheaterLimit(battle, margin);
  const bounds = battle.terrain?.operationBounds;
  position.x = THREE.MathUtils.clamp(position.x, bounds ? bounds.minX + margin : -limit, bounds ? bounds.maxX - margin : limit);
  position.z = THREE.MathUtils.clamp(position.z, bounds ? bounds.minZ + margin : -limit, bounds ? bounds.maxZ - margin : limit);
}

export function constrainWaypoint(battle, waypoint, preferredAltitude, margin = 500) {
  clampToTheater(battle, waypoint, margin);
  const ground = battle.terrain?.sampleHeight(waypoint.x, waypoint.z) ?? -Infinity;
  waypoint.y = Math.max(preferredAltitude, ground + 360);
}
