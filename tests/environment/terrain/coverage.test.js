import { describe, expect, it } from 'vitest';
import {
  coverageApproach,
  coverageClearance,
  createCoverageField,
  forEachCoverageEdge,
  isInCoverage,
} from '../../../src/environment/terrain/coverage.js';

function makeRectangularCoverage() {
  const width = 5;
  const mask = new Uint8Array(width * width);
  for (let row = 0; row < width; row++) {
    for (let col = 0; col < 3; col++) mask[row * width + col] = 1;
  }
  return createCoverageField(mask, width, width, 100);
}

describe('orthophoto coverage field', () => {
  it('uses the raster coverage boundary instead of the full square extent', () => {
    const coverage = makeRectangularCoverage();

    expect(isInCoverage(coverage, 0, 0)).toBe(true);
    expect(isInCoverage(coverage, 20, 0)).toBe(false);
    expect(coverage.bounds).toEqual({ minX: -50, maxX: 10, minZ: -50, maxZ: 50 });
  });

  it('measures approach to the nearest photo edge and ignores turnbacks', () => {
    const coverage = makeRectangularCoverage();

    expect(coverageClearance(coverage, 0, 0)).toBe(10);
    expect(coverageApproach(coverage, 0, 0, 100, 0)).toEqual({ clearance: 10 });
    expect(coverageApproach(coverage, 0, 0, -100, 0)).toBeNull();
  });

  it('emits only the contour around mapped cells', () => {
    const coverage = makeRectangularCoverage();
    let segments = 0;
    forEachCoverageEdge(coverage, () => segments++);

    expect(segments).toBe(16);
  });

  it('treats enclosed NoData pixels as flyable and keeps the exterior wedge off theater', () => {
    const width = 7;
    const mask = new Uint8Array(width * width).fill(1);
    for (let row = 2; row < 4; row++) {
      for (let col = 2; col < 4; col++) mask[row * width + col] = 0; // Internal image gap.
    }
    for (let row = 5; row < width; row++) {
      for (let col = 5; col < width; col++) mask[row * width + col] = 0;
    }
    const coverage = createCoverageField(mask, width, width, 70);

    expect(isInCoverage(coverage, 0, 0)).toBe(true);
    expect(isInCoverage(coverage, 20, -20)).toBe(false);
    expect(coverageClearance(coverage, 0, 0)).toBeGreaterThan(0);
    expect(coverageApproach(coverage, 0, 0, -100, 0)).toBeNull();

    let edges = 0;
    forEachCoverageEdge(coverage, () => edges++);
    expect(edges).toBe(28);
  });
});
