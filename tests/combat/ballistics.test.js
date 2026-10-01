import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  estimateInterceptTime,
  GUN_PROJECTILE_GRAVITY,
  GUN_PROJECTILE_LIFETIME,
  GUN_PROJECTILE_SPEED,
  GUN_ROUNDS_PER_SECOND,
} from '../../src/combat/ballistics.js';

describe('gun ballistics', () => {
  it('exposes the cannon firing constants used by combat and the HUD', () => {
    expect(GUN_PROJECTILE_SPEED).toBe(1000);
    expect(GUN_PROJECTILE_LIFETIME).toBe(2.2);
    expect(GUN_PROJECTILE_GRAVITY).toBe(9.81);
    expect(GUN_ROUNDS_PER_SECOND).toBe(55);
  });

  it('returns the direct flight time for a stationary target', () => {
    const time = estimateInterceptTime(
      new THREE.Vector3(0, 0, 1800),
      new THREE.Vector3(),
      GUN_PROJECTILE_SPEED,
    );

    expect(time).toBeCloseTo(1.8, 8);
  });

  it('leads a target closing along the firing line', () => {
    const time = estimateInterceptTime(
      new THREE.Vector3(0, 0, 1000),
      new THREE.Vector3(0, 0, -100),
      GUN_PROJECTILE_SPEED,
    );

    expect(time).toBeCloseTo(1000 / 1100, 8);
  });

  it('accounts for lateral target motion', () => {
    const time = estimateInterceptTime(
      new THREE.Vector3(0, 0, 1000),
      new THREE.Vector3(100, 0, 0),
      GUN_PROJECTILE_SPEED,
    );

    expect(time).toBeCloseTo(1000 / Math.sqrt(1000 ** 2 - 100 ** 2), 8);
  });

  it('returns zero for a target at the firing origin and clamps to the requested horizon', () => {
    expect(estimateInterceptTime(new THREE.Vector3(), new THREE.Vector3(), GUN_PROJECTILE_SPEED)).toBe(0);
    expect(estimateInterceptTime(
      new THREE.Vector3(2000, 0, 0),
      new THREE.Vector3(),
      GUN_PROJECTILE_SPEED,
      1.25,
    )).toBe(1.25);
  });
});
