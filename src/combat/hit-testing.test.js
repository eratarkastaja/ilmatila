import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { pointSegmentDistanceSquared, traceFighterHit, traceVehicleHit } from './hit-testing.js';

function makeFighter(hitZones) {
  const fighter = new THREE.Object3D();
  fighter.userData.hitZones = hitZones;
  return fighter;
}

function makeVehicle() {
  const vehicle = new THREE.Object3D();
  vehicle.userData.hitBounds = { min: [-2, 0, -3], max: [2, 2, 3] };
  return vehicle;
}

describe('projectile hit testing', () => {
  it('intersects an aircraft hit zone and returns its damage', () => {
    const fighter = makeFighter([{ x: 0, y: 0, z: 0, rx: 2, ry: 1, rz: 2, damage: 0.7 }]);

    expect(traceFighterHit(
      new THREE.Vector3(-10, 0, 0),
      new THREE.Vector3(10, 0, 0),
      fighter,
    )).toMatchObject({ damage: 0.7 });
  });

  it('returns the earliest aircraft zone intersected by a round', () => {
    const fighter = makeFighter([
      { x: -2, y: 0, z: 0, rx: 1, ry: 1, rz: 1, damage: 0.4 },
      { x: 2, y: 0, z: 0, rx: 1, ry: 1, rz: 1, damage: 0.8 },
    ]);
    const impact = traceFighterHit(
      new THREE.Vector3(-10, 0, 0),
      new THREE.Vector3(10, 0, 0),
      fighter,
    );

    expect(impact.damage).toBe(0.4);
    expect(impact.t).toBeLessThan(0.5);
  });

  it('rejects segments that pass outside an aircraft hit zone', () => {
    const fighter = makeFighter([{ x: 0, y: 0, z: 0, rx: 2, ry: 1, rz: 2, damage: 1 }]);

    expect(traceFighterHit(
      new THREE.Vector3(-10, 2, 0),
      new THREE.Vector3(10, 2, 0),
      fighter,
    )).toBeNull();
  });

  it('transforms aircraft hit zones into world space', () => {
    const fighter = makeFighter([{ x: 0, y: 0, z: 0, rx: 1, ry: 1, rz: 1, damage: 1 }]);
    fighter.position.set(40, 15, -8);

    expect(traceFighterHit(
      new THREE.Vector3(35, 15, -8),
      new THREE.Vector3(45, 15, -8),
      fighter,
    )).not.toBeNull();
  });

  it('intersects vehicle bounds and supports a more forgiving cannon envelope', () => {
    const vehicle = makeVehicle();
    const start = new THREE.Vector3(-10, 2.4, 0);
    const end = new THREE.Vector3(10, 2.4, 0);

    expect(traceVehicleHit(start, end, vehicle)).toBeNull();
    expect(traceVehicleHit(start, end, vehicle, 1.5)).toMatchObject({ damage: 1 });
  });

  it('computes the closest point on a finite projectile segment', () => {
    const distanceSquared = pointSegmentDistanceSquared(
      new THREE.Vector3(3, 4, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 0, 0),
    );

    expect(distanceSquared).toBe(16);
  });
});
