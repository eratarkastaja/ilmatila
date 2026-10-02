import * as THREE from 'three';
import { ATMOSPHERE } from './atmosphere.js';
import { createDetailStreamer } from './terrain/detail-streamer.js';
import {
  coverageApproach,
  coverageClearance,
  createCoverageField,
  fillEnclosedNoData,
  forEachCoverageEdge,
  isInCoverage,
} from './terrain/coverage.js';

const TERRAIN_PATH = `${import.meta.env.BASE_URL}terrain`;
const FALLBACK_AREA_METERS = 32000;
const ORTHO_TILE_METERS = 2000;
const TILE_PIXELS = 320;
const ORTHO_GRID = 8;
const DETAIL_WINDOW_TILES = 3;
let terrainIndexPromise;
const terrainLeaseDisposers = new WeakMap();

export const TERRAIN_AREAS = [
  { id: 'paijanne', label: 'Päijänne' },
  { id: 'virolahti', dataId: 'vironlahti', label: 'Virolahti' },
  { id: 'ilomantsi', label: 'Ilomantsi' },
  { id: 'kuusamo', label: 'Kuusamo' },
];

export function loadTerrainAreas() {
  if (!terrainIndexPromise) {
    terrainIndexPromise = fetch(`${TERRAIN_PATH}/index.json`, { cache: 'no-store' })
      .then(response => response.ok ? readJsonResponse(response, 'terrain index') : null)
      .then(index => index?.areas?.length ? index.areas : TERRAIN_AREAS)
      .catch(() => TERRAIN_AREAS);
  }
  return terrainIndexPromise;
}

