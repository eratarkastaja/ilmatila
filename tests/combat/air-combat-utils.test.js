import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { planAirFormation } from '../../src/combat/air-combat-utils.js';

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
});
