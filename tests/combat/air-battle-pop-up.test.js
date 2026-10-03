import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AirBattle } from '../../src/combat/air-battle.js';
import { DIFFICULTY_PRESETS } from '../../src/combat/difficulty.js';
import { createSeededRandom } from '../../src/combat/random.js';

function createAircraftAsset() {
  const model = () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(6, 2, 12), new THREE.MeshBasicMaterial()));
    return root;
  };
  return { player: model(), hostiles: { su27: model(), mig29: model() } };
}

function createTerrain() {
  return {
    worldSize: 32000,
    operationBounds: { minX: -16000, maxX: 16000, minZ: -16000, maxZ: 16000 },
    sampleHeight: () => 0,
  };
}

describe('AirBattle hostile contacts', () => {
  let battle;

  afterEach(() => {
    battle?.dispose();
    battle = null;
  });

  it('warns on a moving uncertain pair before identifying and activating it', () => {
    const scene = new THREE.Scene();
    const player = new THREE.Group();
    player.position.set(0, 300, 0);
    const onPopUpThreat = vi.fn();
    battle = new AirBattle({
      scene,
      player,
      aircraftAsset: createAircraftAsset(),
      mission: {
        hostiles: 1,
        hostileSpawnDistance: 6000,
        hostileMinimumSpawnDistance: 5000,
        hostileStagingDistance: 4000,
        hostileLateralSpacing: 500,
        wingmen: 0,
        deferredHostiles: false,
      },
      terrain: createTerrain(),
      audio: null,
      fx: null,
      playerVelocity: new THREE.Vector3(),
      getPlayerHeading: () => 0,
      deployHostileCountermeasures: vi.fn(),
      addHostileProjectile: vi.fn(),
      addPlayerProjectile: vi.fn(),
      onMissileLaunch: vi.fn(),
      onWingmanRadio: vi.fn(),
      onPopUpThreat,
      difficulty: DIFFICULTY_PRESETS.standard,
      random: createSeededRandom(12),
    });

    expect(battle.spawnEncounter({
      id: 'test-reinforcement',
      response: {
        hostiles: 2,
        composition: ['mig29'],
        hostileRoles: ['sweep', 'sweep'],
        targetPreference: 'wingmen',
        bearingDegrees: 0,
        spawnDistance: 12000,
        minimumSpawnDistance: 11000,
        lateralSpacing: 700,
        entry: 'scramble',
      },
    })).toBe(true);

    const pair = battle.enemies.slice(1);
    expect(pair).toHaveLength(2);
    expect(pair.every(enemy => enemy.identified === false)).toBe(true);
    expect(pair.every(enemy => enemy.popUpContact)).toBe(true);
    expect(pair.every(enemy => enemy.encounterGroupId === 'test-reinforcement')).toBe(true);
    expect(pair.every(enemy => enemy.targetPreference === 'wingmen')).toBe(true);
    expect(onPopUpThreat).toHaveBeenCalledOnce();
    expect(onPopUpThreat).toHaveBeenLastCalledWith('newContact', pair);
    battle.enemies[0].dead = true;
    expect(battle.wingmanController.selectAllyTarget(battle, {})).toBeNull();
    const initialRange = pair[0].mesh.position.distanceTo(player.position);

    battle.update(2.49);
    battle.update(2.5);

    expect(pair[0].mesh.position.distanceTo(player.position)).toBeLessThan(initialRange);
    expect(pair.every(enemy => enemy.identified === false)).toBe(true);
    expect(onPopUpThreat).toHaveBeenCalledOnce();

    battle.update(0.01);

    expect(pair.every(enemy => enemy.identified === true)).toBe(true);
    expect(onPopUpThreat).toHaveBeenCalledTimes(2);
    expect(onPopUpThreat).toHaveBeenLastCalledWith('identified', pair);
  });

  it('assigns each spawned fighter its authored mission role', () => {
    const player = new THREE.Group();
    player.position.set(0, 300, 0);
    battle = new AirBattle({
      scene: new THREE.Scene(),
      player,
      aircraftAsset: createAircraftAsset(),
      mission: {
        hostiles: 4,
        hostileRoles: ['sweep', 'sweep', 'strike', 'strike'],
        hostileComposition: ['mig29', 'mig29', 'su27', 'su27'],
        hostileEntry: 'scramble',
        wingmanInitialOrder: 'regroup',
        hostileSpawnDistance: 12000,
        hostileMinimumSpawnDistance: 11000,
        wingmen: 2,
        deferredHostiles: false,
      },
      terrain: createTerrain(),
      audio: null,
      fx: null,
      playerVelocity: new THREE.Vector3(),
      getPlayerHeading: () => 0,
      deployHostileCountermeasures: vi.fn(),
      addHostileProjectile: vi.fn(),
      addPlayerProjectile: vi.fn(),
      onMissileLaunch: vi.fn(),
      onWingmanRadio: vi.fn(),
      difficulty: DIFFICULTY_PRESETS.standard,
      random: createSeededRandom(14),
    });

    expect(battle.enemies.map(enemy => [enemy.mesh.userData.aircraftVariant, enemy.missionRole])).toEqual([
      ['mig29', 'sweep'],
      ['mig29', 'sweep'],
      ['su27', 'strike'],
      ['su27', 'strike'],
    ]);
    expect(battle.wingmanOrder).toBe('regroup');
    expect(battle.wingmanController.selectAllyTarget(battle, battle.allies[0])).toBeNull();

    const firstSweep = battle.enemies[0];
    firstSweep.mesh.position.set(0, 300, 8000);
    expect(battle.issueWingmanOrder('attack')).toBe(true);
    expect(battle.wingmanController.selectAllyTarget(battle, battle.allies[0])).toBe(firstSweep);
  });
});
