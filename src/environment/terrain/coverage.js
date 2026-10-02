const NO_DATA = 0;
const COVERED = 1;

export function createCoverageField(mask, width, height, areaMeters) {
  if (!(mask instanceof Uint8Array) || mask.length !== width * height
    || !Number.isInteger(width) || width < 2 || !Number.isInteger(height) || height < 2
    || !Number.isFinite(areaMeters) || areaMeters <= 0) {
    throw new TypeError('invalid orthophoto coverage mask');
  }

  const coverageMask = fillEnclosedNoData(removeSinglePixelNoise(mask, width, height), width, height);
  const distance = createDistanceField(coverageMask, width, height);
  const cellMeters = areaMeters / width;
  const half = areaMeters / 2;
  let minCol = width, maxCol = -1, minRow = height, maxRow = -1;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (!coverageMask[row * width + col]) continue;
      minCol = Math.min(minCol, col);
      maxCol = Math.max(maxCol, col);
      minRow = Math.min(minRow, row);
      maxRow = Math.max(maxRow, row);
    }
  }
  const bounds = maxCol < minCol ? null : {
    minX: -half + minCol * cellMeters,
    maxX: -half + (maxCol + 1) * cellMeters,
    minZ: half - (maxRow + 1) * cellMeters,
    maxZ: half - minRow * cellMeters,
  };

  return { mask: coverageMask, distance, width, height, areaMeters, cellMeters, bounds };
}

export function isInCoverage(coverage, x, z) {
  const index = coverageIndex(coverage, x, z);
  return index >= 0 && coverage.mask[index] === COVERED;
}

export function coverageClearance(coverage, x, z) {
  const index = coverageIndex(coverage, x, z);
  if (index < 0 || coverage.mask[index] !== COVERED) return 0;
  return Math.max(0, (coverage.distance[index] / 3 - 0.5) * coverage.cellMeters);
}

export function coverageApproach(coverage, x, z, velocityX, velocityZ, warningRange = 5_000, minimumOutwardSpeed = 25, result) {
  const clearance = coverageClearance(coverage, x, z);
  if (clearance <= 0 || clearance > warningRange) return null;

  const step = coverage.cellMeters;
  let outwardX = coverageClearance(coverage, x - step, z) - coverageClearance(coverage, x + step, z);
  let outwardZ = coverageClearance(coverage, x, z - step) - coverageClearance(coverage, x, z + step);
  const length = Math.hypot(outwardX, outwardZ);
  if (length < 1e-3) return null;
  outwardX /= length;
  outwardZ /= length;
  const outwardSpeed = velocityX * outwardX + velocityZ * outwardZ;
  if (outwardSpeed <= minimumOutwardSpeed) return null;
  const approach = result ?? {};
  approach.clearance = clearance;
  return approach;
}

export function forEachCoverageEdge(coverage, visit) {
  const { mask, width, height, areaMeters, cellMeters } = coverage;
  const half = areaMeters / 2;
  const covered = (col, row) => col >= 0 && col < width && row >= 0 && row < height
    && mask[row * width + col] === COVERED;

  for (let row = 0; row < height; row++) {
    const north = half - row * cellMeters;
    const south = north - cellMeters;
    for (let col = 0; col < width; col++) {
      if (!covered(col, row)) continue;
      const west = -half + col * cellMeters;
      const east = west + cellMeters;
      if (!covered(col, row - 1)) visit(west, north, east, north, 0, 1);
      if (!covered(col, row + 1)) visit(east, south, west, south, 0, -1);
      if (!covered(col + 1, row)) visit(east, north, east, south, 1, 0);
      if (!covered(col - 1, row)) visit(west, south, west, north, -1, 0);
    }
  }
}

function coverageIndex(coverage, x, z) {
  const half = coverage.areaMeters / 2;
  if (x < -half || x >= half || z < -half || z >= half) return -1;
  const col = Math.min(coverage.width - 1, Math.floor((x + half) / coverage.cellMeters));
  const row = Math.min(coverage.height - 1, Math.floor((half - z) / coverage.cellMeters));
  return row * coverage.width + col;
}

function removeSinglePixelNoise(mask, width, height) {
  const output = mask.slice();
  for (let row = 1; row < height - 1; row++) {
    for (let col = 1; col < width - 1; col++) {
      const index = row * width + col;
      let coveredNeighbors = 0;
      for (let y = row - 1; y <= row + 1; y++) {
        for (let x = col - 1; x <= col + 1; x++) {
          if ((x !== col || y !== row) && mask[y * width + x] === COVERED) coveredNeighbors++;
        }
      }
      if (mask[index] === NO_DATA && coveredNeighbors >= 7) output[index] = COVERED;
      else if (mask[index] === COVERED && coveredNeighbors === 0) output[index] = NO_DATA;
    }
  }
  return output;
}

// NoData islands inside the mapped theater are image gaps, not theater edges.
// Flood from the raster frame so only missing imagery connected to the outside
// remains non-playable. Eight-way connectivity avoids turning diagonal seams
// in the source raster into artificial internal boundaries.
export function fillEnclosedNoData(mask, width, height) {
  const exterior = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  const enqueue = index => {
    if (mask[index] === NO_DATA && !exterior[index]) {
      exterior[index] = 1;
      queue[tail++] = index;
    }
  };

  for (let col = 0; col < width; col++) {
    enqueue(col);
    enqueue((height - 1) * width + col);
  }
  for (let row = 1; row < height - 1; row++) {
    enqueue(row * width);
    enqueue(row * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    const row = Math.floor(index / width);
    const col = index - row * width;
    for (let offsetY = -1; offsetY <= 1; offsetY++) {
      const nextRow = row + offsetY;
      if (nextRow < 0 || nextRow >= height) continue;
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        if (offsetX === 0 && offsetY === 0) continue;
        const nextCol = col + offsetX;
        if (nextCol < 0 || nextCol >= width) continue;
        enqueue(nextRow * width + nextCol);
      }
    }
  }

  for (let index = 0; index < mask.length; index++) {
    if (mask[index] === NO_DATA && !exterior[index]) mask[index] = COVERED;
  }
  return mask;
}

function createDistanceField(mask, width, height) {
  const distance = new Uint16Array(mask.length);
  distance.fill(0xffff);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      if (mask[index] === NO_DATA) {
        distance[index] = 0;
      } else if (row === 0 || row === height - 1 || col === 0 || col === width - 1) {
        distance[index] = 3;
      }
    }
  }

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      if (distance[index] === 0) continue;
      let nearest = distance[index];
      if (row > 0) {
        nearest = Math.min(nearest, distance[index - width] + 3);
        if (col > 0) nearest = Math.min(nearest, distance[index - width - 1] + 4);
        if (col + 1 < width) nearest = Math.min(nearest, distance[index - width + 1] + 4);
      }
      if (col > 0) nearest = Math.min(nearest, distance[index - 1] + 3);
      distance[index] = nearest;
    }
  }

  for (let row = height - 1; row >= 0; row--) {
    for (let col = width - 1; col >= 0; col--) {
      const index = row * width + col;
      if (distance[index] === 0) continue;
      let nearest = distance[index];
      if (row + 1 < height) {
        nearest = Math.min(nearest, distance[index + width] + 3);
        if (col > 0) nearest = Math.min(nearest, distance[index + width - 1] + 4);
        if (col + 1 < width) nearest = Math.min(nearest, distance[index + width + 1] + 4);
      }
      if (col + 1 < width) nearest = Math.min(nearest, distance[index + 1] + 3);
      distance[index] = nearest;
    }
  }
  return distance;
}
