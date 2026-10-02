import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createTerrainMock } = vi.hoisted(() => ({ createTerrainMock: vi.fn() }));

vi.mock('../../src/environment/terrain.js', async importOriginal => {
  const terrain = await importOriginal();
  return { ...terrain, createTerrain: createTerrainMock };
});

import { AssetRepository } from '../../src/assets/asset-repository.js';
import { disposeTerrain } from '../../src/environment/terrain.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeTerrain() {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  return {
    terrain: { id: 'north', label: 'North', real: true, mesh },
    geometryDispose: vi.spyOn(geometry, 'dispose'),
    materialDispose: vi.spyOn(material, 'dispose'),
  };
}

describe('AssetRepository terrain ownership', () => {
  beforeEach(() => createTerrainMock.mockReset());

  it('shares the in-flight load but gives each subscriber an independently disposable lease', async () => {
    const load = deferred();
    const base = makeTerrain();
    createTerrainMock.mockReturnValue(load.promise);
    const repository = new AssetRepository();

    const firstRequest = repository.ensureTerrainLoaded('north');
    const secondRequest = repository.ensureTerrainLoaded('north');
    load.resolve(base.terrain);
    const [first, second] = await Promise.all([firstRequest, secondRequest]);

    expect(createTerrainMock).toHaveBeenCalledTimes(1);
    expect(first).not.toBe(second);
    expect(first.mesh).toBe(second.mesh);

    disposeTerrain(first);
    expect(base.geometryDispose).not.toHaveBeenCalled();
    expect(base.materialDispose).not.toHaveBeenCalled();

    disposeTerrain(second);
    disposeTerrain(second);
    expect(base.geometryDispose).toHaveBeenCalledTimes(1);
    expect(base.materialDispose).toHaveBeenCalledTimes(1);
  });

  it('keeps the shared load alive when one subscriber aborts', async () => {
    const load = deferred();
    const base = makeTerrain();
    createTerrainMock.mockReturnValue(load.promise);
    const repository = new AssetRepository();
    const firstController = new AbortController();
    const secondController = new AbortController();

    const firstRequest = repository.ensureTerrainLoaded('north', undefined, firstController.signal);
    const secondRequest = repository.ensureTerrainLoaded('north', undefined, secondController.signal);
    const firstRejection = expect(firstRequest).rejects.toMatchObject({ name: 'AbortError' });
    firstController.abort();
    load.resolve(base.terrain);
    const second = await secondRequest;
    await firstRejection;

    expect(createTerrainMock).toHaveBeenCalledTimes(1);
    expect(createTerrainMock.mock.calls[0][0].signal.aborted).toBe(false);
    expect(second).toMatchObject({ id: 'north', real: true });
    disposeTerrain(second);
    expect(base.geometryDispose).toHaveBeenCalledTimes(1);
  });

  it('disposes a late result when every subscriber aborted before the load settled', async () => {
    const load = deferred();
    const base = makeTerrain();
    createTerrainMock.mockReturnValue(load.promise);
    const repository = new AssetRepository();
    const firstController = new AbortController();
    const secondController = new AbortController();

    const firstRequest = repository.ensureTerrainLoaded('north', undefined, firstController.signal);
    const secondRequest = repository.ensureTerrainLoaded('north', undefined, secondController.signal);
    const firstRejection = expect(firstRequest).rejects.toMatchObject({ name: 'AbortError' });
    const secondRejection = expect(secondRequest).rejects.toMatchObject({ name: 'AbortError' });
    firstController.abort();
    secondController.abort();
    await Promise.all([firstRejection, secondRejection]);

    expect(createTerrainMock.mock.calls[0][0].signal.aborted).toBe(true);
    load.resolve(base.terrain);
    await Promise.resolve();
    await Promise.resolve();

    expect(base.geometryDispose).toHaveBeenCalledTimes(1);
    expect(base.materialDispose).toHaveBeenCalledTimes(1);
  });
});
