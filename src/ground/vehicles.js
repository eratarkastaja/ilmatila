import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const materialCache = new Map();
const wheelGeometry = new THREE.CylinderGeometry(0.48, 0.48, 0.34, 10);
const rimGeometry = new THREE.CylinderGeometry(0.23, 0.23, 0.36, 8);
const starShape = makeStarShape();

const platforms = {
  leopard2: { name: 'LEOPARD 2A6', faction: 'finnish', kind: 'tracked', length: 10.4, width: 3.75, hullHeight: 1.45, totalHeight: 3.0, wheels: 7, hp: 8, radius: 7.2, weapon: '120 MM' },
  cv9030: { name: 'CV9030 FIN', faction: 'finnish', kind: 'tracked', length: 7.0, width: 3.2, hullHeight: 1.7, totalHeight: 3.25, wheels: 6, hp: 5, radius: 5.2, weapon: '30 MM' },
  pasi: { name: 'XA-180 PASI', faction: 'finnish', kind: 'wheeled', length: 7.7, width: 2.9, hullHeight: 2.45, totalHeight: 3.0, wheels: 6, hp: 3, radius: 5.3, weapon: '12,7 MM' },
  sisuSa150: { name: 'SISU SA-150 MASI', faction: 'finnish', kind: 'wheeled', length: 6.76, width: 2.48, hullHeight: 1.62, totalHeight: 3.1, wheels: 4, hp: 2, radius: 4.7, weapon: null },
  ito90: { name: 'ITO 90 CROTALE NG', faction: 'finnish', kind: 'wheeled', length: 7.9, width: 2.9, hullHeight: 2.45, totalHeight: 4.15, wheels: 6, hp: 4, radius: 5.6, weapon: 'CROTALE NG' },
  t72: { name: 'T-72B', faction: 'russian', kind: 'tracked', length: 9.5, width: 3.6, hullHeight: 1.5, totalHeight: 2.95, wheels: 6, hp: 7, radius: 6.8, weapon: '125 MM' },
  bmp2: { name: 'BMP-2', faction: 'russian', kind: 'tracked', length: 6.7, width: 3.15, hullHeight: 1.55, totalHeight: 2.7, wheels: 6, hp: 4, radius: 5.0, weapon: '30 MM' },
  btr80: { name: 'BTR-80', faction: 'russian', kind: 'wheeled', length: 7.65, width: 2.9, hullHeight: 2.05, totalHeight: 3.0, wheels: 8, hp: 3, radius: 5.1, weapon: '14,5 MM' },
  'zsu23-4': { name: 'ZSU-23-4 SHILKA', faction: 'russian', kind: 'tracked', length: 6.5, width: 3.1, hullHeight: 1.42, totalHeight: 3.85, wheels: 6, hp: 5, radius: 5.5, weapon: '4×23 MM' },
  ural4320: { name: 'URAL-4320', faction: 'russian', kind: 'wheeled', length: 7.4, width: 2.5, hullHeight: 3.05, totalHeight: 3.25, wheels: 6, hp: 2, radius: 5.0, weapon: null },
};