export async function createTerrain({ areaId, fallback = true, onProgress, signal, textureAnisotropy = 4 } = {}) {
  const report = (progress, detail) => onProgress?.(THREE.MathUtils.clamp(progress, 0, 1), detail);
  try {
    throwIfAborted(signal);
    report(0.01, { key: 'terrain.fetchingArea' });
    const areas = await loadTerrainAreas();
    throwIfAborted(signal);
    const requested = areaId || new URLSearchParams(location.search).get('area');
    const areaConfig = TERRAIN_AREAS.find(area => area.id === requested || area.dataId === requested);
    const dataId = areaConfig?.dataId ?? areaConfig?.id ?? requested;
    // The menu's canonical area definition is authoritative for known maps.
    // Do not silently route a valid selection to the first manifest entry if
    // that manifest is stale or incomplete.
    const selected = areaConfig
      ? { id: dataId, label: areaConfig.label }
      : areas.find(area => area.id === dataId);
    if(!selected)throw new Error('no terrain areas are available');
    const base=`${TERRAIN_PATH}/areas/${selected.id}`;
    const metadataUrl = `${base}/terrain.json`;
    const metaResponse = await fetch(metadataUrl, { signal, cache: 'no-store' });
    if (!metaResponse.ok) {
      throw new Error(`terrain metadata is missing (HTTP ${metaResponse.status}): ${metaResponse.url || metadataUrl}`);
    }
    const metadata = await readJsonResponse(metaResponse, `terrain metadata (${metadataUrl})`);
    if (metadata.id !== selected.id) {
      throw new Error(`terrain package mismatch at ${metadataUrl}: expected ${selected.id}, received ${metadata.id}`);
    }
    validateTerrainMetadata(metadata);
    throwIfAborted(signal);
    report(0.04, { key: 'terrain.areaFound' });
    const heightResponse = await fetch(`${base}/height.f32`, { signal });
    if (!heightResponse.ok) throw new Error('height grid is missing');
    const bytes = await heightResponse.arrayBuffer();
    if (bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) throw new Error('height grid has an invalid byte length');
    const values = new Float32Array(bytes);
    if (values.length !== metadata.width * metadata.height) throw new Error('height grid dimensions do not match metadata');
    if (values.some(value => !Number.isFinite(value))) throw new Error('height grid contains invalid elevation values');
    throwIfAborted(signal);
    report(0.09, { key: 'terrain.elevationLoaded' });

    const areaMeters=metadata.areaMeters??FALLBACK_AREA_METERS;
    const orthoAreaMeters=metadata.orthoAreaMeters??ORTHO_GRID*ORTHO_TILE_METERS;
    const operationSize=Math.min(areaMeters,orthoAreaMeters);
    const operationBounds={
      minX:-operationSize*.5,
      maxX:operationSize*.5,
      minZ:-operationSize*.5,
      maxZ:operationSize*.5,
    };
    const orthoGrid=metadata.orthoGrid??ORTHO_GRID;
    const tilePixels=metadata.orthoTilePixels??TILE_PIXELS;
    let orthoLoaded = 0, waterLoaded = 0;
    const tileCount = orthoGrid * orthoGrid;
    const reportTiles = () => report(
      0.09 + 0.82 * (0.76 * orthoLoaded / tileCount + 0.24 * waterLoaded / tileCount),
      { key: 'terrain.imageryProgress', params: { imagery: orthoLoaded, total: tileCount, water: waterLoaded } },
    );
    const [orthophoto, water] = await Promise.all([
      loadOrthophotoAtlas(base, orthoGrid, tilePixels, orthoAreaMeters, textureAnisotropy, (loaded) => { orthoLoaded = loaded; reportTiles(); }, signal),
      loadWaterAtlas(base, orthoGrid, tilePixels, (loaded) => { waterLoaded = loaded; reportTiles(); }, signal),
    ]);
    const texture = orthophoto?.texture;
    if (!texture || !orthophoto.coverage) throw new Error('orthophoto imagery is missing');
    const coverage = orthophoto.coverage;
    if (!coverage.bounds) throw new Error('orthophoto imagery has no covered area');
    throwIfAborted(signal);
    repairMissingHeightSamples(values, metadata.width, metadata.height, metadata.referenceHeight, areaMeters, {
      water,
      waterGrid: orthoGrid,
      waterTilePixels: tilePixels,
      waterAreaMeters: orthoAreaMeters,
    });
    report(0.95, { key: 'terrain.finalizing' });
    const geometry = makeHeightGeometry(values, metadata.width, metadata.height, metadata.referenceHeight, areaMeters);
    const material = new THREE.MeshStandardMaterial({
      color: '#d1d6ca', map: texture, roughness: 1, metalness: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = -250;
    mesh.receiveShadow = true;
    const heightSampler = (x, z) => sampleHeight(values, metadata.width, metadata.height, metadata.referenceHeight, areaMeters, x, z);
    mesh.add(makeHorizonTerrain(areaMeters, heightSampler));
    const boundaryLine = makeTheaterBoundaryLine(operationBounds, heightSampler, coverage);
    mesh.add(boundaryLine);
    const detailStreamer = hasMovingDetailMetadata(metadata)
      ? createDetailStreamer({ base, metadata, terrainGeometry: geometry, parent: mesh, anisotropy: textureAnisotropy })
      : null;
    const terrain = {
      id:areaConfig?.id ?? selected.id, label:areaConfig?.label ?? selected.label, mesh, real: true, metadata,
      worldSize:operationSize, terrainSize:areaMeters, operationBounds: coverage.bounds,
      coverageCellMeters: coverage.cellMeters,
      isPlayableArea: (x, z) => isInCoverage(coverage, x, z),
      getBoundaryClearance: (x, z) => coverageClearance(coverage, x, z),
      getBoundaryApproach: (position, velocity, result) => coverageApproach(
        coverage, position.x, position.z, velocity.x, velocity.z, 5_000, 25, result,
      ),
      sampleHeight: heightSampler,
      boundaryLine,
      isWater: (x, z) => sampleWater(water, orthoGrid, tilePixels, orthoAreaMeters, x, z),
      updateDetailPosition: (x, z) => detailStreamer?.update(x, z),
      detailStreamer,
    };
    const areaLabel = document.querySelector('#area-name');
    if (areaLabel && metadata.region) areaLabel.textContent = metadata.region.toUpperCase();
    report(1, { key: 'terrain.ready' });
    return terrain;
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    if (!fallback) throw error;
    console.info(`Finnish terrain package unavailable; using preview terrain (${error.message}).`);
    report(1, { key: 'terrain.preview' });
    return createPreviewTerrain();
  }
}

function validateTerrainMetadata(metadata) {
  const validGrid = Number.isInteger(metadata?.width) && Number.isInteger(metadata?.height)
    && metadata.width >= 2 && metadata.height >= 2
    && metadata.width <= 2048 && metadata.height <= 2048
    && metadata.width * metadata.height <= 1_000_000;
  if (!validGrid) throw new Error('terrain metadata contains invalid height grid dimensions');
  if (!Number.isFinite(metadata.referenceHeight)) throw new Error('terrain metadata has an invalid reference height');
  if (!Number.isFinite(metadata.areaMeters) || metadata.areaMeters <= 0 || metadata.areaMeters > 1_000_000) {
    throw new Error('terrain metadata has an invalid area size');
  }
  const grid = metadata.orthoGrid ?? ORTHO_GRID;
  const tilePixels = metadata.orthoTilePixels ?? TILE_PIXELS;
  if (!Number.isInteger(grid) || grid < 1 || grid > 16 || !Number.isInteger(tilePixels) || tilePixels < 32 || tilePixels > 1024) {
    throw new Error('terrain metadata has invalid imagery dimensions');
  }
  if (grid * tilePixels > 4096) throw new Error('terrain imagery atlas is too large');
  const imageryExtent = metadata.orthoAreaMeters ?? grid * ORTHO_TILE_METERS;
  if (!Number.isFinite(imageryExtent) || imageryExtent <= 0 || imageryExtent > 1_000_000) {
    throw new Error('terrain metadata has an invalid imagery extent');
  }
  if (metadata.detailOrthoGrid !== undefined || metadata.detailOrthoTilePixels !== undefined
    || metadata.detailOrthoAreaMeters !== undefined || metadata.detailOrthoTileSizeMeters !== undefined) {
    if (!hasMovingDetailMetadata(metadata)) throw new Error('terrain metadata has invalid moving detailed imagery dimensions');
  }
}

async function readJsonResponse(response, description) {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch (error) {
    const contentType = response.headers.get('content-type') || 'unknown content type';
    throw new Error(`${description} returned invalid JSON (HTTP ${response.status}, ${contentType}, ${response.url})`, { cause: error });
  }
}

function hasMovingDetailMetadata(metadata) {
  const grid = metadata?.detailOrthoGrid;
  const pixels = metadata?.detailOrthoTilePixels;
  const extent = metadata?.detailOrthoAreaMeters;
  const tileSize = metadata?.detailOrthoTileSizeMeters;
  return Number.isInteger(grid) && grid >= DETAIL_WINDOW_TILES && grid <= 16
    && Number.isInteger(pixels) && pixels >= 128 && pixels <= 2048
    && Number.isFinite(extent) && extent > 0 && extent <= 40_000
    && Number.isFinite(tileSize) && tileSize > 0 && tileSize <= 4_000
    && Math.abs(grid * tileSize - extent) < 1
    && extent === (metadata.orthoAreaMeters ?? (metadata.orthoGrid ?? ORTHO_GRID) * ORTHO_TILE_METERS);
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

export function createPreviewTerrain() {
  return { ...makePreviewTerrain(), id: 'preview', label: 'Esimerkkimaa' };
}

export function disposeTerrain(terrain) {
  if (!terrain?.mesh) return;
  if (terrainLeaseDisposers.has(terrain)) {
    const releaseLease = terrainLeaseDisposers.get(terrain);
    terrainLeaseDisposers.set(terrain, null);
    releaseLease?.();
    return;
  }
  disposeTerrainResources(terrain);
}

/** Returns a caller-owned handle to a terrain resource shared by the repository. */
export function createTerrainLease(terrain, release) {
  const lease = { ...terrain };
  terrainLeaseDisposers.set(lease, release);
  return lease;
}

function disposeTerrainResources(terrain) {
  terrain.detailStreamer?.dispose();
  terrain.mesh.removeFromParent();
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  terrain.mesh.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
}

function makeHeightGeometry(values, width, height, referenceHeight, areaMeters) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(width * height * 3);
  const uvs = new Float32Array(width * height * 2);
  const indexLength = (width - 1) * (height - 1) * 6;
  const IndexArray = width * height > 65535 ? Uint32Array : Uint16Array;
  const indices = new IndexArray(indexLength);
  let indexOffset = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = row * width + col;
      positions[i * 3] = (col / (width - 1) - .5) * areaMeters;
      positions[i * 3 + 1] = values[i] - referenceHeight;
      // WCS raster row 0 is north; in the game north is +Z.
      positions[i * 3 + 2] = (.5 - row / (height - 1)) * areaMeters;
      uvs[i * 2] = col / (width - 1);
      uvs[i * 2 + 1] = 1 - row / (height - 1);
      if (col < width - 1 && row < height - 1) {
        const a = i, b = i + 1, c = i + width, d = c + 1;
        indices[indexOffset++] = a;
        indices[indexOffset++] = b;
        indices[indexOffset++] = c;
        indices[indexOffset++] = b;
        indices[indexOffset++] = d;
        indices[indexOffset++] = c;
      }
    }
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function sampleHeight(values, width, height, referenceHeight, areaMeters, x, z) {
  const col = THREE.MathUtils.clamp((x / areaMeters + .5) * (width - 1), 0, width - 1);
  const row = THREE.MathUtils.clamp((.5 - z / areaMeters) * (height - 1), 0, height - 1);
  const x0 = Math.floor(col), z0 = Math.floor(row), x1 = Math.min(x0 + 1, width - 1), z1 = Math.min(z0 + 1, height - 1);
  const tx = col - x0, tz = row - z0;
  const a = THREE.MathUtils.lerp(values[z0 * width + x0], values[z0 * width + x1], tx);
  const b = THREE.MathUtils.lerp(values[z1 * width + x0], values[z1 * width + x1], tx);
  return -250 + THREE.MathUtils.lerp(a, b, tz) - referenceHeight;
}

async function loadOrthophotoAtlas(base,grid,tilePixels,areaMeters,anisotropy,onProgress,signal) {
  const canvas = document.createElement('canvas');
  canvas.width = grid * tilePixels;
  canvas.height = grid * tilePixels;
  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.fillStyle = ATMOSPHERE.hazeColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const coverageTileSize = Math.ceil(tilePixels / 2);
  const coverageSize = grid * coverageTileSize;
  const coverageMask = new Uint8Array(coverageSize * coverageSize);
  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = tilePixels;
  tileCanvas.height = tilePixels;
  const tileContext = tileCanvas.getContext('2d', { willReadFrequently: true });
  const fogRgb = [0xa7, 0xb6, 0xbb];
  let loaded = 0;
  let completed = 0;
  const tileCount = grid * grid;
  const tiles = await Promise.all(Array.from({length:tileCount}, async (_,i) => {
    const row=Math.floor(i/grid),col=i%grid;
    try{return {row,col,image:await loadImage(`${base}/ortho-${row}-${col}.png`,signal)};}
    catch(error){if(signal?.aborted)throw error;return null;}
    finally{onProgress?.(++completed,tileCount);}
  }));
  for (const tile of tiles) {
    if(!tile)continue;
    const {row,col,image}=tile,x=col*tilePixels,y=row*tilePixels;
    tileContext.clearRect(0, 0, tilePixels, tilePixels);
    tileContext.drawImage(image, 0, 0, tilePixels, tilePixels);
    const tileData = tileContext.getImageData(0, 0, tilePixels, tilePixels);
    const block = 2;
    for (let maskRow = 0; maskRow < coverageTileSize; maskRow++) {
      for (let maskCol = 0; maskCol < coverageTileSize; maskCol++) {
        let valid = 0;
        const x0 = maskCol * block, y0 = maskRow * block;
        const x1 = Math.min(x0 + block, tilePixels), y1 = Math.min(y0 + block, tilePixels);
        for (let pixelY = y0; pixelY < y1; pixelY++) {
          for (let pixelX = x0; pixelX < x1; pixelX++) {
            const offset = (pixelY * tilePixels + pixelX) * 4;
            const missing = isNoDataOrthoPixel(tileData.data[offset], tileData.data[offset + 1], tileData.data[offset + 2]);
            if (!missing) valid++;
          }
        }
        const pixelCount = (x1 - x0) * (y1 - y0);
        const hasCoverage = valid >= Math.ceil(pixelCount * 0.75);
        const atlasMaskIndex = (row * coverageTileSize + maskRow) * coverageSize
          + col * coverageTileSize + maskCol;
        coverageMask[atlasMaskIndex] = hasCoverage ? 1 : 0;

        for (let pixelY = y0; pixelY < y1; pixelY++) {
          for (let pixelX = x0; pixelX < x1; pixelX++) {
            const offset = (pixelY * tilePixels + pixelX) * 4;
            const missing = isNoDataOrthoPixel(tileData.data[offset], tileData.data[offset + 1], tileData.data[offset + 2]);
            if (!hasCoverage || missing) {
              tileData.data[offset] = fogRgb[0];
              tileData.data[offset + 1] = fogRgb[1];
              tileData.data[offset + 2] = fogRgb[2];
              tileData.data[offset + 3] = 255;
            }
          }
        }
      }
    }
    tileContext.putImageData(tileData, 0, 0);
    ctx.drawImage(tileCanvas,x,y,tilePixels,tilePixels);
    loaded++;
  }
  if (!loaded) return null;
  const coverage = createCoverageField(coverageMask, coverageSize, coverageSize, areaMeters);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.max(1, anisotropy);
  return { texture, coverage };
}

function isNoDataOrthoPixel(red, green, blue) {
  const brightest = Math.max(red, green, blue);
  const darkest = Math.min(red, green, blue);
  if (brightest - darkest > 3) return false;
  const brightness = (red + green + blue) / 3;
  return brightness < 4 || brightness > 250 || (brightness >= 202 && brightness <= 216);
}

async function loadWaterAtlas(base,grid,tilePixels,onProgress,signal){
  const atlas=new Uint8Array(grid*tilePixels*grid*tilePixels);
  let completed = 0;
  const requests=Array.from({length:grid*grid},async(_,i)=>{
    const row=Math.floor(i/grid),col=i%grid;
    try{const response=await fetch(`${base}/water-${row}-${col}.bin`,{signal});if(!response.ok)return null;return{row,col,data:new Uint8Array(await response.arrayBuffer())};}
    catch(error){if(signal?.aborted)throw error;return null;}
    finally{onProgress?.(++completed,grid*grid);}
  });
  const tiles=await Promise.all(requests),width=grid*tilePixels;
  for(const tile of tiles){if(!tile||tile.data.length!==tilePixels*tilePixels)continue;
    for(let y=0;y<tilePixels;y++)atlas.set(tile.data.subarray(y*tilePixels,(y+1)*tilePixels),(tile.row*tilePixels+y)*width+tile.col*tilePixels);
  }
  return atlas;
}

function sampleWater(mask,grid,tilePixels,areaMeters,x,z){
  const half=areaMeters/2;
  if(!mask||Math.abs(x)>half||Math.abs(z)>half)return false;
  const size=grid*tilePixels;
  const col=THREE.MathUtils.clamp(Math.floor((x+half)/areaMeters*size),0,size-1);
  const row=THREE.MathUtils.clamp(Math.floor((half-z)/areaMeters*size),0,size-1);
  return mask[row*size+col]===1;
}

function repairMissingHeightSamples(values, width, height, referenceHeight, areaMeters, waterData) {
  const sampleCount = width * height;
  let missingCount = 0;
  for (let index = 0; index < sampleCount; index++) {
    if (!Number.isFinite(values[index]) || values[index] <= -1_000) missingCount++;
  }
  if (!missingCount) return;

  const nearestValid = new Int32Array(sampleCount);
  nearestValid.fill(-1);
  const distance = new Uint16Array(sampleCount);
  const queue = new Int32Array(sampleCount);
  let head = 0;
  let tail = 0;

  for (let index = 0; index < sampleCount; index++) {
    const value = values[index];
    if (Number.isFinite(value) && value > -1_000) {
      nearestValid[index] = index;
      queue[tail++] = index;
    }
  }
  if (!tail) {
    values.fill(referenceHeight);
    return;
  }

  // Multi-source flood fill gives each missing cell a nearby real elevation.
  // This keeps shoreline and coverage holes from turning into vertical walls.
  while (head < tail) {
    const index = queue[head++];
    const row = Math.floor(index / width);
    const column = index - row * width;
    const nextDistance = Math.min(65_535, distance[index] + 1);
    if (column > 0 && nearestValid[index - 1] === -1) {
      nearestValid[index - 1] = nearestValid[index];
      distance[index - 1] = nextDistance;
      queue[tail++] = index - 1;
    }
    if (column + 1 < width && nearestValid[index + 1] === -1) {
      nearestValid[index + 1] = nearestValid[index];
      distance[index + 1] = nextDistance;
      queue[tail++] = index + 1;
    }
    if (row > 0 && nearestValid[index - width] === -1) {
      nearestValid[index - width] = nearestValid[index];
      distance[index - width] = nextDistance;
      queue[tail++] = index - width;
    }
    if (row + 1 < height && nearestValid[index + width] === -1) {
      nearestValid[index + width] = nearestValid[index];
      distance[index + width] = nextDistance;
      queue[tail++] = index + width;
    }
  }

  const sampleMeters = areaMeters / Math.max(width - 1, height - 1);
  for (let index = 0; index < sampleCount; index++) {
    if (nearestValid[index] === index) continue;
    const sourceHeight = values[nearestValid[index]];
    const row = Math.floor(index / width);
    const column = index - row * width;
    const x = (column / (width - 1) - 0.5) * areaMeters;
    const z = (0.5 - row / (height - 1)) * areaMeters;
    const isWater = sampleWater(
      waterData.water,
      waterData.waterGrid,
      waterData.waterTilePixels,
      waterData.waterAreaMeters,
      x,
      z,
    );
    if (isWater && sourceHeight <= 12) {
      // NLS elevation tiles use NoData over the sea. Keep those areas at sea
      // level instead of letting the sentinel value stretch the mesh down.
      values[index] = 0;
      continue;
    }
    const distanceMeters = distance[index] * sampleMeters;
    const reliefBlend = THREE.MathUtils.smoothstep(distanceMeters, 0, 1_200);
    const relief = Math.sin(x * 0.00019 + Math.sin(z * 0.00011)) * 8
      + Math.cos(z * 0.00023 - Math.sin(x * 0.00009)) * 5;
    values[index] = sourceHeight + relief * reliefBlend;
  }
}

function loadImage(src, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }
    const image = new Image();
    const finish = (callback, value) => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener('abort', abort);
      callback(value);
    };
    const abort = () => {
      image.src = '';
      finish(reject, signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    };
    image.onload = () => finish(resolve, image);
    image.onerror = () => finish(reject, new Error(`image failed to load: ${src}`));
    signal?.addEventListener('abort', abort, { once: true });
    image.src = src;
  });
}

