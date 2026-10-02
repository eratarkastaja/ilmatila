import * as THREE from 'three';

export const dryRouteOffsets = [0, .38, -.38, .78, -.78, 1.22, -1.22, 1.58, -1.58, Math.PI];

export function distanceToTheaterEdge(position,direction,halfExtent){
  let distance=Infinity;
  if(direction.x>1e-5)distance=Math.min(distance,(halfExtent-position.x)/direction.x);
  else if(direction.x< -1e-5)distance=Math.min(distance,(-halfExtent-position.x)/direction.x);
  if(direction.z>1e-5)distance=Math.min(distance,(halfExtent-position.z)/direction.z);
  else if(direction.z< -1e-5)distance=Math.min(distance,(-halfExtent-position.z)/direction.z);
  return Math.max(0,distance);
}

export function safeRouteAlignedSquareSpan(center,forward,right,halfExtent,margin=300){
  const xProjection=Math.abs(forward.x)+Math.abs(right.x);
  const zProjection=Math.abs(forward.z)+Math.abs(right.z);
  const xRoom=(halfExtent-margin-Math.abs(center.x))/Math.max(xProjection,1e-5);
  const zRoom=(halfExtent-margin-Math.abs(center.z))/Math.max(zProjection,1e-5);
  return Math.max(0,Math.min(xRoom,zRoom)*2);
}

export function nearestDryPoint(terrain, x, z) {
  const half = (terrain?.worldSize ?? 32000) * .5 - 120;
  x = THREE.MathUtils.clamp(x,-half,half);
  z = THREE.MathUtils.clamp(z,-half,half);
  if (isMappedDryGround(terrain, x, z)) return { x, z, y: terrain.sampleHeight(x, z) };
  for (let step = 1; step <= 100; step++) {
    for (let bearing = 0; bearing < 16; bearing++) {
      const angle = bearing * Math.PI / 8;
      const candidateX = x + Math.cos(angle) * step * 25;
      const candidateZ = z + Math.sin(angle) * step * 25;
      if(Math.abs(candidateX)>half||Math.abs(candidateZ)>half)continue;
      if (isMappedDryGround(terrain, candidateX, candidateZ)) {
        return { x: candidateX, z: candidateZ, y: terrain.sampleHeight(candidateX, candidateZ) };
      }
    }
  }
  return null;
}

export function isMappedDryGround(terrain, x, z) {
  return (!terrain.isPlayableArea || terrain.isPlayableArea(x, z)) && !terrain.isWater(x, z);
}

export function getGroundWeaponRange(weapon = '') {
  if (weapon.includes('120') || weapon.includes('125')) return 2200;
  if (weapon.includes('30')) return 1500;
  if (weapon.includes('14,5')) return 1250;
  if (weapon.includes('12,7')) return 1000;
  return 900;
}

