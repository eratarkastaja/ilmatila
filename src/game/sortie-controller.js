import { CombatWorld } from '../combat/world.js';
import { disposeTerrain } from '../environment/terrain.js';
import { CombatStressScenario } from '../performance/stress-scenario.js';
import { TacticalHud } from '../ui/hud.js';
import { MISSIONS } from '../mission/missions.js';

function withTimeout(promise, milliseconds, reason, onTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(reason));
    }, milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Owns one sortie's preparation, active flight state, and combat resources. */
export class SortieController {
  constructor({
    assets,
    ensureTerrainLoaded,
    getTerrain,
    installTerrain,
    scene,
    player,
    fx,
    audio,
    controls,
    renderer,
    difficulty,
    playerStartAgl = 450,
    stressMode = false,
    onPrepareStart = () => null,
    onProgress = () => {},
    onStatus = () => {},
    onTerrainReady = () => {},
    onResetForFlight = () => {},
    onStart = () => {},
    onPause = () => {},
    onResume = () => {},
    onFinish = () => {},
    onPrepareFailure = () => {},
  }) {
    this.assets = assets;
    this.ensureTerrainLoaded = ensureTerrainLoaded;
    this.getTerrain = getTerrain;
    this.installTerrain = installTerrain;
    this.scene = scene;
    this.player = player;
    this.fx = fx;
    this.audio = audio;
    this.controls = controls;
    this.renderer = renderer;
    this.difficulty = difficulty;
    this.playerStartAgl = playerStartAgl;
    this.stressMode = stressMode;
    this.callbacks = {
      onPrepareStart,
      onProgress,
      onStatus,
      onTerrainReady,
      onResetForFlight,
      onStart,
      onPause,
      onResume,
      onFinish,
      onPrepareFailure,
    };

    this.combat = null;
    this.tacticalHud = null;
    this.stressScenario = null;
    this.started = false;
    this.paused = false;
    this.launchInProgress = false;
    this.prepared = false;
    this.finished = false;
    this.generation = 0;
    this.loadControllers = null;
    this.pendingTerrain = null;
  }

  async prepare({ missionId, areaId, area, difficulty = this.difficulty }) {
    if (this.started || this.launchInProgress || this.prepared) return false;
    const generation = ++this.generation;
    this.launchInProgress = true;
    const supersededMenuTerrain = this.callbacks.onPrepareStart();

    let aircraftProgress = this.assets.aircraftAsset ? 1 : this.assets.aircraftProgress;
    const currentTerrain = this.getTerrain();
    let terrainProgress = currentTerrain.real && currentTerrain.id === areaId ? 1 : 0;
    let terrainDetail = terrainProgress
      ? { key: 'terrain.ready' }
      : { key: 'launch.terrainWaiting' };
    const updateProgress = () => {
      const percent = 5 + aircraftProgress * 27 + terrainProgress * 63;
      const aircraftText = aircraftProgress >= 1
        ? { key: 'launch.aircraftReady' }
        : { key: 'launch.aircraftProgress', params: { percent: Math.round(aircraftProgress * 100) } };
      const titleKey = aircraftProgress < 1 ? 'launch.loadingAircraft'
        : terrainProgress < 1 ? 'launch.loadingTerrain'
          : 'launch.preparingFlight';
      this.callbacks.onProgress(percent, titleKey, 'launch.progressSummary', {
        aircraft: aircraftText,
        terrain: terrainDetail,
      });
    };

    updateProgress();
    this.callbacks.onStatus('menu.statusPreparingArea', 'loading', { area: area.label.toUpperCase() });
    const terrainLoadController = new AbortController();
    const aircraftLoadController = new AbortController();
    this.loadControllers = { terrainLoadController, aircraftLoadController };
    let pendingTerrain = null;
    let launchFailed = false;
    let preparedCombat = null;
    let preparedStressScenario = null;

    try {
      const terrainRequestPromise = this.ensureTerrainLoaded(areaId, (progress, detail) => {
        if (generation !== this.generation) return;
        terrainProgress = progress;
        terrainDetail = detail;
        updateProgress();
      }, terrainLoadController.signal);
      const terrainPromise = withTimeout(
        terrainRequestPromise,
        90000,
        'Terrain data load timed out',
        () => terrainLoadController.abort(),
      ).then(
        value => ({ status: 'ready', value }),
        error => ({ status: 'failed', error }),
      );

      // Subscribe to the new load before cancelling a menu request for the same area.
      supersededMenuTerrain?.abort();
      void terrainRequestPromise.then(replacement => {
        if (generation !== this.generation || launchFailed) {
          if (replacement !== this.getTerrain()) disposeTerrain(replacement);
        } else {
          pendingTerrain = replacement;
          this.pendingTerrain = replacement;
        }
      }, () => {});

      const aircraftPromise = withTimeout(
        this.assets.ensureAircraftLoaded(progress => {
          if (generation !== this.generation) return;
          aircraftProgress = progress;
          updateProgress();
        }, aircraftLoadController.signal),
        25000,
        'Aircraft model load timed out',
        () => aircraftLoadController.abort(),
      );
      const [terrainResult, asset] = await Promise.all([terrainPromise, aircraftPromise]);
      if (generation !== this.generation) return false;
      this.loadControllers = null;

      if (terrainResult.status !== 'ready') throw terrainResult.error;
      const replacement = terrainResult.value;
      if (!replacement.real) throw new Error('Selected theater terrain is not a real map package');
      this.installTerrain(replacement);
      pendingTerrain = null;
      this.pendingTerrain = null;
      this.callbacks.onTerrainReady(replacement);
      this.player.position.y = replacement.sampleHeight(this.player.position.x, this.player.position.z) + this.playerStartAgl;
      this.callbacks.onResetForFlight();
      terrainProgress = 1;

      this.callbacks.onProgress(96, 'launch.buildingMission', 'launch.systemsStarting');
      this.callbacks.onStatus('launch.finalizingArea', 'loading');
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (generation !== this.generation) return false;

      const mission = this.stressMode
        ? {
            ...MISSIONS[missionId],
            deferredHostiles: false,
            hostiles: 36,
            hostileSpawnDistance: 6900,
            hostileLateralSpacing: 420,
            openingDelay: 0,
            wingmen: 8,
            groundBattle: true,
            groundPairs: 14,
            groundTrucks: 24,
            groundFrontSpan: 11800,
            convoyArea: 11600,
          }
        : MISSIONS[missionId];
      preparedCombat = new CombatWorld(
        this.scene,
        this.player,
        replacement,
        this.fx,
        asset,
        mission,
        this.audio,
        (outcome, result) => this.finish(outcome, result),
        difficulty,
        this.renderer.domElement,
      );
      const tacticalHud = new TacticalHud();
      if (this.stressMode) {
        preparedStressScenario = new CombatStressScenario({
          combat: preparedCombat,
          scene: this.scene,
          player: this.player,
          renderer: this.renderer,
        });
      }

      this.combat = preparedCombat;
      this.tacticalHud = tacticalHud;
      this.stressScenario = preparedStressScenario;
      this.prepared = true;
      return true;
    } catch (error) {
      launchFailed = true;
      if (generation !== this.generation) return false;
      preparedStressScenario?.stop();
      preparedCombat?.dispose();
      if (this.combat === preparedCombat) this.combat = null;
      if (this.stressScenario === preparedStressScenario) this.stressScenario = null;
      this.tacticalHud = null;
      this.prepared = false;
      this.controls.setEnabled(false);
      if (pendingTerrain && pendingTerrain !== this.getTerrain()) disposeTerrain(pendingTerrain);
      this.pendingTerrain = null;
      terrainLoadController.abort();
      aircraftLoadController.abort();
      this.launchInProgress = false;
      this.loadControllers = null;
      this.callbacks.onPrepareFailure(error);
      return false;
    }
  }

