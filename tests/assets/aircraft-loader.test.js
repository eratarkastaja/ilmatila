import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

const loaderMocks = vi.hoisted(() => ({
  loadAsync: vi.fn(),
  manager: null,
  abort: null,
}));

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    constructor(manager) {
      loaderMocks.manager = manager;
      loaderMocks.abort = vi.spyOn(manager, 'abort');
    }

    loadAsync(url, onProgress) {
      return loaderMocks.loadAsync(url, onProgress);
    }
  },
}));

import { loadCombatAircraft } from '../../src/aircraft/plane.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function makeLoadedScene() {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  root.add(new THREE.Mesh(geometry, material));
  return {
    root,
    geometryDispose: vi.spyOn(geometry, 'dispose'),
    materialDispose: vi.spyOn(material, 'dispose'),
  };
}

describe('loadCombatAircraft resource cleanup', () => {
  it('disposes completed scenes when one load fails and disposes later successes', async () => {
    const player = deferred();
    const su27 = deferred();
    const mig29 = deferred();
    loaderMocks.loadAsync.mockImplementation(url => {
      if (url.includes('f35-lightning')) return player.promise;
      if (url.includes('su27.glb')) return su27.promise;
      return mig29.promise;
    });
    const loadedPlayer = makeLoadedScene();
    const lateMig29 = makeLoadedScene();
    const failure = new Error('SU-27 model failed to load');

    const loading = loadCombatAircraft();
    player.resolve({ scene: loadedPlayer.root });
    await vi.waitFor(() => expect(loaderMocks.loadAsync).toHaveBeenCalledTimes(3));
    su27.reject(failure);

    await expect(loading).rejects.toBe(failure);
    expect(loaderMocks.abort).toHaveBeenCalledOnce();
    expect(loadedPlayer.geometryDispose).toHaveBeenCalledOnce();
    expect(loadedPlayer.materialDispose).toHaveBeenCalledOnce();

    mig29.resolve({ scene: lateMig29.root });
    await vi.waitFor(() => expect(lateMig29.geometryDispose).toHaveBeenCalledOnce());
    expect(lateMig29.materialDispose).toHaveBeenCalledOnce();
  });
});
