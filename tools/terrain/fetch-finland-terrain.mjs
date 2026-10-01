import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { deflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { fromArrayBuffer } from 'geotiff';
import sharp from 'sharp';

const API_KEY = process.env.NLS_API_KEY;
if (!API_KEY) {
  console.error('Set NLS_API_KEY in the environment; the key is never bundled into the browser app.');
  process.exit(1);
}

// Centers in ETRS-TM35FIN (EPSG:3067), metres. One selected area is 32 x 32 km.
const REGIONS = [
  { id: 'paijanne', label: 'Päijänne', e: 435090, n: 6903772 },
  { id: 'vironlahti', label: 'Virolahti', e: 538370, n: 6715098 },
  { id: 'ilomantsi', label: 'Ilomantsi', e: 701217, n: 6954956 },
  { id: 'kuusamo', label: 'Kuusamo', e: 599082, n: 7317173 },
];
const DEM_SIZE = 32000;
const DEM_TILE_SIZE = 8000;
const DEM_TILES_PER_AXIS = DEM_SIZE / DEM_TILE_SIZE;
const ORTHO_TILE_SIZE = 2000;
const ORTHO_GRID = DEM_SIZE / ORTHO_TILE_SIZE;
const ORTHO_SCALE = 0.064; // 256 px per 2 km tile; detail imagery supplies the local sharpness.
const WATER_TILE_PIXELS = 256;
const DETAIL_ORTHO_SCALE = 0.25; // ~1,000 px/tile (about 2 m/pixel) across the full theater.
const DETAIL_ORTHO_GRID = ORTHO_GRID;
const DETAIL_ORTHO_TILE_PIXELS = 1000;
const DETAIL_ONLY = process.argv.includes('--detail-only');
const OUTPUT_DIR = process.env.TERRAIN_OUTPUT_DIR;
const OUT_ROOT = OUTPUT_DIR
  ? pathToFileURL(`${resolve(OUTPUT_DIR)}${sep}`)
  : new URL('../../public/terrain/', import.meta.url);
const WCS = 'https://avoin-karttakuva.maanmittauslaitos.fi/ortokuvat-ja-korkeusmallit/wcs/v2';
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});

await mkdir(OUT_ROOT, { recursive: true });
const available = [], failures = [];
for (const region of REGIONS) {
  try {
    await fetchRegion(region);
    available.push({ id: region.id, label: region.label });
  } catch (error) {
    failures.push({ id: region.id, message: redact(error.message) });
    console.error(`${region.label}: failed (${redact(error.message)})`);
  }
}
if (!DETAIL_ONLY) await writeFile(new URL('index.json', OUT_ROOT), JSON.stringify({ areas: available }, null, 2));
console.log(`Terrain packages ready: ${available.length}/${REGIONS.length}.`);
if (failures.length) console.log(`Unavailable areas: ${failures.map(f => f.id).join(', ')}.`);
if (failures.length) process.exitCode = 1;