  start() {
    if (!this.prepared || this.started) return false;
    this.prepared = false;
    this.started = true;
    this.launchInProgress = false;
    this.paused = false;
    this.finished = false;
    this.controls.resetMouseAim();
    this.controls.setEnabled(true);
    this.audio.startEngine();
    this.callbacks.onStart();
    return true;
  }

  pause() {
    if (!this.started || this.paused || !this.combat || this.combat.destroyed || this.finished) return false;
    this.paused = true;
    this.controls.setEnabled(false);
    this.controls.keys.clear();
    this.controls.resetMouseAim();
    this.combat.clearInput();
    this.audio.setPaused(true);
    this.callbacks.onPause();
    return true;
  }

  resume() {
    if (!this.started || !this.paused || this.finished) return false;
    this.paused = false;
    this.controls.keys.clear();
    this.controls.resetMouseAim();
    this.combat?.clearInput();
    this.controls.setEnabled(true);
    this.controls.requestMouseCapture();
    this.audio.setPaused(false);
    this.callbacks.onResume();
    return true;
  }

  finish(outcome, result) {
    if (!this.started || this.finished) return false;
    this.finished = true;
    this.paused = true;
    this.controls.setEnabled(false);
    this.controls.keys.clear();
    this.combat?.clearInput();
    this.audio.setPaused(true);
    this.callbacks.onFinish(outcome, result);
    return true;
  }

  /** Aborts pending preparation and releases this sortie's combat resources. */
  dispose() {
    this.generation++;
    this.loadControllers?.terrainLoadController.abort();
    this.loadControllers?.aircraftLoadController.abort();
    this.loadControllers = null;
    if (this.pendingTerrain && this.pendingTerrain !== this.getTerrain()) {
      disposeTerrain(this.pendingTerrain);
    }
    this.pendingTerrain = null;
    this.audio.setPaused(false);
    this.audio.setGunFiring(false);
    this.audio.stopEngine(true);
    this.stressScenario?.stop();
    this.combat?.dispose();
    this.controls.setEnabled(false);
    this.controls.keys.clear();
    this.stressScenario = null;
    this.combat = null;
    this.tacticalHud = null;
    this.started = false;
    this.paused = false;
    this.launchInProgress = false;
    this.prepared = false;
    this.finished = false;
  }
}
