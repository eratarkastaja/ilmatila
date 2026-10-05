import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { loadCombatAircraft } from '../../src/aircraft/plane.js';
import { AssetRepository } from '../../src/assets/asset-repository.js';
import { SortieController } from '../../src/game/sortie-controller.js';
import { createTerrainLease } from '../../src/environment/terrain.js';

vi.mock('../../src/aircraft/plane.js', () => ({ loadCombatAircraft: vi.fn() }));
vi.mock('../../src/combat/world.js', () => ({
  CombatWorld: class {
    constructor(_scene, _player, terrain, _fx, asset) {
      this.terrain = terrain;
      this.asset = asset;
      this.destroyed = false;
      this.setTelemetry = vi.fn();
      this.dispose = vi.fn(() => { this.destroyed = true; });
    }
  },
}));
vi.mock('../../src/ui/hud.js', () => ({ TacticalHud: class {} }));
vi.mock('../../src/performance/stress-scenario.js', () => ({ CombatStressScenario: class {} }));
vi.mock('../../src/performance/combat-telemetry.js', () => ({ CombatTelemetry: class {} }));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function makeTerrain(id) {
  const release = vi.fn();
  const terrain = createTerrainLease({
    id,
    label: id.toUpperCase(),
    real: true,
    mesh: {},
    sampleHeight: () => 0,
  }, release);
  return { terrain, release };
}

function makeAircraftAsset() {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  root.add(new THREE.Mesh(geometry, material));
  return {
    asset: { player: root, hostiles: {} },
    geometryDispose: vi.spyOn(geometry, 'dispose'),
    materialDispose: vi.spyOn(material, 'dispose'),
  };
}

function createHarness({ terrainLoader = vi.fn(), aircraftLoader = vi.fn(), assets } = {}) {
  const state = {
    terrain: { id: 'preview', real: false },
    installed: [],
    loading: false,
    failures: [],
    cancellations: 0,
  };
  const controls = {
    enabled: false,
    keys: new Set(),
    setEnabled(enabled) { this.enabled = enabled; },
    resetMouseAim: vi.fn(),
  };
  const audio = {
    setPaused: vi.fn(),
    setGunFiring: vi.fn(),
    stopEngine: vi.fn(),
    startEngine: vi.fn(),
  };
  const controller = new SortieController({
    assets: assets ?? { ensureAircraftLoaded: aircraftLoader },
    ensureTerrainLoaded: terrainLoader,
    getTerrain: () => state.terrain,
    installTerrain: replacement => {
      state.terrain = replacement;
      state.installed.push(replacement);
    },
    scene: {},
    player: { position: { x: 0, y: 0, z: 0 } },
    fx: {},
    audio,
    controls,
    renderer: { domElement: {} },
    difficulty: 'standard',
    seedFactory: () => 42,
    onPrepareStart: () => {
      state.loading = true;
      return null;
    },
    onPrepareFailure: error => {
      state.loading = false;
      state.failures.push(error);
    },
    onPrepareCancelled: () => {
      state.loading = false;
      state.cancellations += 1;
    },
    onStart: () => { state.loading = false; },
  });
  return { controller, state, controls, audio };
}

const launchOptions = {
  missionId: 'training',
  areaId: 'north',
  area: { id: 'north', label: 'North' },
};

