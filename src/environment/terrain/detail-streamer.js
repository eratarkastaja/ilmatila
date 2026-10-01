import * as THREE from 'three';

const WINDOW_TILES = 3;
const CACHE_LIMIT = 12;

export function createDetailStreamer({ base, metadata, terrainGeometry, parent, anisotropy = 4 }) {
  const grid = metadata.detailOrthoGrid;
  const tileMeters = metadata.detailOrthoTileSizeMeters;
  const areaMeters = metadata.detailOrthoAreaMeters;
  const abortController = new AbortController();
  const cache = new Map();
  const tiles = new Map();
  const emptyMaterial = new THREE.MeshStandardMaterial({ color: '#d1d6ca', roughness: 1, metalness: 0 });
  let startCol = -1;
  let startRow = -1;
  let disposed = false;

  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const key = `${row}-${col}`;
      const geometry = makeDetailTileGeometry(terrainGeometry, metadata.width, metadata.height, areaMeters, tileMeters, row, col);
      const mesh = new THREE.Mesh(geometry, emptyMaterial);
      mesh.visible = false;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.renderOrder = 1;
      mesh.name = `terrain-detail-${key}`;
      parent.add(mesh);
      tiles.set(key, { row, col, mesh, geometry });
    }
  }

  function isInWindow(row, col) {
    return row >= startRow && row < startRow + WINDOW_TILES
      && col >= startCol && col < startCol + WINDOW_TILES;
  }

  function currentKeys() {
    const keys = [];
    for (let row = startRow; row < startRow + WINDOW_TILES; row++) {
      for (let col = startCol; col < startCol + WINDOW_TILES; col++) keys.push(`${row}-${col}`);
    }
    return keys;
  }

  function updateVisibility() {
    for (const tile of tiles.values()) {
      const entry = cache.get(`${tile.row}-${tile.col}`);
      tile.mesh.visible = isInWindow(tile.row, tile.col) && Boolean(entry?.material);
    }
  }

  function makeTileMaterial(image) {
    const prepared = prepareOrthophotoTile(image);
    if (!prepared) return null;

    const texture = new THREE.Texture(prepared.image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = Math.max(1, anisotropy);
    texture.needsUpdate = true;
    const material = new THREE.MeshStandardMaterial({
      color: '#d1d6ca', map: texture, roughness: 1, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      transparent: prepared.hasNoData,
      depthWrite: !prepared.hasNoData,
    });
    return { texture, material };
  }

  function disposeEntry(key, entry) {
    const tile = tiles.get(key);
    if (tile?.mesh.material === entry.material) {
      tile.mesh.material = emptyMaterial;
      tile.mesh.visible = false;
    }
    entry.texture?.dispose();
    entry.material?.dispose();
  }

  function pruneCache() {
    if (cache.size <= CACHE_LIMIT) return;
    const active = new Set(currentKeys());
    for (const [key, entry] of cache) {
      if (cache.size <= CACHE_LIMIT) break;
      if (active.has(key) || !entry.settled) continue;
      cache.delete(key);
      disposeEntry(key, entry);
    }
  }

  function requestTile(row, col) {
    const key = `${row}-${col}`;
    let entry = cache.get(key);
    if (entry) {
      cache.delete(key);
      cache.set(key, entry);
      return entry.promise;
    }

    entry = { material: null, texture: null, settled: false, promise: null };
    entry.promise = loadImage(`${base}/detail-ortho-${row}-${col}.jpg`, abortController.signal)
      .then(image => {
        if (disposed) return null;
        const resources = makeTileMaterial(image);
        if (!resources) return null;
        entry.texture = resources.texture;
        entry.material = resources.material;
        const tile = tiles.get(key);
        tile.mesh.material = entry.material;
        tile.mesh.visible = isInWindow(row, col);
        return image;
      })
      .catch(error => {
        if (!abortController.signal.aborted) {
          console.info(`Moving detailed imagery tile ${row}-${col} is unavailable (${error.message}).`);
        }
        cache.delete(key);
        return null;
      })
      .finally(() => {
        entry.settled = true;
        pruneCache();
      });
    cache.set(key, entry);
    return entry.promise;
  }

  function update(x, z) {
    if (disposed || !Number.isFinite(x) || !Number.isFinite(z)) return;
    const half = areaMeters / 2;
    const col = THREE.MathUtils.clamp(Math.floor((x + half) / tileMeters), 0, grid - 1);
    const row = THREE.MathUtils.clamp(Math.floor((half - z) / tileMeters), 0, grid - 1);
    const nextCol = THREE.MathUtils.clamp(col - 1, 0, grid - WINDOW_TILES);
    const nextRow = THREE.MathUtils.clamp(row - 1, 0, grid - WINDOW_TILES);
    if (nextCol === startCol && nextRow === startRow) return;

    startCol = nextCol;
    startRow = nextRow;
    updateVisibility();
    for (const key of currentKeys()) {
      const [tileRow, tileCol] = key.split('-').map(Number);
      requestTile(tileRow, tileCol);
    }
    pruneCache();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    abortController.abort();
    for (const [key, entry] of cache) disposeEntry(key, entry);
    cache.clear();
    for (const tile of tiles.values()) {
      tile.mesh.removeFromParent();
      tile.geometry.dispose();
    }
    tiles.clear();
    emptyMaterial.dispose();
  }

  return { update, dispose };
}

