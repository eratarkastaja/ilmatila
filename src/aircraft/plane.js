import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildF35Asset, buildImportedEnemyAircraft, createAfterburnerFlame, disposeAircraftVisual } from './plane-models.js';

export { createAfterburnerFlame };
export { disposeAircraftVisual };

const F35_HIT_ZONES = [
  { x: 0, y: 0.02, z: -0.7, rx: 0.94, ry: 0.62, rz: 4.7, damage: 1 },
  { x: 0, y: 0.02, z: 5.25, rx: 0.46, ry: 0.36, rz: 2.45, damage: 0.9 },
  { x: 0, y: 0.73, z: 2.55, rx: 0.76, ry: 0.59, rz: 1.5, damage: 1.8 },
  { x: -3.5, y: 0, z: -0.7, rx: 2.25, ry: 0.28, rz: 2.3, damage: 0.8 },
  { x: 3.5, y: 0, z: -0.7, rx: 2.25, ry: 0.28, rz: 2.3, damage: 0.8 },
  { x: -1.65, y: -0.04, z: -7, rx: 1.1, ry: 0.2, rz: 0.75, damage: 0.9 },
  { x: 1.65, y: -0.04, z: -7, rx: 1.1, ry: 0.2, rz: 0.75, damage: 0.9 },
  { x: 0, y: -0.18, z: -6.4, rx: 0.6, ry: 0.49, rz: 1.1, damage: 1.5 },
];

const FLANKER_HIT_ZONES = [
  { x: 0, y: 0, z: -0.2, rx: 1.28, ry: 0.83, rz: 6.6, damage: 1 },
  { x: 0, y: 0.98, z: 3.75, rx: 0.92, ry: 0.62, rz: 1.65, damage: 1.8 },
  { x: 0, y: 0.02, z: 7.25, rx: 0.62, ry: 0.48, rz: 1.75, damage: 0.9 },
  { x: -4.7, y: 0, z: -0.4, rx: 3.15, ry: 0.36, rz: 2.7, damage: 0.8 },
  { x: 4.7, y: 0, z: -0.4, rx: 3.15, ry: 0.36, rz: 2.7, damage: 0.8 },
  { x: -2.55, y: -0.08, z: -7.8, rx: 1.65, ry: 0.27, rz: 0.95, damage: 0.9 },
  { x: 2.55, y: -0.08, z: -7.8, rx: 1.65, ry: 0.27, rz: 0.95, damage: 0.9 },
  { x: -0.84, y: -0.28, z: -6.7, rx: 0.64, ry: 0.65, rz: 2.45, damage: 1.35 },
  { x: 0.84, y: -0.28, z: -6.7, rx: 0.64, ry: 0.65, rz: 2.45, damage: 1.35 },
  { x: -0.95, y: 1.65, z: -7.2, rx: 0.78, ry: 1.75, rz: 0.48, damage: 0.9 },
  { x: 0.95, y: 1.65, z: -7.2, rx: 0.78, ry: 1.75, rz: 0.48, damage: 0.9 },
];

const MIG29_HIT_ZONES = [
  { x: 0, y: 0, z: -0.35, rx: 0.88, ry: 0.67, rz: 5.45, damage: 1 },
  { x: 0, y: 0.72, z: 3.35, rx: 0.59, ry: 0.52, rz: 1.55, damage: 1.8 },
  { x: 0, y: -0.08, z: 6.75, rx: 0.39, ry: 0.35, rz: 1.55, damage: 0.9 },
  { x: -3.7, y: 0, z: -0.1, rx: 2.55, ry: 0.29, rz: 2.15, damage: 0.8 },
  { x: 3.7, y: 0, z: -0.1, rx: 2.55, ry: 0.29, rz: 2.15, damage: 0.8 },
  { x: -1.15, y: -0.14, z: -5.4, rx: 0.7, ry: 0.48, rz: 2.25, damage: 1.35 },
  { x: 1.15, y: -0.14, z: -5.4, rx: 0.7, ry: 0.48, rz: 2.25, damage: 1.35 },
  { x: -1.55, y: 1.45, z: -6.1, rx: 0.57, ry: 1.55, rz: 0.44, damage: 0.9 },
  { x: 1.55, y: 1.45, z: -6.1, rx: 0.57, ry: 1.55, rz: 0.44, damage: 0.9 },
];

export async function loadCombatAircraft(onProgress, signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
  const manager = new THREE.LoadingManager();
  const abort = () => manager.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const loader = new GLTFLoader(manager);
  const files = [
    'assets/f35/f35-lightning.glb?rev=f35a-dorsal-skin-3',
    'assets/aircraft/su27/su27.glb',
    'assets/aircraft/mig29/mig29.glb',
  ];
  const progress = files.map(() => 0);
  const reportProgress = () => onProgress?.({ loaded: progress.reduce((sum, value) => sum + value, 0), total: files.length });
  try {
    const loaded = await Promise.all(files.map((file, index) => loader.loadAsync(
      `${import.meta.env.BASE_URL}${file}`,
      event => {
        if (event.total > 0) {
          progress[index] = THREE.MathUtils.clamp(event.loaded / event.total, 0, 1);
          reportProgress();
        }
      },
    ).then(gltf => {
      progress[index] = 1;
      reportProgress();
      return gltf.scene;
    })));

    if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
    return {
      player: loaded[0],
      hostiles: { su27: loaded[1], mig29: loaded[2] },
    };
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

export function createFighter({ enemy = false, friendly = false, aircraftAsset = null, aircraftVariant = 'su27' } = {}) {
  if (friendly && !aircraftAsset) throw new Error('Wingman aircraft requires the loaded F-35 asset.');
  const plane = new THREE.Group();
  plane.userData.team = enemy ? 'hostile' : friendly ? 'friendly' : 'player';
  plane.userData.airframeHealthRatio = 1;
  plane.userData.damageSmokeSeverity = 0;
  plane.userData.handlingFactor = 1;
  if (!enemy && !friendly) plane.position.set(0, 70, 0);

  if (!enemy && !aircraftAsset) {
    plane.userData.hitZones = F35_HIT_ZONES;
    plane.userData.trailOffsets = [[-5.12, 0.03, -2.05], [5.12, 0.03, -2.05], [0, -0.42, -5.58]];
    return plane;
  }

  if (enemy) {
    const hostileAsset = aircraftAsset?.[aircraftVariant];
    buildImportedEnemyAircraft(plane, hostileAsset, aircraftVariant);
    plane.userData.aircraftVariant = aircraftVariant;
    plane.userData.hitZones = aircraftVariant === 'mig29' ? MIG29_HIT_ZONES : FLANKER_HIT_ZONES;
    return plane;
  }

  if (aircraftAsset) {
    buildF35Asset(plane, aircraftAsset, friendly);
    plane.userData.hitZones = F35_HIT_ZONES;
    plane.userData.trailOffsets = [[-5.12, 0.03, -2.05], [5.12, 0.03, -2.05], [0, -0.42, -5.58]];
  }
  return plane;
}