function makePreviewTerrain() {
  const size = FALLBACK_AREA_METERS, segments = 160;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  const colors = [];
  const low = new THREE.Color('#35423d'), high = new THREE.Color('#606452');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = previewHeight(x, z) + 250;
    pos.setY(i, y);
    const color = low.clone().lerp(high, THREE.MathUtils.clamp((y + 40) / 100, 0, .8));
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  mesh.position.y = -250; mesh.receiveShadow = true;
  mesh.add(makeHorizonTerrain(size, previewHeight));
  const operationBounds={minX:-size*.5,maxX:size*.5,minZ:-size*.5,maxZ:size*.5};
  const boundaryLine = makeTheaterBoundaryLine(operationBounds, previewHeight);
  mesh.add(boundaryLine);
  return { mesh, real: false, worldSize:size, terrainSize:size, operationBounds, sampleHeight: previewHeight, boundaryLine, isWater: () => false };
}

function makeHorizonTerrain(worldSize, sampleWorldHeight) {
  // A lightweight 1 km grid extends the landform beyond the playable map.
  // It is visual only: mission bounds, radar, and collision remain unchanged.
  const extent = 160_000;
  const segments = 160;
  const halfWorld = worldSize / 2;
  const geometry = new THREE.PlaneGeometry(extent, extent, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const low = new THREE.Color('#263b36');
  const high = new THREE.Color('#53604a');
  const haze = new THREE.Color(ATMOSPHERE.hazeColor);
  const color = new THREE.Color();
  const transitionInside = 1_500;
  const transitionOutside = 14_000;

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const clampedX = THREE.MathUtils.clamp(x, -halfWorld, halfWorld);
    const clampedZ = THREE.MathUtils.clamp(z, -halfWorld, halfWorld);
    const outsideDistance = Math.hypot(x - clampedX, z - clampedZ);
    const edgeDistance = halfWorld - Math.max(Math.abs(x), Math.abs(z));
    const edgeHeight = sampleWorldHeight(clampedX, clampedZ);
    let worldHeight;

    if (outsideDistance === 0) {
      // Keep the horizon mesh just below the detailed map, then bury it under
      // the terrain quickly enough that it cannot create an inner trench.
      worldHeight = edgeHeight - 2 - 92 * smoothstep(0, transitionInside, edgeDistance);
    } else {
      // Continue each edge's own elevation instead of snapping to a global
      // sea-level-like plane. Broad, low-amplitude relief keeps the far field
      // alive without creating a visible cliff at the map boundary.
      const rollingLowland = edgeHeight
        + Math.sin(x * 0.00013 + Math.sin(z * 0.00007)) * 10
        + Math.cos(z * 0.00016 - Math.sin(x * 0.00006)) * 7
        + Math.sin((x + z) * 0.00009) * 4;
      const blend = smoothstep(0, transitionOutside, outsideDistance);
      worldHeight = THREE.MathUtils.lerp(edgeHeight - 2, rollingLowland, blend);
    }

    positions.setY(i, worldHeight + 250);
    const broadVariation = Math.sin(x * 0.0007 + z * 0.00031) * 0.5 + 0.5;
    const edgeFade = THREE.MathUtils.clamp(outsideDistance / 18_000, 0, 1);
    color.copy(low).lerp(high, 0.15 + broadVariation * 0.24 + edgeFade * 0.08);
    if (outsideDistance > 0) color.lerp(haze, smoothstep(180, 2_800, outsideDistance) * 0.985);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'visual-horizon-terrain';
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  return mesh;
}

function makeTheaterBoundaryLine(bounds, sampleWorldHeight, coverage = null) {
  const edges = [];
  if (coverage) {
    const displayCoverage = { ...coverage, mask: smoothCoverageBoundary(coverage) };
    forEachCoverageEdge(displayCoverage, (x0, z0, x1, z1, normalX, normalZ) => {
      edges.push({ x0, z0, x1, z1, normalX, normalZ });
    });
  } else {
    edges.push(
      { x0: bounds.minX, z0: bounds.minZ, x1: bounds.maxX, z1: bounds.minZ, normalX: 0, normalZ: -1 },
      { x0: bounds.maxX, z0: bounds.minZ, x1: bounds.maxX, z1: bounds.maxZ, normalX: 1, normalZ: 0 },
      { x0: bounds.maxX, z0: bounds.maxZ, x1: bounds.minX, z1: bounds.maxZ, normalX: 0, normalZ: 1 },
      { x0: bounds.minX, z0: bounds.maxZ, x1: bounds.minX, z1: bounds.minZ, normalX: -1, normalZ: 0 },
    );
  }

  const makeStrip = (halfWidth, color) => {
    const positions = [];
    const indices = [];
    for (const edge of edges) {
      const dx = edge.x1 - edge.x0;
      const dz = edge.z1 - edge.z0;
      const length = Math.hypot(dx, dz);
      if (length === 0) continue;
      const crossX = -dz / length;
      const crossZ = dx / length;
      const first = positions.length / 3;
      for (const [x, z] of [
        [edge.x0 - crossX * halfWidth, edge.z0 - crossZ * halfWidth],
        [edge.x0 + crossX * halfWidth, edge.z0 + crossZ * halfWidth],
        [edge.x1 + crossX * halfWidth, edge.z1 + crossZ * halfWidth],
        [edge.x1 - crossX * halfWidth, edge.z1 - crossZ * halfWidth],
      ]) {
        positions.push(x, sampleWorldHeight(x, z) + 255, z);
      }
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.NormalBlending,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }));
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    return mesh;
  };

  const boundary = new THREE.Group();
  boundary.name = 'theater-boundary-system';
  const haze = makeStrip(42, '#d84b50');
  haze.name = 'theater-boundary-haze';
  const glow = makeStrip(16, '#ee4548');
  glow.name = 'theater-boundary-glow';
  const core = makeStrip(2.5, '#ff514d');
  core.name = 'theater-boundary-marking';
  boundary.add(haze, glow, core);
  boundary.userData.hazeMaterial = haze.material;
  boundary.userData.glowMaterial = glow.material;
  boundary.userData.coreMaterial = core.material;
  boundary.frustumCulled = false;
  boundary.visible = false;
  return boundary;
}