export function createGroundVehicle(platformId, faction) {
  const spec = platforms[platformId];
  if (!spec) throw new Error(`Unknown ground vehicle: ${platformId}`);

  const group = new THREE.Group();
  const blue = faction === 'finnish';
  const body = getMaterial(blue ? '#52654b' : '#69634f');
  const bodyLight = getMaterial(blue ? '#73805c' : '#898067');
  const bodyDark = getMaterial(blue ? '#354236' : '#454238');
  const track = getMaterial('#242925');
  const rubber = getMaterial('#1d211f');
  const steel = getMaterial('#74786b', 0.58, 0.25);
  const glass = getMaterial(blue ? '#172d2c' : '#272b25', 0.28, 0.08);
  const white = getMaterial('#e8e8d8', 0.82, 0.02);
  const blueMark = getMaterial('#174577', 0.72, 0.02);
  const redMark = getMaterial('#b13f32', 0.72, 0.02);

  switch (platformId) {
    case 'leopard2': buildLeopard(group, spec, { body, bodyLight, bodyDark, track, rubber, steel, glass }); break;
    case 'cv9030': buildCV9030(group, spec, { body, bodyLight, bodyDark, track, rubber, steel, glass }); break;
    case 'pasi': buildPasi(group, spec, { body, bodyLight, bodyDark, rubber, steel, glass }); break;
    case 'sisuSa150': buildMasi(group, spec, { body, bodyLight, bodyDark, rubber, steel, glass }); break;
    case 'ito90': buildCrotale(group, spec, { body, bodyLight, bodyDark, rubber, steel, glass }); break;
    case 't72': buildT72(group, spec, { body, bodyLight, bodyDark, track, rubber, steel, glass }); break;
    case 'bmp2': buildBMP2(group, spec, { body, bodyLight, bodyDark, track, rubber, steel, glass }); break;
    case 'btr80': buildBTR80(group, spec, { body, bodyLight, bodyDark, rubber, steel, glass }); break;
    case 'zsu23-4': buildShilka(group, spec, { body, bodyLight, bodyDark, track, rubber, steel, glass }); break;
    case 'ural4320': buildUral(group, spec, { body, bodyLight, bodyDark, rubber, steel, glass }); break;
  }

  addFrontLights(group, spec.width, spec.length, spec.hullHeight, white);
  if (blue) addFinnishMarking(group, spec, white, blueMark);
  else addRussianMarking(group, platformId, spec, redMark);
  mergeStaticMeshes(group);

  group.userData.faction = blue ? 'blue' : 'red';
  group.userData.platform = platformId;
  group.userData.platformName = spec.name;
  group.userData.hitBounds = makeHitBounds(spec);
  group.userData.vehicleSpec = { ...spec };
  group.userData.aaMount = group.getObjectByName('aa-mount') ?? null;
  group.userData.aaTraverse = group.getObjectByName('aa-traverse') ?? null;
  return group;
}

export function getGroundVehicleSpec(platformId) {
  return platforms[platformId];
}

export function disposeGroundVehicleVisual(root){
  if(!root||root.userData.visualResourcesDisposed)return;
  root.userData.visualResourcesDisposed=true;
  const geometries=new Set();
  root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);});
  for(const geometry of geometries)geometry.dispose();
}

function buildLeopard(group, s, m) {
  addHull(group, s.width, s.length, s.hullHeight, m.body, { topScale: 0.88, frontCut: 0.65, rearCut: 0.35 });
  addBox(group, [s.width * 0.18, 0.36, s.length * 0.66], [0, s.hullHeight + 0.18, -0.08], m.bodyLight);
  addTracks(group, s, m, 7);

  const turret = new THREE.Group();
  turret.position.set(0, s.hullHeight + 0.18, -0.1);
  turret.add(new THREE.Mesh(armorHull(2.95, 3.5, 1.15, { topScale: 0.78, frontCut: 0.72, rearCut: 0.28 }), m.bodyLight));
  addBox(turret, [2.25, 0.45, 1.4], [0, 0.84, -0.5], m.body);
  addCannon(turret, 120, 0.095, 5.2, m.steel, m.bodyDark);
  addHatches(turret, 0.95, 0.8, m.bodyDark, m.bodyLight, 1.12);
  group.add(turret);
  addBox(group, [0.85, 0.33, 1.6], [0, 1.18, -3.1], m.bodyDark);
  addExhausts(group, s.width, s.length, s.hullHeight, m.steel);
}

function buildCV9030(group, s, m) {
  addHull(group, s.width, s.length, s.hullHeight, m.body, { topScale: 0.9, frontCut: 0.75, rearCut: 0.25 });
  addBox(group, [s.width * 0.16, 0.55, s.length * 0.4], [0, s.hullHeight + 0.16, -0.65], m.bodyLight);
  addTracks(group, s, m, 6);
  addBox(group, [1.1, 0.22, 1.5], [0, s.hullHeight + 0.24, -1.65], m.bodyDark);

  const turret = new THREE.Group();
  turret.name = 'aa-traverse';
  turret.userData.dynamicWeaponMount = true;
  turret.position.set(0, s.hullHeight + 0.08, 0.55);
  turret.add(new THREE.Mesh(armorHull(1.72, 1.7, 0.82, { topScale: 0.88, frontCut: 0.3, rearCut: 0.18 }), m.bodyLight));
  const cannon = new THREE.Group();
  cannon.name = 'aa-mount';
  cannon.userData.dynamicWeaponMount = true;
  cannon.position.set(0, .55, .45);
  addCannon(cannon, 30, 0.045, 2.45, m.steel, m.bodyDark, 0);
  turret.add(cannon);
  addHatches(turret, 0.48, 0.16, m.bodyDark, m.body, 0.84);
  addBox(turret, [0.35, 0.23, 0.65], [0.98, 0.41, -0.18], m.bodyDark);
  group.add(turret);
  addBox(group, [1.0, 0.28, 0.65], [0, s.hullHeight + 0.1, -2.1], m.bodyLight);
}

