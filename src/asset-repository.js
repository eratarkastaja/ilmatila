import * as THREE from 'three';
import { loadCombatAircraft } from './plane.js';
import { createTerrain, disposeTerrain } from './terrain.js';

function disposeAircraftAsset(asset) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  for (const root of [asset?.player, ...Object.values(asset?.hostiles ?? {})]) {
    root?.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of objectMaterials) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
}

/** Shares in-flight aircraft and theater loads, including per-caller progress. */
export class AssetRepository {
  constructor({ onAircraftLoaded, terrainAnisotropy = 4 } = {}) {
    this.onAircraftLoaded = onAircraftLoaded;
    this.terrainAnisotropy = terrainAnisotropy;
    this.aircraftAsset = null;
    this.aircraftPromise = null;
    this.aircraftTask = null;
    this.aircraftProgress = 0;
    this.terrainTasks = new Map();
  }

  ensureAircraftLoaded(onProgress, signal) {
    if (signal?.aborted) {
      return Promise.reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
    }
    if (this.aircraftAsset) {
      if (onProgress) this.notifyProgress(onProgress, 1, null, 'aircraft');
      return Promise.resolve(this.aircraftAsset);
    }

    let task = this.aircraftTask;
    if (!task) {
      task = {
        controller: new AbortController(),
        subscribers: new Set(),
        listeners: new Map(),
        settled: false,
        promise: null,
      };
      this.aircraftTask = task;
      this.aircraftProgress = 0;
      task.promise = loadCombatAircraft(event => {
        if (this.aircraftTask !== task) return;
        if (event.total > 0) this.aircraftProgress = THREE.MathUtils.clamp(event.loaded / event.total, 0, 1);
        for (const listener of task.listeners.values()) this.notifyProgress(listener, this.aircraftProgress, null, 'aircraft');
      }, task.controller.signal).then(asset => {
        task.settled = true;
        if (this.aircraftTask !== task) {
          disposeAircraftAsset(asset);
          throw new DOMException('The operation was aborted.', 'AbortError');
        }
        this.aircraftProgress = 1;
        this.onAircraftLoaded?.(asset);
        this.aircraftAsset = asset;
        this.aircraftTask = null;
        this.aircraftPromise = null;
        for (const listener of task.listeners.values()) this.notifyProgress(listener, 1, null, 'aircraft');
        return asset;
      }).catch(error => {
        task.settled = true;
        if (this.aircraftTask === task) {
          this.aircraftTask = null;
          this.aircraftPromise = null;
          this.aircraftProgress = 0;
        }
        throw error;
      });
      this.aircraftPromise = task.promise;
    }

    const subscriber = {};
    task.subscribers.add(subscriber);
    if (onProgress) task.listeners.set(subscriber, onProgress);
    return new Promise((resolve, reject) => {
      let active = true;
      const release = () => {
        if (!active) return;
        active = false;
        task.subscribers.delete(subscriber);
        task.listeners.delete(subscriber);
        signal?.removeEventListener('abort', onAbort);
        if (!task.settled && task.subscribers.size === 0 && this.aircraftTask === task) {
          this.aircraftTask = null;
          this.aircraftPromise = null;
          this.aircraftProgress = 0;
          task.controller.abort();
        }
      };
      const onAbort = () => {
        const reason = signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError');
        release();
        reject(reason);
      };
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
      if (!active) return;
      task.promise.then(asset => {
        if (!active) return;
        release();
        resolve(asset);
      }, error => {
        if (!active) return;
        release();
        reject(error);
      });
      if (onProgress) this.notifyProgress(onProgress, this.aircraftProgress, null, 'aircraft');
    });
  }

  ensureTerrainLoaded(areaId, onProgress, signal) {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'));

    let task = this.terrainTasks.get(areaId);
    if (!task) {
      task = {
        progress: 0,
        detail: { key: 'terrain.fetchingArea' },
        listeners: new Map(),
        subscribers: new Set(),
        controller: new AbortController(),
        settled: false,
        claimed: false,
        value: null,
        promise: null,
      };
      task.promise = createTerrain({
        areaId,
        fallback: false,
        textureAnisotropy: this.terrainAnisotropy,
        signal: task.controller.signal,
        onProgress: (progress, detail) => {
          task.progress = progress;
          task.detail = detail;
          for (const listener of task.listeners.values()) this.notifyProgress(listener, progress, detail, 'terrain');
        },
      }).then(value => {
        task.value = value;
        return value;
      }).finally(() => {
        task.settled = true;
        if (this.terrainTasks.get(areaId) === task) this.terrainTasks.delete(areaId);
      });
      this.terrainTasks.set(areaId, task);
    }

    const subscriber = {};
    task.subscribers.add(subscriber);
    if (onProgress) task.listeners.set(subscriber, onProgress);

    return new Promise((resolve, reject) => {
      let active = true;
      const release = () => {
        if (!active) return;
        active = false;
        task.subscribers.delete(subscriber);
        task.listeners.delete(subscriber);
        signal?.removeEventListener('abort', onAbort);
        if (!task.settled && task.subscribers.size === 0) {
          if (this.terrainTasks.get(areaId) === task) this.terrainTasks.delete(areaId);
          task.controller.abort();
        } else if (task.settled && task.subscribers.size === 0 && !task.claimed && task.value) {
          disposeTerrain(task.value);
          task.value = null;
        }
      };
      const onAbort = () => {
        const reason = signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError');
        release();
        reject(reason);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      task.promise.then(value => {
        if (!active) return;
        task.claimed = true;
        release();
        resolve(value);
      }, error => {
        if (!active) return;
        release();
        reject(error);
      });
      if (onProgress) this.notifyProgress(onProgress, task.progress, task.detail, 'terrain');
    });
  }

  notifyProgress(listener, progress, detail, assetType) {
    try {
      listener(progress, detail);
    } catch (error) {
      console.error(`${assetType} progress listener failed.`, error);
    }
  }

}
