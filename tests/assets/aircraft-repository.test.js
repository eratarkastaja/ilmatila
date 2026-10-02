import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/aircraft/plane.js', () => ({ loadCombatAircraft: vi.fn() }));

import { loadCombatAircraft } from '../../src/aircraft/plane.js';
import { AssetRepository } from '../../src/assets/asset-repository.js';

function deferred() {
  let resolve;
  const promise = new Promise(onResolve => { resolve = onResolve; });
  return { promise, resolve };
}

function makeAircraftAsset() {
  const model = () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    root.add(new THREE.Mesh(geometry, material));
    return { root, geometry, material };
  };
  const player = model();
  const hostile = model();
  return {
    asset: { player: player.root, hostiles: { su27: hostile.root } },
    resources: [player, hostile],
  };
}

describe('AssetRepository aircraft loading ownership', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shares one aircraft load and keeps it alive when one caller aborts', async () => {
    const loading = deferred();
    let loadSignal;
    loadCombatAircraft.mockImplementation((_onProgress, signal) => {
      loadSignal = signal;
      return loading.promise;
    });
    const onAircraftLoaded = vi.fn();
    const repository = new AssetRepository({ onAircraftLoaded });
    const abortedCaller = new AbortController();
    const first = repository.ensureAircraftLoaded(undefined, abortedCaller.signal);
    const second = repository.ensureAircraftLoaded();
    const firstRejection = expect(first).rejects.toMatchObject({ name: 'AbortError' });

    abortedCaller.abort();
    await firstRejection;
    expect(loadSignal.aborted).toBe(false);

    const { asset } = makeAircraftAsset();
    loading.resolve(asset);
    await expect(second).resolves.toBe(asset);

    expect(loadCombatAircraft).toHaveBeenCalledOnce();
    expect(onAircraftLoaded).toHaveBeenCalledOnce();
    expect(repository.aircraftAsset).toBe(asset);
  });

  it('aborts the load and disposes a late aircraft asset after the last caller leaves', async () => {
    const loading = deferred();
    let loadSignal;
    loadCombatAircraft.mockImplementation((_onProgress, signal) => {
      loadSignal = signal;
      return loading.promise;
    });
    const onAircraftLoaded = vi.fn();
    const repository = new AssetRepository({ onAircraftLoaded });
    const controller = new AbortController();
    const request = repository.ensureAircraftLoaded(undefined, controller.signal);

    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(loadSignal.aborted).toBe(true);

    const { asset, resources } = makeAircraftAsset();
    const geometryDisposals = resources.map(({ geometry }) => vi.spyOn(geometry, 'dispose'));
    const materialDisposals = resources.map(({ material }) => vi.spyOn(material, 'dispose'));
    loading.resolve(asset);
    await vi.waitFor(() => {
      expect(geometryDisposals.every(dispose => dispose.mock.calls.length === 1)).toBe(true);
    });

    expect(materialDisposals.every(dispose => dispose.mock.calls.length === 1)).toBe(true);
    expect(onAircraftLoaded).not.toHaveBeenCalled();
    expect(repository.aircraftAsset).toBeNull();
  });
});
