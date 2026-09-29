import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { fromArrayBuffer } from 'geotiff';

const API_KEY = process.env.NLS_API_KEY;
if (!API_KEY) {
  console.error('Set NLS_API_KEY in the environment; the key is never bundled into the browser app.');
  process.exit(1);
}

// Centers in ETRS-TM35FIN (EPSG:3067), metres. One selected area is 16 x 16 km.
const REGIONS = [
  { id: 'paijanne', label: 'Päijänne', e: 435090, n: 6903772 },
  { id: 'vironlahti', label: 'Virolahti', e: 538370, n: 6715098 },
  { id: 'ilomantsi', label: 'Ilomantsi', e: 701217, n: 6954956 },
  { id: 'kuusamo', label: 'Kuusamo', e: 599082, n: 7317173 },
];
const DEM_SIZE = 16000;
const ORTHO_TILE_SIZE = 2000;
const ORTHO_GRID = 8;
const ORTHO_SCALE = 0.08; // ~320 px/tile (6.25 m pixels); NLS allows at most 4,000 px/tile.
const WATER_TILE_PIXELS = 320;
const OUT_ROOT = new URL('../../public/terrain/', import.meta.url);
const WCS = 'https://avoin-karttakuva.maanmittauslaitos.fi/ortokuvat-ja-korkeusmallit/wcs/v2';
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});

await mkdir(OUT_ROOT, { recursive: true });
const available = [], failures = [];
for (const region of REGIONS) {
  try {
    await fetchRegion(region);
    available.push({ id: region.id, label: region.label });
  } catch (error) {
    failures.push({ id: region.id, message: error.message });
    console.error(`${region.label}: failed (${error.message})`);
  }
}
await writeFile(new URL('index.json', OUT_ROOT), JSON.stringify({ areas: available }, null, 2));
console.log(`Terrain packages ready: ${available.length}/${REGIONS.length}.`);
if (failures.length) console.log(`Unavailable areas: ${failures.map(f => f.id).join(', ')}.`);

async function fetchRegion(region) {
  const out = new URL(`areas/${region.id}/`, OUT_ROOT);
  await mkdir(out, { recursive: true });
  console.log(`\n${region.label}: 16 x 16 km height data around E ${region.e}, N ${region.n} (EPSG:3067)`);
  const demParams = new URLSearchParams({
    service: 'WCS', version: '2.0.1', request: 'GetCoverage', coverageID: 'korkeusmalli_2m',
    format: 'text/plain', SCALEFACTOR: '0.05', 'api-key': API_KEY,
  });
  demParams.append('SUBSET', `E(${region.e - DEM_SIZE/2},${region.e + DEM_SIZE/2})`);
  demParams.append('SUBSET', `N(${region.n - DEM_SIZE/2},${region.n + DEM_SIZE/2})`);
  const demText = await checkedText(`${WCS}?${demParams}`);
  const { width, height, values } = parseAsciiGrid(demText);
  const valid = values.filter(Number.isFinite);
  if (!valid.length) throw new Error('elevation grid contains no data');
  const referenceHeight = valid[Math.floor(valid.length / 2)];
  for (let i = 0; i < values.length; i++) if (!Number.isFinite(values[i])) values[i] = referenceHeight;
  const raw = Buffer.allocUnsafe(values.length * 4);
  for (let i = 0; i < values.length; i++) raw.writeFloatLE(values[i], i * 4);
  await writeFile(new URL('height.f32', out), raw);
  console.log(`DEM ready: ${width} x ${height} samples.`);

  const tiles=[];
  for(let row=0;row<ORTHO_GRID;row++)for(let col=0;col<ORTHO_GRID;col++)tiles.push({row,col});
  // Three parallel WCS requests keep the download moving without flooding the service.
  let orthoCount=0;
  for(let start=0;start<tiles.length;start+=3){
    const result=await Promise.all(tiles.slice(start,start+3).map(async({row,col})=>{
      try{await fetchOrthoTile(region,out,row,col);return true;}
      catch(error){console.warn(`${region.label}: ortho ${row}-${col} skipped (${error.message})`);return false;}
    }));
    orthoCount+=result.filter(Boolean).length;
  }
  if(orthoCount!==tiles.length)throw new Error(`only ${orthoCount}/${tiles.length} orthophoto tiles were returned`);
  const downloadedAt = new Date().toISOString().slice(0, 10);
  const metadata = {
    id: region.id, region: region.label, width, height, referenceHeight,
    centerE: region.e, centerN: region.n,
    areaMeters: DEM_SIZE, orthoAreaMeters: ORTHO_GRID * ORTHO_TILE_SIZE,
    orthoGrid: ORTHO_GRID, orthoTilePixels: WATER_TILE_PIXELS,
    downloadedAt,
    attribution: {
      provider: 'National Land Survey of Finland',
      datasets: ['Elevation Model 2 m', 'Colour Orthophotos (ortokuva_vari)'],
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      sourceUrl: 'https://www.maanmittauslaitos.fi/ortokuvien-ja-korkeusmallien-kyselypalvelu/tekninen-kuvaus',
      modifications: 'Elevation samples were downsampled; orthophotos were cropped, resampled, tiled, and recompressed; water masks were derived from orthophoto colors.',
      retrievalDate: downloadedAt,
    },
  };
  await writeFile(new URL('terrain.json', out), JSON.stringify(metadata, null, 2));
  console.log(`${region.label}: ${orthoCount}/${tiles.length} orthophoto tiles and water masks ready.`);
}

async function fetchOrthoTile(region,out,row,col){
  const west=region.e-ORTHO_GRID*ORTHO_TILE_SIZE/2+col*ORTHO_TILE_SIZE;
  const south=region.n+ORTHO_GRID*ORTHO_TILE_SIZE/2-(row+1)*ORTHO_TILE_SIZE;
  const east=west+ORTHO_TILE_SIZE,north=south+ORTHO_TILE_SIZE;
  const params=new URLSearchParams({
    service:'WCS',version:'2.0.1',request:'GetCoverage',coverageID:'ortokuva_vari',
    format:'image/tiff',SCALEFACTOR:String(ORTHO_SCALE),'api-key':API_KEY,
  });
  params.append('SUBSET',`E(${west},${east})`);params.append('SUBSET',`N(${south},${north})`);
  const response=await fetch(`${WCS}?${params}`);
  if(!response.ok)throw new Error(`orthophoto tile ${row}-${col} returned HTTP ${response.status}: ${(await response.text()).slice(0,180)}`);
  const tiff=await fromArrayBuffer(await response.arrayBuffer()),image=await tiff.getImage();
  const pixels=await image.readRasters({interleave:true}),width=image.getWidth(),height=image.getHeight();
  const rgba=toRgba(pixels,width,height,image.getSamplesPerPixel());
  await writeFile(new URL(`ortho-${row}-${col}.png`,out),encodePng(width,height,rgba));
  await writeWaterMask(out,row,col,rgba,width,height);
}

async function checkedText(url){
  const response=await fetch(url),text=await response.text();
  if(!response.ok||!/ncols\s+\d+/i.test(text))throw new Error(`elevation request returned HTTP ${response.status}: ${text.slice(0,300)}`);
  return text;
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
