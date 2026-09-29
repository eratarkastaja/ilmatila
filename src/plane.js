import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildF35Asset, buildFlanker, createAfterburnerFlame, material, mergeStaticMeshes } from './plane-models.js';

export { createAfterburnerFlame };

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

export async function loadF35Aircraft(onProgress) {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/f35/f35-lightning.glb`, onProgress);
  return gltf.scene;
}

export function createFighter({ enemy = false, friendly = false, aircraftAsset = null } = {}) {
  if (friendly && !aircraftAsset) throw new Error('Wingman aircraft requires the loaded F-35 asset.');
  const plane = new THREE.Group();
  plane.userData.team = enemy ? 'hostile' : friendly ? 'friendly' : 'player';
  if (!enemy && !friendly) plane.position.set(0, 70, 0);

  if (!enemy && !aircraftAsset) {
    plane.userData.hitZones = F35_HIT_ZONES;
    plane.userData.trailOffsets = [[-5.12, 0.03, -2.05], [5.12, 0.03, -2.05], [0, -0.02, -8.35]];
    return plane;
  }

  if (enemy) {
    const paint = material('#777b77', 0.64, 0.28);
    const highlight = material('#92958b', 0.78, 0.12);
    const panel = material('#515a5b', 0.82, 0.12);
    const dark = material('#202a31', 0.88, 0.08);
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#233943', metalness: 0.38, roughness: 0.12, ior: 1.46,
      clearcoat: 1, clearcoatRoughness: 0.045, envMapIntensity: 2.1,
      side: THREE.DoubleSide,
    });
    const glow = new THREE.MeshBasicMaterial({ color: '#f76b3c' });
    buildFlanker(plane, { paint, highlight, panel, dark, glass, glow });
    plane.userData.hitZones = FLANKER_HIT_ZONES;
    plane.userData.trailOffsets = [[-7.35, 0.04, -1.8], [7.35, 0.04, -1.8], [-0.84, -0.24, -9.25], [0.84, -0.24, -9.25]];
    plane.userData.vaporOffsets = [[-6.4, 0.2, -1.45], [6.4, 0.2, -1.45], [-1.7, 0.22, 1.8], [1.7, 0.22, 1.8]];
    mergeStaticMeshes(plane);
    return plane;
  }

  if (aircraftAsset) {
    buildF35Asset(plane, aircraftAsset, friendly);
    plane.userData.hitZones = F35_HIT_ZONES;
    plane.userData.trailOffsets = [[-5.12, 0.03, -2.05], [5.12, 0.03, -2.05], [0, -0.02, -8.35]];
  }
  return plane;
}