function smoothCoverageBoundary(coverage) {
  const { mask, distance, width, height } = coverage;
  const smoothed = mask.slice();
  const active = new Uint8Array(mask.length);
  const activeCells = [];
  const radius = 2;
  const markActive = index => {
    if (active[index]) return;
    active[index] = 1;
    activeCells.push(index);
  };

  // Only smooth a narrow band beside the true edge; the interior mask used
  // for collision and mission limits remains untouched.
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      if (!mask[index] || distance[index] > 12) continue;
      for (let offsetY = -radius; offsetY <= radius; offsetY++) {
        const neighborRow = row + offsetY;
        if (neighborRow < 0 || neighborRow >= height) continue;
        for (let offsetX = -radius; offsetX <= radius; offsetX++) {
          const neighborCol = col + offsetX;
          if (neighborCol >= 0 && neighborCol < width) markActive(neighborRow * width + neighborCol);
        }
      }
    }
  }

  for (let pass = 0; pass < radius; pass++) {
    const next = smoothed.slice();
    for (const index of activeCells) {
      const row = Math.floor(index / width);
      const col = index - row * width;
      let coveredNeighbors = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY++) {
        const neighborRow = row + offsetY;
        if (neighborRow < 0 || neighborRow >= height) continue;
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          const neighborCol = col + offsetX;
          if (neighborCol >= 0 && neighborCol < width
            && smoothed[neighborRow * width + neighborCol]) coveredNeighbors++;
        }
      }
      next[index] = coveredNeighbors >= 5 ? 1 : 0;
    }
    smoothed.set(next);
  }

  // Preserve internal image gaps as non-edges, just as the gameplay mask does.
  fillEnclosedNoData(smoothed, width, height);
  return smoothed;
}

function smoothstep(min, max, value) {
  const t = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

function previewHeight(x, z) {
  return -250 + Math.sin(x * .0012) * 20 + Math.cos(z * .0015) * 14 + Math.sin((x + z) * .003) * 7;
}
