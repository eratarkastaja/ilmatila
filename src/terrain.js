import * as THREE from 'three';

const TERRAIN_PATH = '/terrain';
const FALLBACK_AREA_METERS = 16000;
const ORTHO_TILE_METERS = 2000;
const TILE_PIXELS = 320;
const ORTHO_GRID = 8;
let terrainIndexPromise;

export const TERRAIN_AREAS = [
  { id: 'paijanne', label: 'Päijänne' },
  { id: 'vironlahti', label: 'Virolahti' },
  { id: 'ilomantsi', label: 'Ilomantsi' },
  { id: 'kuusamo', label: 'Kuusamo' },
];

export function loadTerrainAreas() {
  if (!terrainIndexPromise) {
    terrainIndexPromise = fetch(`${TERRAIN_PATH}/index.json`)
      .then(response => response.ok ? response.json() : null)
      .then(index => index?.areas?.length ? index.areas : TERRAIN_AREAS)
      .catch(() => TERRAIN_AREAS);
  }
  return terrainIndexPromise;
}

export async function createTerrain({ areaId, fallback = true, onProgress } = {}) {
  const report = (progress, detail) => onProgress?.(THREE.MathUtils.clamp(progress, 0, 1), detail);
  try {
    report(0.01, { key: 'terrain.fetchingArea' });
    const areas = await loadTerrainAreas();
    const requested = areaId || new URLSearchParams(location.search).get('area');
    const selected=areas.find(area=>area.id===requested)||areas.find(area=>area.id==='paijanne')||areas[0];
    if(!selected)throw new Error('no terrain areas are available');
    const base=`${TERRAIN_PATH}/areas/${selected.id}`;
    const metaResponse = await fetch(`${base}/terrain.json`);
    if (!metaResponse.ok) throw new Error('selected terrain metadata is missing');
    const metadata = await metaResponse.json();
    report(0.04, { key: 'terrain.areaFound' });
    const heightResponse = await fetch(`${base}/height.f32`);
    if (!heightResponse.ok) throw new Error('height grid is missing');
    const bytes = await heightResponse.arrayBuffer();
    const values = new Float32Array(bytes);
    if (values.length !== metadata.width * metadata.height) throw new Error('height grid dimensions do not match metadata');
    report(0.09, { key: 'terrain.elevationLoaded' });

    const areaMeters=metadata.areaMeters??FALLBACK_AREA_METERS;
    const orthoAreaMeters=metadata.orthoAreaMeters??ORTHO_GRID*ORTHO_TILE_METERS;
    const orthoGrid=metadata.orthoGrid??ORTHO_GRID;
    const tilePixels=metadata.orthoTilePixels??TILE_PIXELS;
    const geometry = makeHeightGeometry(values, metadata.width, metadata.height, metadata.referenceHeight, areaMeters);
    let orthoLoaded = 0, waterLoaded = 0;
    const tileCount = orthoGrid * orthoGrid;
    const reportTiles = () => report(
      0.09 + 0.82 * (0.76 * orthoLoaded / tileCount + 0.24 * waterLoaded / tileCount),
      { key: 'terrain.imageryProgress', params: { imagery: orthoLoaded, total: tileCount, water: waterLoaded } },
    );
    const [texture, water] = await Promise.all([
      loadOrthophotoAtlas(base, orthoGrid, tilePixels, (loaded) => { orthoLoaded = loaded; reportTiles(); }),
      loadWaterAtlas(base, orthoGrid, tilePixels, (loaded) => { waterLoaded = loaded; reportTiles(); }),
    ]);
    report(0.95, { key: 'terrain.finalizing' });
    const material = new THREE.MeshStandardMaterial({
      color: '#d1d6ca', map: texture, roughness: 1, metalness: 0, flatShading: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = -250;
    mesh.receiveShadow = true;
    const terrain = {
      id:selected.id, label:selected.label, mesh, real: true, metadata, worldSize:areaMeters,
      sampleHeight: (x, z) => sampleHeight(values, metadata.width, metadata.height, metadata.referenceHeight, areaMeters, x, z),
      isWater: (x, z) => sampleWater(water, orthoGrid, tilePixels, orthoAreaMeters, x, z),
    };
    const areaLabel = document.querySelector('#area-name');
    if (areaLabel && metadata.region) areaLabel.textContent = metadata.region.toUpperCase();
    report(1, { key: 'terrain.ready' });
    return terrain;
  } catch (error) {
    if (!fallback) throw error;
    console.info(`Finnish terrain package unavailable; using preview terrain (${error.message}).`);
    report(1, { key: 'terrain.preview' });
    return createPreviewTerrain();
  }
}

export function createPreviewTerrain() {
  return { ...makePreviewTerrain(), id: 'preview', label: 'Esimerkkimaa' };
}

function makeHeightGeometry(values, width, height, referenceHeight, areaMeters) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(width * height * 3);
  const uvs = new Float32Array(width * height * 2);
  const indices = [];
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
        indices.push(a, b, c, b, d, c);
      }
    }
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
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

async function loadOrthophotoAtlas(base,grid,tilePixels,onProgress) {
  const canvas = document.createElement('canvas');
  canvas.width = grid * tilePixels;
  canvas.height = grid * tilePixels;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#465347'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  let loaded = 0;
  let completed = 0;
  const tileCount = grid * grid;
  const tiles = await Promise.all(Array.from({length:tileCount}, async (_,i) => {
    const row=Math.floor(i/grid),col=i%grid;
    try{return {row,col,image:await loadImage(`${base}/ortho-${row}-${col}.png`)};}
    catch{return null;}
    finally{onProgress?.(++completed,tileCount);}
  }));
  for (const tile of tiles) {
    if(!tile)continue;
    const {row,col,image}=tile,x=col*tilePixels,y=row*tilePixels;
    ctx.drawImage(image,x,y,tilePixels,tilePixels);
    loaded++;
  }
  if (!loaded) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

async function loadWaterAtlas(base,grid,tilePixels,onProgress){
  const atlas=new Uint8Array(grid*tilePixels*grid*tilePixels);
  let completed = 0;
  const requests=Array.from({length:grid*grid},async(_,i)=>{
    const row=Math.floor(i/grid),col=i%grid;
    try{const response=await fetch(`${base}/water-${row}-${col}.bin`);if(!response.ok)return null;return{row,col,data:new Uint8Array(await response.arrayBuffer())};}
    catch{return null;}
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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src;
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
  return { mesh, real: false, worldSize:size, sampleHeight: previewHeight, isWater: () => false };
}

function previewHeight(x, z) {
  return -250 + Math.sin(x * .0012) * 20 + Math.cos(z * .0015) * 14 + Math.sin((x + z) * .003) * 7;
}