function buildPasi(group, s, m, withCupola = true) {
  addHull(group, s.width, s.length, s.hullHeight, m.body, { topScale: 0.86, frontCut: 1.3, rearCut: 0.32 });
  addBox(group, [s.width * 0.89, 0.28, s.length * 0.58], [0, s.hullHeight + 0.14, -0.38], m.bodyLight);
  for (const side of [-1, 1]) {
    addBox(group, [0.2, 0.75, 1.5], [side * (s.width * 0.38), 1.25, 0.85], m.bodyDark);
    for (let z = -2.25; z <= 2.26; z += 2.25) addWheel(group, side * (s.width * 0.48), 0.67, z, m.rubber, m.steel, 0.44);
  }
  addWindow(group, [-0.83, 2.12, 2.65], [0.72, 0.52, 0.09], m.glass, -0.24);
  addWindow(group, [0.83, 2.12, 2.65], [0.72, 0.52, 0.09], m.glass, 0.24);
  addBox(group, [0.12, 0.64, 0.16], [0, 2.1, 2.62], m.bodyDark);
  addBox(group, [1.18, 0.12, 0.12], [0, 1.75, 2.7], m.bodyLight);
  if (withCupola) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.63, 0.68, 0.16, 12), m.bodyDark);
    ring.position.set(0, 2.56, -0.55); group.add(ring);
    const gun = new THREE.Group(); gun.name = 'aa-mount'; gun.userData.dynamicWeaponMount = true; gun.position.set(0, 2.67, -0.55);
    gun.add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.45, 10), m.bodyLight));
    gun.children[0].position.y = 0.17;
    addCannon(gun, 12.7, 0.035, 1.65, m.steel, m.bodyDark, 0.35);
    group.add(gun);
    addBox(group, [1.45, 0.2, 0.55], [0, 2.53, -2.0], m.bodyDark);
  }
}

function buildCrotale(group, s, m) {
  // Finnish ITO 90M is represented by its XA-180 family carrier and a compact
  // radar/launcher module. The module is a gameplay cue, not a copied asset.
  buildPasi(group, s, m, false);
  addBox(group, [2.15, 0.34, 2.55], [0, 2.58, -1.38], m.bodyDark);
  addBox(group, [1.72, 0.2, 2.1], [0, 2.83, -1.38], m.bodyLight);
  const radar = new THREE.Group();
  radar.position.set(0, 2.95, -2.05);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.12, 0.88, 8), m.steel);
  mast.position.y = 0.46; radar.add(mast);
  const panel = addBox(radar, [1.22, 0.78, 0.12], [0, 0.96, -0.06], m.bodyDark);
  panel.rotation.x = -0.12;
  addBox(radar, [1.02, 0.62, 0.035], [0, 0.98, 0.018], m.bodyLight);
  addBox(radar, [0.88, 0.49, 0.025], [0, 0.98, 0.048], m.glass);
  // A few restrained feed ribs make the flat radar face legible at range.
  for (const y of [0.83, 0.98, 1.13]) {
    addBox(radar, [0.78, 0.018, 0.018], [0, y, 0.067], m.bodyDark);
  }
  group.add(radar);

  const traverse = new THREE.Group();
  traverse.name = 'aa-traverse';
  traverse.userData.dynamicWeaponMount = true;
  traverse.position.set(0, 2.95, -0.22);
  group.add(traverse);
  const launcher = new THREE.Group();
  launcher.name = 'aa-mount';
  launcher.userData.dynamicWeaponMount = true;
  launcher.position.set(0, 0.16, 0.22);
  traverse.add(launcher);
  addBox(launcher, [1.38, 0.75, 1.16], [0, 0.3, -0.42], m.bodyLight);
  addBox(launcher, [1.48, 0.12, 0.96], [0, 0.72, -0.42], m.bodyDark);
  for (const side of [-1, 1]) {
    for (const row of [0, 1]) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.34, 8), m.bodyDark);
      tube.rotation.x = Math.PI / 2 - 0.16;
      tube.position.set(side * 0.38, 0.24 + row * 0.38, 0.12);
      launcher.add(tube);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.035, 8), m.steel);
      cap.rotation.x = Math.PI / 2 - 0.16;
      cap.position.set(side * 0.38, 0.24 + row * 0.38, 0.83);
      launcher.add(cap);
      const aperture = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.04, 8), m.glass);
      aperture.rotation.x = Math.PI / 2 - 0.16;
      aperture.position.set(side * 0.38, 0.24 + row * 0.38, 0.855);
      launcher.add(aperture);
    }
  }
  addBox(group, [0.72, 0.12, 0.48], [0, 3.08, 1.17], m.bodyDark);
}

