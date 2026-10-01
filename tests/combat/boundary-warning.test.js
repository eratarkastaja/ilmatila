import { describe, expect, it } from 'vitest';
import { getBoundaryApproach } from '../../src/combat/boundary-warning.js';

describe('getBoundaryApproach', () => {
  const halfSize = 16_000;
  const bounds = { minX: -halfSize, maxX: halfSize, minZ: -halfSize, maxZ: halfSize };

  it('warns only while moving toward a nearby edge', () => {
    expect(getBoundaryApproach({ x: 12_000, z: 0 }, { x: 100, z: 0 }, bounds))
      .toEqual({ clearance: 4_000 });
  });

  it('clears the warning immediately when turning back toward the theater', () => {
    expect(getBoundaryApproach({ x: 12_000, z: 0 }, { x: -100, z: 0 }, bounds))
      .toBeNull();
  });

  it('does not warn while the edge is outside the warning range', () => {
    expect(getBoundaryApproach({ x: 9_000, z: 0 }, { x: 100, z: 0 }, bounds))
      .toBeNull();
  });

  it('ignores slow drift and motion parallel to the nearest edge', () => {
    expect(getBoundaryApproach({ x: 12_000, z: 0 }, { x: 10, z: 100 }, bounds))
      .toBeNull();
  });

  it('uses the nearest edge when approaching a corner diagonally', () => {
    expect(getBoundaryApproach({ x: 12_000, z: 13_000 }, { x: 80, z: 90 }, bounds))
      .toEqual({ clearance: 3_000 });
  });

  it('uses the orthophoto-sized operation bounds when they are smaller than the height map', () => {
    const orthophotoBounds = { minX: -12_000, maxX: 12_000, minZ: -12_000, maxZ: 12_000 };
    expect(getBoundaryApproach({ x: 8_000, z: 0 }, { x: 100, z: 0 }, orthophotoBounds))
      .toEqual({ clearance: 4_000 });
  });
});