function prepareOrthophotoTile(image) {
  // The NLS imagery coverage contains whole tiles and partial areas encoded as
  // pure white/black pixels. Probe first so wholly empty 1 MP tiles can simply
  // reveal the lower-resolution base map without allocating another canvas.
  const probe = document.createElement('canvas');
  probe.width = 16;
  probe.height = 16;
  const probeContext = probe.getContext('2d', { willReadFrequently: true });
  probeContext.drawImage(image, 0, 0, probe.width, probe.height);
  const samples = probeContext.getImageData(0, 0, probe.width, probe.height).data;
  let blankSamples = 0;
  for (let index = 0; index < samples.length; index += 4) {
    if (isNoDataPixel(samples[index], samples[index + 1], samples[index + 2])) blankSamples++;
  }
  if (blankSamples === probe.width * probe.height) return null;
  if (blankSamples === 0) return { image, hasNoData: false };

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  const maskContext = maskCanvas.getContext('2d');
  const mask = maskContext.createImageData(canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const alpha = isNoDataPixel(pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]) ? 0 : 255;
    mask.data[index] = 255;
    mask.data[index + 1] = 255;
    mask.data[index + 2] = 255;
    mask.data[index + 3] = alpha;
  }
  maskContext.putImageData(mask, 0, 0);
  context.save();
  context.globalCompositeOperation = 'destination-in';
  context.filter = 'blur(2px)';
  context.drawImage(maskCanvas, 0, 0);
  context.restore();
  return { image: canvas, hasNoData: true };
}

function isNoDataPixel(red, green, blue) {
  const brightest = Math.max(red, green, blue);
  const darkest = Math.min(red, green, blue);
  if (brightest - darkest > 4) return false;
  const brightness = (red + green + blue) / 3;
  return brightness <= 4 || brightness >= 250 || (brightness >= 202 && brightness <= 216);
}