function buildShilka(group, s, m) {
  addHull(group, s.width, s.length, s.hullHeight, m.body, { topScale: 0.9, frontCut: 0.9, rearCut: 0.4 });
  addTracks(group, s, m, 6);
  addBox(group, [2.25, 0.34, 3.45], [0, s.hullHeight + 0.12, -0.14], m.bodyDark);

  const turret = new THREE.Group();
  turret.name = 'aa-mount';
  turret.userData.dynamicWeaponMount = true;
  turret.position.set(0, s.hullHeight + 0.36, -0.05);
  turret.add(new THREE.Mesh(armorHull(2.68, 2.82, 1.45, { topScale: 0.88, frontCut: 0.28, rearCut: 0.18 }), m.bodyLight));
  addBox(turret, [1.48, 0.5, 1.1], [0, 0.28, 0.55], m.bodyDark);
  // Four distinct 23 mm barrels on a common elevating cradle make the role
  // readable at combat distance without the visual cost of a detailed model.
  for (const side of [-1, 1]) {
    for (const level of [-1, 1]) {
      const x = side * 0.42;
      const y = 0.52 + level * 0.22;
      const breech = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.68, 8), m.bodyDark);
      breech.rotation.x = Math.PI / 2;
      breech.position.set(x, y, 1.13);
      turret.add(breech);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 2.55, 8), m.steel);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(x, y, 2.68);
      turret.add(barrel);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.34, 8), m.bodyDark);
      sleeve.rotation.x = Math.PI / 2;
      sleeve.position.set(x, y, 1.56);
      turret.add(sleeve);
    }
  }
  // Folded Gun Dish radar and its support frame sit aft of the gun cradle.
  addBox(turret, [0.12, 0.82, 0.12], [0, 1.52, -1.16], m.steel);
  const radarDish = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 12), m.bodyDark);
  radarDish.rotation.x = Math.PI / 2 - 0.12;
  radarDish.position.set(0, 1.88, -1.18);
  turret.add(radarDish);
  const dishRim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 5, 16), m.steel);
  dishRim.rotation.x = Math.PI / 2 - 0.12;
  dishRim.position.set(0, 1.88, -1.105);
  turret.add(dishRim);
  const dishHub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 10), m.steel);
  dishHub.rotation.x = Math.PI / 2 - 0.12;
  dishHub.position.set(0, 1.88, -1.09);
  turret.add(dishHub);
  for (const side of [-1, 1]) {
    const support = addBox(turret, [0.075, 0.68, 0.075], [side * 0.27, 1.48, -1.29], m.steel);
    support.rotation.x = -0.22;
  }
  group.add(turret);
  addBox(group, [0.94, 0.34, 1.72], [0, 1.1, -2.65], m.bodyDark);
}