async function fetchRegion(region) {
  const out = new URL(`areas/${region.id}/`, OUT_ROOT);
  await mkdir(out, { recursive: true });
  const metadataPath = new URL('terrain.json', out);
  let metadata;
  let detailLayout = {
    grid: DETAIL_ORTHO_GRID,
    tileSize: ORTHO_TILE_SIZE,
    tilePixels: DETAIL_ORTHO_TILE_PIXELS,
  };
  if (DETAIL_ONLY) {
    metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    for (const name of ['height.f32', 'ortho-0-0.png', 'water-0-0.bin']) {
      try { await readFile(new URL(name, out)); }
      catch { throw new Error(`detail-only mode needs an existing terrain package (${name} is missing)`); }
    }
    const existingGrid = metadata.detailOrthoGrid ?? metadata.orthoGrid;
    const existingExtent = metadata.detailOrthoAreaMeters ?? metadata.orthoAreaMeters;
    detailLayout = {
      grid: existingGrid,
      tileSize: metadata.detailOrthoTileSizeMeters ?? existingExtent / existingGrid,
      tilePixels: metadata.detailOrthoTilePixels ?? DETAIL_ORTHO_TILE_PIXELS,
    };
    console.log(`\n${region.label}: refreshing theater-wide 2 m imagery.`);
  } else {
    console.log(`\n${region.label}: 32 x 32 km height data around E ${region.e}, N ${region.n} (EPSG:3067)`);
    const { width, height, values } = await fetchElevationGrid(region);
    const valid = values.filter(value => Number.isFinite(value) && value > -1_000);
    if (!valid.length) throw new Error('elevation grid contains no data');
    const referenceHeight = valid[Math.floor(valid.length / 2)];
    fillMissingElevations(values, width, height, referenceHeight);
    const raw = Buffer.allocUnsafe(values.length * 4);
    for (let i = 0; i < values.length; i++) raw.writeFloatLE(values[i], i * 4);
    await writeFile(new URL('height.f32', out), raw);
    console.log(`DEM ready: ${width} x ${height} samples.`);
    const downloadedAt = new Date().toISOString().slice(0, 10);
    metadata = {
      id: region.id, region: region.label, width, height, referenceHeight,
      centerE: region.e, centerN: region.n,
      areaMeters: DEM_SIZE, orthoAreaMeters: DEM_SIZE,
      orthoGrid: ORTHO_GRID, orthoTilePixels: WATER_TILE_PIXELS,
      downloadedAt, retrievalDates: [downloadedAt],
      attribution: {
        provider: 'National Land Survey of Finland',
        datasets: ['Elevation Model 2 m', 'Colour Orthophotos (ortokuva_vari)'],
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        sourceUrl: 'https://www.maanmittauslaitos.fi/ortokuvien-ja-korkeusmallien-kyselypalvelu/tekninen-kuvaus',
        modifications: 'Elevation samples were downsampled and mosaicked from tiled requests; orthophotos were cropped, resampled, tiled, and recompressed; theater-wide 2 m imagery was also downsampled for the base layer; water masks were derived from orthophoto colors.',
        retrievalDate: downloadedAt,
      },
    };
  }

  const detailPixels = await fetchMovingDetailOrthophotos(region, out, {
    ...detailLayout,
    includeBase: !DETAIL_ONLY,
  });
  await removeLegacyCenterTiles(out, metadata.nearOrthoGrid);
  const downloadedAt = new Date().toISOString().slice(0, 10);
  const retrievalDates = [...new Set([...(metadata.retrievalDates ?? [metadata.downloadedAt]), downloadedAt])].sort();
  delete metadata.nearOrthoAreaMeters;
  delete metadata.nearOrthoGrid;
  delete metadata.nearOrthoTilePixels;
  delete metadata.nearOrthoRetrievedAt;
  metadata.detailOrthoAreaMeters = detailLayout.grid * detailLayout.tileSize;
  metadata.detailOrthoGrid = detailLayout.grid;
  metadata.detailOrthoTileSizeMeters = detailLayout.tileSize;
  metadata.detailOrthoTilePixels = detailPixels;
  metadata.detailOrthoRetrievedAt = downloadedAt;
  metadata.downloadedAt = downloadedAt;
  metadata.retrievalDates = retrievalDates;
  metadata.attribution.modifications = DETAIL_ONLY
    ? `${metadata.attribution.modifications} Moving detail imagery was refreshed at about 2 m/pixel and JPEG-encoded at quality 84 with 4:2:0 chroma subsampling.`
    : 'Elevation samples were downsampled and mosaicked from tiled requests; orthophotos were cropped, resampled, tiled, and recompressed; theater-wide 2 m imagery was downsampled for the base layer and JPEG-encoded at quality 84 with 4:2:0 chroma subsampling for the moving detail layer; water masks were derived from orthophoto colors.';
  metadata.attribution.retrievalDate = downloadedAt;
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`${region.label}: moving theater detail ready (${detailPixels} px/tile).`);
}

