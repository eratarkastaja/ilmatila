import * as THREE from 'three';
import { loadF35Aircraft } from './plane.js';
import { createTerrain } from './terrain.js';

/** Shares in-flight aircraft and theater loads, including per-caller progress. */
export class AssetRepository {
  constructor({ onAircraftLoaded } = {}) {
    this.onAircraftLoaded = onAircraftLoaded;
    this.aircraftAsset = null;
    this.aircraftPromise = null;
    this.aircraftProgress = 0;
    this.aircraftProgressListeners = new Set();
    this.terrainTasks = new Map();
  }

  ensureAircraftLoaded(onProgress, signal) {
    if (this.aircraftAsset) {
      onProgress?.(1);
      return Promise.resolve(this.aircraftAsset);
    }

    if (!this.aircraftPromise) {
      this.aircraftProgress = 0;
      this.aircraftPromise = loadF35Aircraft(event => {
        if (event.total > 0) this.aircraftProgress = THREE.MathUtils.clamp(event.loaded / event.total, 0, 1);
        for (const listener of this.aircraftProgressListeners) listener(this.aircraftProgress);
      }).then(asset => {
        this.aircraftProgress = 1;
        this.onAircraftLoaded?.(asset);
        this.aircraftAsset = asset;
        for (const listener of this.aircraftProgressListeners) listener(1);
        return asset;
      }).catch(error => {
        this.aircraftPromise = null;
        this.aircraftProgress = 0;
        throw error;
      });
    }

    const unsubscribe = onProgress ? this.subscribeAircraftProgress(onProgress) : null;
    const abortSubscription = () => unsubscribe?.();
    if (signal?.aborted) abortSubscription();
    else signal?.addEventListener('abort', abortSubscription, { once: true });
    return this.aircraftPromise.finally(() => {
      unsubscribe?.();
      signal?.removeEventListener('abort', abortSubscription);
    });
  }

  ensureTerrainLoaded(areaId, onProgress, signal) {
    let task = this.terrainTasks.get(areaId);
    if (!task) {
      task = { progress: 0, detail: { key: 'terrain.fetchingArea' }, listeners: new Set(), promise: null };
      task.promise = createTerrain({
        areaId,
        fallback: false,
        onProgress: (progress, detail) => {
          task.progress = progress;
          task.detail = detail;
          for (const listener of task.listeners) listener(progress, detail);
        },
      }).finally(() => this.terrainTasks.delete(areaId));
      this.terrainTasks.set(areaId, task);
    }

    let unsubscribe = null;
    if (onProgress) {
      task.listeners.add(onProgress);
      onProgress(task.progress, task.detail);
      unsubscribe = () => task.listeners.delete(onProgress);
    }
    const abortSubscription = () => unsubscribe?.();
    if (signal?.aborted) abortSubscription();
    else signal?.addEventListener('abort', abortSubscription, { once: true });
    return task.promise.finally(() => {
      unsubscribe?.();
      signal?.removeEventListener('abort', abortSubscription);
    });
  }

  subscribeAircraftProgress(listener) {
    this.aircraftProgressListeners.add(listener);
    listener(this.aircraftProgress);
    return () => this.aircraftProgressListeners.delete(listener);
  }
}