function buildT72(group, s, m) {
  addHull(group, s.width, s.length, s.hullHeight, m.body, { topScale: 0.84, frontCut: 1.25, rearCut: 0.5 });
  addBox(group, [s.width * 0.42, 0.28, s.length * 0.52], [0, s.hullHeight + 0.14, -0.2], m.bodyLight);
  addTracks(group, s, m, 6);
  const turret = new THREE.Group();
  turret.position.set(0, s.hullHeight + 0.28, 0.05);
  // The T-72B has a low cast turret; a shallow faceted armour shell reads
  // closer than the previous half-sphere. Add recognizable Kontakt-1 blocks.
  turret.add(new THREE.Mesh(armorHull(2.8, 3.05, 0.96, { topScale: 0.82, frontCut: 0.86, rearCut: 0.34 }), m.bodyLight));
  addBox(turret, [1.38, 0.48, 0.95], [0, 0.23, 0.42], m.body);
  for (const side of [-1, 1]) {
    for (let z = -0.52; z <= 1.11; z += 0.54) {
      const era = addBox(turret, [0.44, 0.28, 0.37], [side * 1.17, 0.73, z], m.bodyDark);
      era.rotation.x = -0.13;
    }
  }
  for (const x of [-0.86, -0.29, 0.29, 0.86]) {
    const era = addBox(group, [0.47, 0.2, 0.35], [x, 1.53, 3.36], m.bodyDark);
    era.rotation.x = -0.42;
  }
  addCannon(turret, 125, 0.105, 5.15, m.steel, m.bodyDark, 0.2);
  addHatches(turret, 0.72, -0.58, m.bodyDark, m.body, 0.94);
  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 0.28, 10), m.bodyDark);
  cupola.position.set(0.86, 0.48, -0.58); turret.add(cupola);
  const aaMount = new THREE.Group();
  aaMount.name = 'aa-mount';
  aaMount.userData.dynamicWeaponMount = true;
  aaMount.position.set(.86, .63, -.58);
  addCannon(aaMount, 12.7, 0.03, 0.92, m.steel, m.bodyDark, .04, 0, -.55);
  turret.add(aaMount);
  group.add(turret);
  addBox(group, [0.9, 0.38, 2.1], [0, 1.05, -3.0], m.bodyDark);
}

function buildBMP2(group, s, m) {
  addHull(group, s.width, s.length, s.hullHeight, m.body, { topScale: 0.84, frontCut: 1.1, rearCut: 0.45 });
  addBox(group, [s.width * 0.16, 0.65, s.length * 0.42], [0, s.hullHeight + 0.23, -0.75], m.bodyLight);
  addTracks(group, s, m, 6);
  const turret = new THREE.Group(); turret.name = 'aa-mount'; turret.userData.dynamicWeaponMount = true;
  turret.position.set(0, s.hullHeight + 0.38, 0.48);
  const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 1.02, 0.72, 12), m.bodyLight);
  dome.position.y = 0.32; turret.add(dome);
  addCannon(turret, 30, 0.04, 2.45, m.steel, m.bodyDark, 0.49, 0, 0.12);
  addCannon(turret, 7.62, 0.022, 2.22, m.bodyDark, m.bodyDark, 0.37, 0.16, 0.16);
  addHatches(turret, 0.43, -0.43, m.bodyDark, m.body, 0.67);
  addBox(turret, [0.28, 0.24, 0.95], [-1.0, 0.33, -0.06], m.bodyDark);
  addBox(turret, [0.28, 0.24, 0.95], [1.0, 0.33, -0.06], m.bodyDark);
  group.add(turret);
  for (const side of [-1, 1]) for (const z of [1.7, 2.45]) {
    addBox(group, [0.13, 0.3, 0.32], [side * 1.48, 1.65, z], m.bodyDark);
    addBox(group, [0.15, 0.25, 0.23], [side * 1.58, 1.66, z], m.glass);
  }
}

function buildBTR80(group, s, m) {
  const hull = new THREE.Mesh(armorHull(s.width, s.length, s.hullHeight, { topScale: 0.86, frontCut: 1.6, rearCut: 0.5 }), m.body);
  hull.position.y = 0.18; group.add(hull);
  addBox(group, [s.width * 0.76, 0.27, s.length * 0.45], [0, s.hullHeight + 0.32, -0.55], m.bodyLight);
  for (const side of [-1, 1]) {
    addBox(group, [0.18, 0.52, 1.1], [side * 1.34, 1.08, 0.55], m.bodyDark);
    for (let z = -2.45; z <= 2.46; z += 1.63) addWheel(group, side * 1.52, 0.65, z, m.rubber, m.steel, 0.39);
  }
  addWindow(group, [-0.74, 2.17, 2.38], [0.58, 0.42, 0.08], m.glass, -0.25);
  addWindow(group, [0.74, 2.17, 2.38], [0.58, 0.42, 0.08], m.glass, 0.25);
  const turret = new THREE.Group(); turret.name = 'aa-mount'; turret.userData.dynamicWeaponMount = true;
  turret.position.set(0, s.hullHeight + 0.27, -0.32);
  turret.add(new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.68, 0.62, 10), m.bodyDark));
  turret.children[0].position.y = 0.25;
  addCannon(turret, 14.5, 0.045, 1.25, m.steel, m.bodyDark, 0.53);
  addCannon(turret, 7.62, 0.024, 0.95, m.bodyDark, m.bodyDark, 0.48, -0.19, 0.02);
  group.add(turret);
}