async function removeLegacyCenterTiles(out, oldGrid = 2) {
  const grid = Number.isInteger(oldGrid) ? Math.min(Math.max(oldGrid, 2), 4) : 2;
  const files = [];
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      files.push(`near-ortho-${row}-${col}.jpg`, `near-ortho-${row}-${col}.png`);
    }
  }
  await Promise.all(files.map(name => rm(new URL(name, out), { force: true })));
}

async function fetchMovingDetailOrthophotos(region, out, { grid, tileSize, tilePixels, includeBase = false }) {
  const tiles = [];
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) tiles.push({ row, col });
  }
  let completed = 0;
  const sizes = new Set();
  try {
    for (let start = 0; start < tiles.length; start += 2) {
      const batch = await Promise.all(tiles.slice(start, start + 2).map(async ({ row, col }) => {
        const size = await fetchOrthoTile(region, out, row, col, {
          detail: true,
          temporary: true,
          includeBase,
          grid,
          tileSize,
        });
        sizes.add(`${size.width}x${size.height}`);
        completed++;
        if (completed === tiles.length || completed % 8 === 0) {
          console.log(`${region.label}: moving detail tiles ${completed}/${tiles.length}`);
        }
        return { row, col, size };
      }));
      if (batch.some(({ size }) => size.width !== size.height || size.width !== tilePixels)) {
        throw new Error(`moving-detail WCS tile must be ${tilePixels} x ${tilePixels} pixels`);
      }
    }
    if (sizes.size !== 1) throw new Error('moving-detail orthophoto tiles have inconsistent dimensions');
    for (const { row, col } of tiles) {
      await rename(new URL(`detail-ortho-${row}-${col}.pending.jpg`, out), new URL(`detail-ortho-${row}-${col}.jpg`, out));
    }
  } catch (error) {
    await Promise.all(tiles.map(({ row, col }) => rm(new URL(`detail-ortho-${row}-${col}.pending.jpg`, out), { force: true })));
    throw error;
  }
  for (const { row, col } of tiles) await rm(new URL(`detail-ortho-${row}-${col}.png`, out), { force: true });
  return tilePixels;
}

async function fetchOrthoTile(region,out,row,col,{detail=false,temporary=false,includeBase=false,grid=ORTHO_GRID,tileSize=ORTHO_TILE_SIZE}={}){
  const scale=detail?DETAIL_ORTHO_SCALE:ORTHO_SCALE;
  const west=region.e-grid*tileSize/2+col*tileSize;
  const south=region.n+grid*tileSize/2-(row+1)*tileSize;
  const east=west+tileSize,north=south+tileSize;
  const params=new URLSearchParams({
    service:'WCS',version:'2.0.1',request:'GetCoverage',coverageID:'ortokuva_vari',
    format:'image/tiff',SCALEFACTOR:String(scale),'api-key':API_KEY,
  });
  params.append('SUBSET',`E(${west},${east})`);params.append('SUBSET',`N(${south},${north})`);
  const response=await fetchWithRetry(`${WCS}?${params}`);
  if(!response.ok)throw new Error(`orthophoto tile ${row}-${col} returned HTTP ${response.status}: ${(await response.text()).slice(0,180)}`);
  const tiff=await fromArrayBuffer(await response.arrayBuffer()),image=await tiff.getImage();
  const pixels=await image.readRasters({interleave:true}),width=image.getWidth(),height=image.getHeight();
  const rgba=toRgba(pixels,width,height,image.getSamplesPerPixel());
  const prefix=detail?'detail-ortho':'ortho';
  if (detail) {
    const jpeg = await sharp(rgba, { raw: { width, height, channels: 4 } })
      .jpeg({ quality: 84, chromaSubsampling: '4:2:0', progressive: true })
      .toBuffer();
    const suffix = temporary ? '.pending.jpg' : '.jpg';
    await writeFile(new URL(`${prefix}-${row}-${col}${suffix}`,out),jpeg);
    if (includeBase) {
      const basePng = await sharp(rgba, { raw: { width, height, channels: 4 } })
        .resize(WATER_TILE_PIXELS, WATER_TILE_PIXELS, { fit: 'fill' })
        .png()
        .toBuffer();
      await writeFile(new URL(`ortho-${row}-${col}.png`,out),basePng);
      await writeWaterMask(out,row,col,rgba,width,height);
    }
  } else {
    await writeFile(new URL(`${prefix}-${row}-${col}.png`,out),encodePng(width,height,rgba));
  }
  if(!detail)await writeWaterMask(out,row,col,rgba,width,height);
  return { width, height };
}

