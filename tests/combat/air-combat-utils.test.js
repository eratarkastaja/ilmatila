import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  getAirSpawnDistance, getAirSpawnMargin, planAirFormation, planAirIngressStart,
} from '../../src/combat/air-combat-utils.js';

const terrain = {
  worldSize: 32000,
  operationBounds: { minX: -16000, maxX: 16000, minZ: -16000, maxZ: 16000 },
};

describe('air formation placement', () => {
  it('varies bearing and stand-off distance from the deterministic layout stream', () => {
    const options = {
      origin: new THREE.Vector3(),
      forward: new THREE.Vector3(0, 0, 1),
      right: new THREE.Vector3(1, 0, 0),
      terrain,
      count: 4,
      requestedDistance: 12000,
      minimumDistance: 10000,
      lateralSpacing: 560,
      forwardLaneSpacing: 90,
      margin: 1200,
    };
    const nearForward = planAirFormation({ ...options, random: () => 0 });
    const wideOffset = planAirFormation({ ...options, random: () => .999999 });

    expect(nearForward.distance).not.toBe(wideOffset.distance);
    expect(nearForward.direction.dot(wideOffset.direction)).toBeLessThan(.999);
  });

  it('keeps authored long-range formations at least 25 km from ingress', () => {
    const minimumDistance = getAirSpawnDistance(15500, 14000);
    const origin = planAirIngressStart(new THREE.Vector3(0, 0, 0), terrain, 0, {
      hostiles: 4,
      navigationDistance: 4200,
      hostileSpawnDistance: 15500,
      hostileMinimumSpawnDistance: 14000,
    });
    const formation = planAirFormation({
      origin,
      forward: new THREE.Vector3(0, 0, 1),
      right: new THREE.Vector3(1, 0, 0),
      terrain,
      count: 4,
      requestedDistance: minimumDistance,
      minimumDistance,
      lateralSpacing: 560,
      forwardLaneSpacing: 90,
      margin: getAirSpawnMargin(minimumDistance),
      random: () => .4,
    });

    expect(formation.positions.every(position => position.distanceTo(origin) >= 25000))
      .toBe(true);
    expect(origin.z).toBeCloseTo(-14400, 5);
    expect(formation.positions.every(position => (
      position.x >= terrain.operationBounds.minX + 1200
      && position.x <= terrain.operationBounds.maxX - 1200
      && position.z >= terrain.operationBounds.minZ + 1200
      && position.z <= terrain.operationBounds.maxZ - 1200
    ))).toBe(true);
  });
});