function buildMasi(group, s, m) {
  // Sisu SA-150 “Masi”: a compact two-axle 4×4 military platform truck.
  // Its forward-control cab, open troop/cargo platform and four large wheels
  // distinguish it from the Russian 6×6 Ural convoy.
  addBox(group, [s.width * .84, .76, s.length * .57], [0, .98, -.28], m.bodyDark);
  addBox(group, [s.width * .88, .13, s.length * .59], [0, 1.39, -.28], m.bodyLight);
  addBox(group, [2.12, .16, 2.68], [0, 1.56, -1.53], m.bodyLight);
  for (const side of [-1, 1]) {
    addBox(group, [.12, .64, 2.75], [side * 1.08, 1.87, -1.53], m.body);
    addBox(group, [.08, .08, 2.82], [side * 1.15, 2.18, -1.53], m.bodyDark);
  }
  addBox(group, [2.12, .58, .12], [0, 1.82, -2.91], m.body);
  addBox(group, [1.82, .08, .09], [0, 2.12, -2.96], m.bodyDark);

  // Forward-control cab above the front axle, with a flat split windscreen
  // and low grille below it rather than a long bonnet.
  addBox(group, [2.18, 1.62, 2.02], [0, 2.13, 2.02], m.body);
  addWindow(group, [-.51, 2.51, 3.05], [.86, .62, .09], m.glass, -.16);
  addWindow(group, [.51, 2.51, 3.05], [.86, .62, .09], m.glass, .16);
  addBox(group, [.12, .8, .09], [0, 2.08, 3.06], m.bodyDark);
  addBox(group, [1.43, .44, .08], [0, 1.48, 3.05], m.bodyDark);
  for (let x = -.55; x <= .56; x += .28) addBox(group, [.055, .36, .045], [x, 1.48, 3.11], m.steel);
  addBox(group, [1.82, .12, .14], [0, 1.13, 3.19], m.steel);
  addBox(group, [1.35, .09, .14], [0, 2.99, 2.02], m.bodyLight);
  addBox(group, [.62, .07, .52], [0, 3.015, 2.02], m.bodyDark);
  for (const side of [-1, 1]) {
    addBox(group, [.08, .38, .35], [side * 1.12, 1.69, 2.24], m.bodyDark);
    addBox(group, [.1, .54, .13], [side * 1.13, 1.68, 2.2], m.glass);
    addBox(group, [.18, .12, .55], [side * 1.22, 1.04, 1.64], m.steel);
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(.2,.17,.1),m.bodyLight);
    headlight.position.set(side*.76,1.48,3.13);group.add(headlight);
    for (const z of [-1.925, 1.925]) addWheel(group, side * 1.27, .63, z, m.rubber, m.steel, .49);
  }
  addBox(group, [.2, .3, .15], [0, 1.2, 3.26], m.bodyDark);
}

function buildUral(group, s, m) {
  addBox(group, [s.width * 0.9, 0.72, s.length * 0.62], [0, 1.17, -0.45], m.bodyDark);
  addBox(group, [s.width * 0.82, 0.13, s.length * 0.59], [0, 1.58, -0.45], m.bodyLight);
  addBox(group, [s.width * 0.91, 1.4, 2.2], [0, 1.9, -0.55], m.body);
  addBox(group, [s.width * 0.94, 1.68, 2.0], [0, 1.97, 2.05], m.body);
  addWindow(group, [-0.48, 2.37, 3.07], [0.78, 0.72, 0.08], m.glass, -0.17);
  addWindow(group, [0.48, 2.37, 3.07], [0.78, 0.72, 0.08], m.glass, 0.17);
  addBox(group, [0.14, 1.0, 0.12], [0, 2.0, 3.1], m.bodyDark);
  addBox(group, [2.34, 0.16, 0.16], [0, 1.1, 3.16], m.bodyLight);
  addBox(group, [0.72, 0.5, 0.09], [0, 1.68, 3.12], m.bodyDark);
  addBox(group, [0.2, 0.54, 2.3], [0, 1.1, 0.22], m.bodyDark);
  for (const side of [-1, 1]) {
    addBox(group, [0.18, 0.18, 0.9], [side * 1.2, 0.96, 0.1], m.steel);
    for (const z of [-2.45, -0.05, 2.35]) addWheel(group, side * 1.28, 0.62, z, m.rubber, m.steel, 0.44);
  }
  addBox(group, [2.0, 1.45, 2.85], [0, 2.36, -1.85], m.bodyLight);
  addBox(group, [1.6, 0.08, 2.56], [0, 3.11, -1.85], m.bodyDark);
  for (let x = -0.7; x <= 0.71; x += 0.7) addBox(group, [0.06, 1.25, 2.65], [x, 2.36, -1.85], m.bodyDark);
}