async function fetchElevationGrid(region) {
  const tiles = [];
  const half = DEM_SIZE / 2;
  for (let row = 0; row < DEM_TILES_PER_AXIS; row++) {
    for (let col = 0; col < DEM_TILES_PER_AXIS; col++) {
      const west = region.e - half + col * DEM_TILE_SIZE;
      const north = region.n + half - row * DEM_TILE_SIZE;
      const params = new URLSearchParams({
        service: 'WCS', version: '2.0.1', request: 'GetCoverage', coverageID: 'korkeusmalli_2m',
        format: 'text/plain', SCALEFACTOR: '0.05', 'api-key': API_KEY,
      });
      params.append('SUBSET', `E(${west},${west + DEM_TILE_SIZE})`);
      params.append('SUBSET', `N(${north - DEM_TILE_SIZE},${north})`);
      tiles.push({ row, col, url: `${WCS}?${params}` });
    }
  }

  const grids = [];
  for (let start = 0; start < tiles.length; start += 4) {
    const batch = await Promise.all(tiles.slice(start, start + 4).map(async tile => ({
      ...tile,
      grid: parseAsciiGrid(await checkedText(tile.url)),
    })));
    grids.push(...batch);
    console.log(`${region.label}: elevation tiles ${grids.length}/${tiles.length}`);
  }

  const tileWidth = grids[0].grid.width;
  const tileHeight = grids[0].grid.height;
  if (grids.some(tile => tile.grid.width !== tileWidth || tile.grid.height !== tileHeight)) {
    throw new Error('elevation tiles have inconsistent dimensions');
  }
  const width = tileWidth * DEM_TILES_PER_AXIS;
  const height = tileHeight * DEM_TILES_PER_AXIS;
  if (width * height > 1_000_000) throw new Error('mosaicked elevation grid exceeds the supported sample limit');
  const values = new Float32Array(width * height);
  for (const { row, col, grid } of grids) {
    for (let tileRow = 0; tileRow < tileHeight; tileRow++) {
      const sourceStart = tileRow * tileWidth;
      const targetStart = (row * tileHeight + tileRow) * width + col * tileWidth;
      values.set(grid.values.subarray(sourceStart, sourceStart + tileWidth), targetStart);
    }
  }
  return { width, height, values };
}

function fillMissingElevations(values, width, height, fallbackHeight) {
  const nearestValid = new Int32Array(values.length);
  nearestValid.fill(-1);
  const queue = new Int32Array(values.length);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < values.length; index++) {
    if (Number.isFinite(values[index]) && values[index] > -1_000) {
      nearestValid[index] = index;
      queue[tail++] = index;
    }
  }
  if (!tail) {
    values.fill(fallbackHeight);
    return;
  }

  while (head < tail) {
    const index = queue[head++];
    const row = Math.floor(index / width);
    const column = index - row * width;
    const source = nearestValid[index];
    if (column > 0 && nearestValid[index - 1] === -1) {
      nearestValid[index - 1] = source;
      queue[tail++] = index - 1;
    }
    if (column + 1 < width && nearestValid[index + 1] === -1) {
      nearestValid[index + 1] = source;
      queue[tail++] = index + 1;
    }
    if (row > 0 && nearestValid[index - width] === -1) {
      nearestValid[index - width] = source;
      queue[tail++] = index - width;
    }
    if (row + 1 < height && nearestValid[index + width] === -1) {
      nearestValid[index + width] = source;
      queue[tail++] = index + width;
    }
  }

  for (let index = 0; index < values.length; index++) {
    if (nearestValid[index] !== index) values[index] = values[nearestValid[index]] ?? fallbackHeight;
  }
}