function makeDetailTileGeometry(sourceGeometry, sourceWidth, sourceHeight, areaMeters, tileMeters, tileRow, tileCol) {
  const segments = Math.max(16, Math.round(tileMeters / (areaMeters / (sourceWidth - 1))));
  const side = segments + 1;
  const west = -areaMeters / 2 + tileCol * tileMeters;
  const south = areaMeters / 2 - (tileRow + 1) * tileMeters;
  const positions = new Float32Array(side * side * 3);
  const normals = new Float32Array(side * side * 3);
  const uvs = new Float32Array(side * side * 2);
  const IndexArray = side * side > 65_535 ? Uint32Array : Uint16Array;
  const indices = new IndexArray(segments * segments * 6);
  const sourceNormals = sourceGeometry.getAttribute('normal').array;
  let indexOffset = 0;

  for (let row = 0; row < side; row++) {
    const v = row / segments;
    const z = south + tileMeters * (1 - v);
    for (let col = 0; col < side; col++) {
      const u = col / segments;
      const x = west + tileMeters * u;
      const index = row * side + col;
      positions[index * 3] = x;
      positions[index * 3 + 1] = sampleGeometrySurfaceHeight(sourceGeometry, sourceWidth, sourceHeight, areaMeters, x, z);
      positions[index * 3 + 2] = z;
      sampleGeometrySurfaceNormal(sourceNormals, sourceWidth, sourceHeight, areaMeters, x, z, normals, index * 3);
      uvs[index * 2] = u;
      uvs[index * 2 + 1] = 1 - v;
      if (col < segments && row < segments) {
        const a = index, b = a + 1, c = a + side, d = c + 1;
        indices[indexOffset++] = a;
        indices[indexOffset++] = b;
        indices[indexOffset++] = c;
        indices[indexOffset++] = b;
        indices[indexOffset++] = d;
        indices[indexOffset++] = c;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function sampleGeometrySurfaceHeight(geometry, width, height, areaMeters, x, z) {
  const positions = geometry.getAttribute('position').array;
  const col = THREE.MathUtils.clamp((x / areaMeters + 0.5) * (width - 1), 0, width - 1);
  const row = THREE.MathUtils.clamp((0.5 - z / areaMeters) * (height - 1), 0, height - 1);
  const x0 = Math.min(Math.floor(col), width - 2);
  const y0 = Math.min(Math.floor(row), height - 2);
  const tx = col - x0;
  const ty = row - y0;
  const a = positions[(y0 * width + x0) * 3 + 1];
  const b = positions[(y0 * width + x0 + 1) * 3 + 1];
  const c = positions[((y0 + 1) * width + x0) * 3 + 1];
  const d = positions[((y0 + 1) * width + x0 + 1) * 3 + 1];
  return tx + ty <= 1
    ? a * (1 - tx - ty) + b * tx + c * ty
    : b * (1 - ty) + d * (tx + ty - 1) + c * (1 - tx);
}

function sampleGeometrySurfaceNormal(normals, width, height, areaMeters, x, z, target, targetOffset) {
  const col = THREE.MathUtils.clamp((x / areaMeters + 0.5) * (width - 1), 0, width - 1);
  const row = THREE.MathUtils.clamp((0.5 - z / areaMeters) * (height - 1), 0, height - 1);
  const x0 = Math.min(Math.floor(col), width - 2);
  const y0 = Math.min(Math.floor(row), height - 2);
  const tx = col - x0;
  const ty = row - y0;
  const a = (y0 * width + x0) * 3;
  const b = a + 3;
  const c = a + width * 3;
  const d = c + 3;
  const nx = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(normals[a], normals[b], tx),
    THREE.MathUtils.lerp(normals[c], normals[d], tx),
    ty,
  );
  const ny = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(normals[a + 1], normals[b + 1], tx),
    THREE.MathUtils.lerp(normals[c + 1], normals[d + 1], tx),
    ty,
  );
  const nz = THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(normals[a + 2], normals[b + 2], tx),
    THREE.MathUtils.lerp(normals[c + 2], normals[d + 2], tx),
    ty,
  );
  const length = Math.hypot(nx, ny, nz) || 1;
  target[targetOffset] = nx / length;
  target[targetOffset + 1] = ny / length;
  target[targetOffset + 2] = nz / length;
}

function loadImage(src, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }
    const image = new Image();
    const finish = (callback, value) => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener('abort', abort);
      callback(value);
    };
    const abort = () => {
      image.src = '';
      finish(reject, signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    };
    image.onload = () => finish(resolve, image);
    image.onerror = () => finish(reject, new Error(`image failed to load: ${src}`));
    signal.addEventListener('abort', abort, { once: true });
    image.src = src;
  });
}