function addTracks(group, s, m, wheelCount) {
  const sideX = s.width * 0.48;
  for (const side of [-1, 1]) {
    addBox(group, [0.72, 0.86, s.length * 0.84], [side * sideX, 0.78, -0.05], m.track);
    addBox(group, [0.78, 0.14, s.length * 0.86], [side * sideX, 0.31, -0.05], m.bodyDark);
    addBox(group, [0.78, 0.14, s.length * 0.86], [side * sideX, 1.24, -0.05], m.bodyDark);
    const startZ = -(wheelCount - 1) * 0.68;
    for (let i = 0; i < wheelCount; i++) addWheel(group, side * (sideX + 0.12), 0.76, startZ + i * 1.36, m.rubber, m.steel, 0.49);
    addWheel(group, side * (sideX + 0.12), 0.77, -s.length * 0.39, m.rubber, m.bodyDark, 0.55);
    addWheel(group, side * (sideX + 0.12), 0.77, s.length * 0.39, m.rubber, m.bodyDark, 0.55);
  }
}

function addHull(group, width, length, height, material, cuts = {}) {
  const hull = new THREE.Mesh(armorHull(width, length, height, cuts), material);
  group.add(hull);
}

function armorHull(width, length, height, { topScale = 0.88, frontCut = 0.45, rearCut = 0.28 } = {}) {
  const w = width / 2, tw = w * topScale, l = length / 2;
  const vertices = [
    [-w, 0, -l], [w, 0, -l], [w, 0, l], [-w, 0, l],
    [-tw, height, -l + rearCut], [tw, height, -l + rearCut], [tw, height, l - frontCut], [-tw, height, l - frontCut],
  ];
  const faces = [
    [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0], [4, 7, 6, 5], [0, 1, 2, 3],
  ];
  const positions = [];
  for (const [a, b, c, d] of faces) positions.push(...vertices[a], ...vertices[b], ...vertices[d], ...vertices[b], ...vertices[c], ...vertices[d]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function addCannon(group, caliber, radius, length, steel, mantlet, yOffset = 0.5, x = 0, z = 0) {
  const mantletMesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 2.5, radius * 3.2, 0.48, 10), mantlet);
  mantletMesh.rotation.x = Math.PI / 2;
  mantletMesh.position.set(x, yOffset, z + 0.55);
  group.add(mantletMesh);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.82, radius, length, 8), steel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(x, yOffset, z + 0.55 + length / 2);
  group.add(barrel);
  if (caliber >= 100) {
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.2, radius * 1.2, 0.55, 8), mantlet);
    sleeve.rotation.x = Math.PI / 2; sleeve.position.set(x, yOffset, z + 0.9); group.add(sleeve);
  }
}

function addHatches(group, radius, z, dark, body, height = 0.93) {
  for (const x of [-radius, radius]) {
    const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.34, 0.13, 10), body);
    hatch.position.set(x, height, z); group.add(hatch);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.045), dark);
    handle.position.set(x, height + 0.09, z); group.add(handle);
  }
}

function addWheel(group, x, y, z, rubber, rim, radius) {
  const wheel = new THREE.Mesh(wheelGeometry, rubber);
  wheel.rotation.z = Math.PI / 2; wheel.scale.setScalar(radius / 0.48); wheel.position.set(x, y, z); group.add(wheel);
  const hub = new THREE.Mesh(rimGeometry, rim);
  hub.rotation.z = Math.PI / 2; hub.scale.setScalar(radius / 0.48); hub.position.set(x * 1.11, y, z); group.add(hub);
}