async function checkedText(url){
  const response=await fetchWithRetry(url),text=await response.text();
  if(!response.ok||!/ncols\s+\d+/i.test(text))throw new Error(`elevation request returned HTTP ${response.status}: ${text.slice(0,300)}`);
  return text;
}
async function fetchWithRetry(url, attempts = 5) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      lastError = new Error(`WCS returned HTTP ${response.status}`);
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 30_000)
        : Math.min(1000 * (2 ** attempt), 20_000);
      if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, Math.min(1000 * (2 ** attempt), 20_000)));
    }
  }
  throw lastError ?? new Error('WCS request failed');
}
function parseAsciiGrid(text){
  const lines=text.trim().split(/\r?\n/),header={};let firstData=0;
  for(;firstData<lines.length;firstData++){
    const match=lines[firstData].trim().match(/^(ncols|nrows|xllcorner|yllcorner|cellsize|nodata_value)\s+(.+)$/i);
    if(!match)break;header[match[1].toLowerCase()]=Number(match[2]);
  }
  const width=header.ncols,height=header.nrows,nodata=header.nodata_value;
  if(!width||!height)throw new Error('WCS returned an invalid ASCII grid header');
  const cells=lines.slice(firstData).join(' ').trim().split(/\s+/).map(Number);
  if(cells.length!==width*height)throw new Error(`grid size mismatch: expected ${width*height}, received ${cells.length}`);
  return{width,height,values:Float32Array.from(cells,value=>value===nodata?Number.NaN:value)};
}
function toRgba(pixels,width,height,channels){
  const output=Buffer.allocUnsafe(width*height*4);
  for(let i=0;i<width*height;i++){
    const src=i*channels,dst=i*4;
    if(channels===1)output[dst]=output[dst+1]=output[dst+2]=pixels[src];
    else{output[dst]=pixels[src];output[dst+1]=pixels[src+1];output[dst+2]=pixels[src+2];}
    output[dst+3]=channels>3?pixels[src+3]:255;
  }
  return output;
}
function encodePng(width,height,rgba){
  const scanlines=Buffer.allocUnsafe(height*(width*4+1));
  for(let y=0;y<height;y++){const dst=y*(width*4+1);scanlines[dst]=0;rgba.copy(scanlines,dst+1,y*width*4,(y+1)*width*4);}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(scanlines)),chunk('IEND',Buffer.alloc(0))]);
}
async function writeWaterMask(out,tileRow,tileCol,rgba,width,height){
  const mask=Buffer.alloc(WATER_TILE_PIXELS*WATER_TILE_PIXELS);
  for(let y=0;y<WATER_TILE_PIXELS;y++)for(let x=0;x<WATER_TILE_PIXELS;x++){
    const sx=Math.min(width-1,Math.floor(x*width/WATER_TILE_PIXELS)),sy=Math.min(height-1,Math.floor(y*height/WATER_TILE_PIXELS));
    const i=(sy*width+sx)*4,r=rgba[i],g=rgba[i+1],b=rgba[i+2];
    // NLS water is often dark blue-grey, so the old strict blue threshold missed lake interiors.
    mask[y*WATER_TILE_PIXELS+x]=(b>r*1.12&&b>g*1.015&&b-r>=5&&b<205)?1:0;
  }
  await writeFile(new URL(`water-${tileRow}-${tileCol}.bin`,out),mask);
}
function chunk(type,data){
  const name=Buffer.from(type),size=Buffer.alloc(4);size.writeUInt32BE(data.length);
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));
  return Buffer.concat([size,name,data,crc]);
}
function crc32(buffer){let c=0xffffffff;for(const b of buffer)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function redact(value){return String(value).replaceAll(API_KEY,'[redacted]');}