describe('SortieController async preparation recovery', () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

  beforeEach(() => {
    loadCombatAircraft.mockReset();
    globalThis.requestAnimationFrame = callback => {
      callback();
      return 1;
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalRequestAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it('times out terrain, releases its late lease, then permits another launch', async () => {
    vi.useFakeTimers();
    const lateLoad = deferred();
    const lateTerrain = makeTerrain('north');
    const nextTerrain = makeTerrain('north');
    let terrainSignal;
    const terrainLoader = vi.fn()
      .mockImplementationOnce((_areaId, _progress, signal) => {
        terrainSignal = signal;
        return lateLoad.promise;
      })
      .mockResolvedValueOnce(nextTerrain.terrain);
    const aircraftLoader = vi.fn().mockResolvedValue({ id: 'aircraft' });
    const { controller, state } = createHarness({ terrainLoader, aircraftLoader });

    const failedLaunch = controller.prepare(launchOptions);
    await vi.advanceTimersByTimeAsync(90000);
    await expect(failedLaunch).resolves.toBe(false);

    expect(terrainSignal.aborted).toBe(true);
    expect(state.installed).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.failures[0].message).toMatch(/terrain data load timed out/i);
    expect(controller.launchInProgress).toBe(false);

    lateLoad.resolve(lateTerrain.terrain);
    await Promise.resolve();
    await Promise.resolve();
    expect(lateTerrain.release).toHaveBeenCalledOnce();

    vi.useRealTimers();
    await expect(controller.prepare(launchOptions)).resolves.toBe(true);
    expect(state.installed).toEqual([nextTerrain.terrain]);
    expect(controller.start()).toBe(true);
    expect(state.loading).toBe(false);
    controller.dispose();
  });

  it('times out aircraft loading, releases the unused terrain lease, then permits another launch', async () => {
    vi.useFakeTimers();
    const timedOutTerrain = makeTerrain('north');
    const retryTerrain = makeTerrain('north');
    const aircraftLoad = deferred();
    const lateAircraft = makeAircraftAsset();
    let aircraftSignal;
    loadCombatAircraft.mockImplementation((_progress, signal) => {
      aircraftSignal = signal;
      return aircraftLoad.promise;
    });
    const repository = new AssetRepository();
    const terrainLoader = vi.fn()
      .mockResolvedValueOnce(timedOutTerrain.terrain)
      .mockResolvedValueOnce(retryTerrain.terrain);
    const { controller, state } = createHarness({ terrainLoader, assets: repository });

    const failedLaunch = controller.prepare(launchOptions);
    await vi.advanceTimersByTimeAsync(25000);
    await expect(failedLaunch).resolves.toBe(false);

    expect(timedOutTerrain.release).toHaveBeenCalledOnce();
    expect(aircraftSignal.aborted).toBe(true);
    expect(state.installed).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.failures[0].message).toMatch(/aircraft model load timed out/i);
    expect(controller.launchInProgress).toBe(false);

    vi.useRealTimers();
    aircraftLoad.resolve(lateAircraft.asset);
    await vi.waitFor(() => expect(lateAircraft.geometryDispose).toHaveBeenCalledOnce());
    expect(lateAircraft.materialDispose).toHaveBeenCalledOnce();
    const retryAircraft = makeAircraftAsset();
    loadCombatAircraft.mockResolvedValueOnce(retryAircraft.asset);
    await expect(controller.prepare(launchOptions)).resolves.toBe(true);
    expect(state.installed).toEqual([retryTerrain.terrain]);
    expect(controller.start()).toBe(true);
    controller.dispose();
    aircraftLoad.resolve({ id: 'late-aircraft' });
  });

  it('cancels both loads on dispose, restores preparation state, and allows a fresh launch', async () => {
    let terrainSignal;
    let aircraftSignal;
    const terrainLoader = vi.fn((_areaId, _progress, signal) => new Promise((_resolve, reject) => {
      terrainSignal = signal;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const aircraftLoader = vi.fn((_progress, signal) => new Promise((_resolve, reject) => {
      aircraftSignal = signal;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const { controller, state } = createHarness({ terrainLoader, aircraftLoader });

    const cancelledLaunch = controller.prepare(launchOptions);
    controller.dispose();
    await expect(cancelledLaunch).resolves.toBe(false);

    expect(terrainSignal.aborted).toBe(true);
    expect(aircraftSignal.aborted).toBe(true);
    expect(state.cancellations).toBe(1);
    expect(state.failures).toEqual([]);
    expect(state.loading).toBe(false);

    const retryTerrain = makeTerrain('north');
    terrainLoader.mockResolvedValueOnce(retryTerrain.terrain);
    aircraftLoader.mockResolvedValueOnce({ id: 'aircraft' });
    await expect(controller.prepare(launchOptions)).resolves.toBe(true);
    expect(controller.start()).toBe(true);
    expect(state.installed).toEqual([retryTerrain.terrain]);
    controller.dispose();
  });

  it('fails fast when one asset request fails, releases the other late result, and retries', async () => {
    const lateLoad = deferred();
    const lateTerrain = makeTerrain('north');
    const retryTerrain = makeTerrain('north');
    let terrainSignal;
    const terrainLoader = vi.fn()
      .mockImplementationOnce((_areaId, _progress, signal) => {
        terrainSignal = signal;
        return lateLoad.promise;
      })
      .mockResolvedValueOnce(retryTerrain.terrain);
    const aircraftLoader = vi.fn()
      .mockRejectedValueOnce(new Error('aircraft package is corrupt'))
      .mockResolvedValueOnce({ id: 'aircraft' });
    const { controller, state } = createHarness({ terrainLoader, aircraftLoader });

    await expect(controller.prepare(launchOptions)).resolves.toBe(false);
    expect(terrainSignal.aborted).toBe(true);
    expect(state.installed).toEqual([]);
    expect(state.failures[0].message).toMatch(/corrupt/i);
    expect(state.loading).toBe(false);

    lateLoad.resolve(lateTerrain.terrain);
    await Promise.resolve();
    await Promise.resolve();
    expect(lateTerrain.release).toHaveBeenCalledOnce();

    await expect(controller.prepare(launchOptions)).resolves.toBe(true);
    expect(state.installed).toEqual([retryTerrain.terrain]);
    expect(controller.start()).toBe(true);
    controller.dispose();
  });
});