function addWindow(group, position, size, glass, angle = 0) {
  const frame = new THREE.Mesh(new THREE.BoxGeometry(size[0] + 0.14, size[1] + 0.14, size[2] * 0.62), getMaterial('#30372f'));
  frame.position.set(...position); frame.rotation.x = angle; group.add(frame);
  const pane = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), glass);
  pane.position.set(...position); pane.rotation.x = angle; group.add(pane);
}

function addFrontLights(group, width, length, hullHeight, lightMaterial) {
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.15, 0.1), lightMaterial);
    lamp.position.set(side * width * 0.34, Math.min(0.92, hullHeight * 0.38), length * 0.43);
    group.add(lamp);
  }
}

function addExhausts(group, width, length, y, steel) {
  for (const side of [-1, 1]) {
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.46, 8), steel);
    exhaust.rotation.x = Math.PI / 2; exhaust.position.set(side * width * 0.33, y * 0.66, -length * 0.43); group.add(exhaust);
  }
}

function addFinnishMarking(group, s, white, blue) {
  const x = s.width > 3.5 ? s.width * 0.33 : 0;
  const z = s.name.startsWith('LEOPARD') ? -s.length * 0.38
    : s.name.includes('MASI') ? -s.length * .25
      : s.length * 0.25;
  const y = s.hullHeight + 0.025, size = s.name.includes('MASI') ? .62 : 1.15;
  addBox(group, [size, 0.035, size], [x, y, z], white);
  addBox(group, [size * 0.19, 0.055, size], [x, y + 0.026, z], blue);
  addBox(group, [size, 0.055, size * 0.19], [x, y + 0.027, z], blue);
}

function addRussianMarking(group, platformId, s, starMaterial) {
  const star = new THREE.Mesh(starShape, starMaterial);
  star.rotation.x = -Math.PI / 2;
  star.scale.setScalar(0.58);
  const positions = {
    t72: [0, 2.82, 0.05],
    bmp2: [0, 2.64, 0.48],
    btr80: [0, 2.91, -0.32],
    'zsu23-4': [0, 3.48, -0.82],
    ural4320: [0, 3.19, -1.85],
  };
  star.position.set(...positions[platformId]);
  group.add(star);
}

function addBox(group, size, position, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position); group.add(mesh); return mesh;
}

function makeHitBounds(s) {
  return { min: [-s.width * 0.66, 0, -s.length * 0.58], max: [s.width * 0.66, s.totalHeight + 0.55, s.length * 0.58] };
}

function getMaterial(color, roughness = 0.86, metalness = 0.06) {
  const key = `${color}/${roughness}/${metalness}`;
  if (!materialCache.has(key)) materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true }));
  return materialCache.get(key);
}

function mergeStaticMeshes(root) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const groups = new Map();
  const sources = [];
  root.traverse(object => {
    if (!object.isMesh || isUnderDynamicWeaponMount(object, root)) return;
    object.updateWorldMatrix(true, false);
    const matrix = inverse.clone().multiply(object.matrixWorld);
    let geometry = object.geometry.clone();
    if (geometry.index) {
      const nonIndexed = geometry.toNonIndexed();
      geometry.dispose();
      geometry = nonIndexed;
    }
    geometry.deleteAttribute('uv');
    geometry.applyMatrix4(matrix);
    const material = object.material;
    if (!groups.has(material)) groups.set(material, []);
    groups.get(material).push(geometry);
    sources.push(object);
  });
  for (const [material, geometries] of groups) {
    const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    if (!merged) continue;
    for (const geometry of geometries) if (geometry !== merged) geometry.dispose();
    merged.computeBoundingSphere();
    root.add(new THREE.Mesh(merged, material));
  }
  for (const source of sources) {
    if (source.geometry !== wheelGeometry && source.geometry !== rimGeometry && source.geometry !== starShape) source.geometry.dispose();
    source.removeFromParent();
  }
}

function isUnderDynamicWeaponMount(object, root) {
  for (let parent = object; parent && parent !== root; parent = parent.parent) {
    if (parent.userData.dynamicWeaponMount) return true;
  }
  return false;
}

function makeStarShape() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? 1 : 0.45;
    const angle = i * Math.PI / 5 - Math.PI / 2;
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}
