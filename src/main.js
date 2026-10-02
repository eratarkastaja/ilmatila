import * as THREE from 'three';
import packageMetadata from '../package.json';
import { createFighter } from './aircraft/plane.js';
import { AssetRepository } from './assets/asset-repository.js';
import { makeClouds } from './environment/clouds.js';
import { MenuRadar } from './ui/menu-radar.js';
import { FlightControls } from './input/controls.js';
import { disposeCombatEffectResources } from './combat/world.js';
import { createPreviewTerrain, disposeTerrain, TERRAIN_AREAS } from './environment/terrain.js';
import { FlightFX } from './effects/fx.js';
import { GameAudio } from './audio/audio.js';
import { SunEffects, SUN_DIRECTION } from './environment/sun.js';
import { ATMOSPHERE } from './environment/atmosphere.js';
import { MISSIONS } from './mission/missions.js';
import { resolveMissionVariant } from './mission/mission-variants.js';
import { CareerProgress } from './mission/progression.js';
import { SortieController } from './game/sortie-controller.js';
import { disposeMissilePool } from './combat/projectiles.js';
import { createSortieSeed } from './combat/random.js';
import { renderOptionalObjectives } from './ui/optional-objectives.js';
import { formatPercent, getLanguage, initializeLanguagePicker, t } from './ui/i18n.js';
import './ui/styles/base.css';
import './ui/styles/hud.css';
import './ui/styles/menu.css';

const root = document.querySelector('#game');
const PLAYER_START_AGL = 450;
const startMenu = document.querySelector('#start-menu');
document.querySelector('#menu-version').textContent = packageMetadata.version;
const flightHud = document.querySelector('#flight-hud');
const menuStatus = document.querySelector('#menu-status');
const menuTheater = document.querySelector('#menu-theater');
const menuDifficulty = document.querySelector('#menu-difficulty');
const launchButton = document.querySelector('#launch-mission');
const launchProgress = document.querySelector('#launch-progress');
const launchProgressFill = document.querySelector('#launch-progress-fill');
const launchProgressStatus = document.querySelector('#launch-progress-status');
const launchProgressTitle = document.querySelector('#launch-progress-title');
const pauseControlsReference = document.querySelector('#pause-controls-reference');
pauseControlsReference.append(
  document.querySelector('#start-menu .menu-control-grid').cloneNode(true),
);
const pauseControlsDescription = document.querySelector('#start-menu .menu-lock-instruction').cloneNode(true);
pauseControlsDescription.id = 'pause-controls-description';
pauseControlsReference.append(pauseControlsDescription);
initializeLanguagePicker();
const audio = new GameAudio();
const missionCards = [...document.querySelectorAll('[data-mission]')];
const briefingOptionalObjectiveList = document.querySelector('#briefing-optional-objective-list');
const briefingVariant = document.querySelector('#briefing-variant');
const careerProgress = new CareerProgress();
menuDifficulty.value = careerProgress.difficulty;
const urlParams = new URLSearchParams(location.search);
const stressMode = import.meta.env.DEV && urlParams.get('stress') === '1';
const telemetryMode = import.meta.env.DEV;
const areaAliases = new Map([['vironlahti', 'virolahti']]);
let selectedMissionId = Object.hasOwn(MISSIONS, urlParams.get('mission')) ? urlParams.get('mission') : 'patrol';
if (!careerProgress.isUnlocked(selectedMissionId)) selectedMissionId = 'patrol';
let plannedSortieSeed = null;
let menuRadar = null;
const theaterAreas = TERRAIN_AREAS;
if (!menuTheater.options.length) {
  for (const area of theaterAreas) {
    const option = document.createElement('option');
    option.value = area.id;
    option.textContent = area.label.toUpperCase();
    menuTheater.append(option);
  }
}
const rawPreferredArea = urlParams.get('area');
const preferredArea = areaAliases.get(rawPreferredArea) ?? rawPreferredArea;
if (rawPreferredArea && preferredArea !== rawPreferredArea) {
  const canonicalUrl = new URL(location.href);
  canonicalUrl.searchParams.set('area', preferredArea);
  history.replaceState(null, '', `${canonicalUrl.pathname}${canonicalUrl.search}${canonicalUrl.hash}`);
}
const initialAreaId = theaterAreas.some(area => area.id === preferredArea)
  ? preferredArea
  : theaterAreas.find(area => area.id === 'paijanne')?.id ?? theaterAreas[0].id;
menuTheater.value = initialAreaId;
let selectedAreaId = initialAreaId;

const scene = new THREE.Scene();
scene.background = new THREE.Color(ATMOSPHERE.hazeColor);
scene.fog = new THREE.FogExp2(ATMOSPHERE.hazeColor, ATMOSPHERE.sceneFogDensity);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 22000);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
root.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xc5e0eb, 0x343b36, 2.2));
const sun = new THREE.DirectionalLight(0xffedcf, 3.7);
sun.position.copy(SUN_DIRECTION).multiplyScalar(1200);
scene.add(sun);
const sunEffects = new SunEffects(scene, camera);

let terrain = createPreviewTerrain();
let loadedAreaId = terrain.id;
scene.add(terrain.mesh);
const clouds = makeClouds();
scene.add(clouds);
const player = createFighter();
scene.add(player);
const controls = new FlightControls(player, camera, renderer.domElement);
controls.setEnabled(false);
const fx = new FlightFX(scene);
const weather = {
  // Moist, cloudy air makes long contrails visible once aircraft climb above 5.2 km AGL.
  humidity: 0.78,
  cloudCoverage: 0.62,
  contrailBaseAltitude: 5200,
  contrailFullAltitude: 6800,
  wind: new THREE.Vector3(5, 0.15, -3),
};
let sortie = null;
let startMenuHideTimer = null;
let menuStatusDescriptor = { key: 'menu.statusReady', params: {}, state: 'ready' };
let launchProgressDescriptor = { progress: 0, titleKey: 'menu.launchButton', detailKey: 'menu.launchReadyStatus', params: {} };
document.addEventListener('ilmatila:languagechange', () => {
  selectMission(selectedMissionId);
  renderMissionProgress();
  const areaLabel = menuStatusDescriptor.key === 'menu.statusTerrainError'
    ? terrain
    : theaterAreas.find(area => area.id === selectedAreaId);
  updateMenuArea(areaLabel);
  renderMenuStatus();
  renderLaunchProgress();
});

function renderMenuStatus() {
  const dot = document.createElement('i');
  menuStatus.replaceChildren(dot, document.createTextNode(t(menuStatusDescriptor.key, menuStatusDescriptor.params)));
  menuStatus.dataset.state = menuStatusDescriptor.state;
}

function setMenuStatus(key, state = 'ready', params = {}) {
  menuStatusDescriptor = { key, params, state };
  renderMenuStatus();
}

function renderLaunchProgress() {
  const { progress, titleKey, detailKey, params } = launchProgressDescriptor;
  const value = Math.round(THREE.MathUtils.clamp(progress, 0, 100));
  const detail = t(detailKey, params);
  launchProgress.setAttribute('aria-valuenow', String(value));
  launchProgress.setAttribute('aria-valuetext', `${value}% · ${detail}`);
  launchProgressFill.style.width = `${value}%`;
  launchProgressTitle.textContent = t(titleKey, params);
  launchProgressStatus.textContent = detail;
}

function setLaunchProgress(progress, titleKey, detailKey, params = {}) {
  launchProgressDescriptor = { progress, titleKey, detailKey, params };
  renderLaunchProgress();
}

function ensureTerrainLoaded(areaId, onProgress, signal) {
  if (terrain.real && terrain.id === areaId) {
    onProgress?.(1, { key: 'terrain.ready' });
    return Promise.resolve(terrain);
  }
  return assets.ensureTerrainLoaded(areaId, onProgress, signal);
}

function renderMissionProgress() {
  for (const card of missionCards) {
    const id = card.dataset.mission;
    const unlocked = careerProgress.isUnlocked(id);
    const state = card.querySelector('[data-mission-state]');
    const best = careerProgress.getBest(id);
    card.disabled = !unlocked;
    card.classList.toggle('locked', !unlocked);
    card.setAttribute('aria-disabled', String(!unlocked));
    if (!state) continue;
    if (!unlocked) {
      state.textContent = t('menu.missionLocked');
      state.dataset.state = 'locked';
    } else if (best) {
      state.textContent = t('menu.bestScore', {
        score: best.score.toLocaleString(getLanguage() === 'fi' ? 'fi-FI' : 'en-US'),
        accuracy: formatPercent(best.accuracy),
      });
      state.dataset.state = 'record';
    } else {
      state.textContent = t('menu.noRecord');
      state.dataset.state = 'empty';
    }
  }
}

function selectMission(id) {
  if (!Object.hasOwn(MISSIONS, id) || !careerProgress.isUnlocked(id)) return false;
  if (selectedMissionId !== id || plannedSortieSeed === null) plannedSortieSeed = createSortieSeed();
  selectedMissionId = id;
  const baseMission = stressMode ? { ...MISSIONS[id], variants: [] } : MISSIONS[id];
  const missionResolution = resolveMissionVariant(baseMission, plannedSortieSeed);
  menuRadar?.setMission(id);
  for (const card of missionCards) {
    const selected = card.dataset.mission === id;
    card.classList.toggle('selected', selected);
    card.setAttribute('aria-pressed', String(selected));
  }
  document.querySelector('#briefing-code').textContent = t(`mission.${id}.code`);
  document.querySelector('#briefing-copy').textContent = t(`mission.${id}.briefing`);
  document.querySelector('#theater-mission-name').textContent = t(`mission.${id}.title`).toUpperCase();
  renderOptionalObjectives(briefingOptionalObjectiveList, missionResolution.mission.optionalObjectives);
  if (briefingVariant) {
    briefingVariant.hidden = !missionResolution.variant;
    briefingVariant.textContent = missionResolution.variant
      ? t('mission.briefing.variant', { name: t(missionResolution.variant.labelKey) })
      : '';
  }
  return true;
}

function updateMenuArea(area) {
  const name = area?.real
    ? area.metadata?.region || area.label
    : area?.id && area.id !== 'preview'
      ? area.label
      : t('terrain.previewAreaName');
  document.querySelector('#theater-area-name').textContent = name.toUpperCase();
}

function installTerrain(replacement) {
  if (replacement === terrain) return;
  const previous = terrain;
  scene.add(replacement.mesh);
  disposeTerrain(previous);
  terrain = replacement;
}

updateMenuArea(theaterAreas.find(area => area.id === initialAreaId));
selectMission(selectedMissionId);
renderMissionProgress();
setMenuStatus('menu.statusReady', 'ready');
setLaunchProgress(0, 'menu.launchButton', 'menu.launchReadyStatus');
menuTheater.disabled = false;
launchButton.disabled = false;

let terrainRequest = 0;
let menuTerrainController = null;
async function loadTerrainForMenu(requestedId) {
  const requestId = ++terrainRequest;
  menuTerrainController?.abort();
  const requestedArea = theaterAreas.find(area => area.id === requestedId);
  if (!requestedArea || sortie?.started) return;
  if (requestedId === loadedAreaId) {
    if (!sortie?.launchInProgress && terrain.real) {
      launchButton.disabled = false;
      launchButton.setAttribute('aria-busy', 'false');
      setLaunchProgress(0, 'menu.launchButton', 'menu.launchReadyStatus');
      setMenuStatus('menu.statusAreaReady', 'ready', { area: terrain.label.toUpperCase() });
    }
    return;
  }
  const controller = new AbortController();
  menuTerrainController = controller;
  if (!sortie?.launchInProgress) {
    launchButton.disabled = true;
    launchButton.setAttribute('aria-busy', 'true');
    setLaunchProgress(1, 'menu.loadingAreaTitle', 'terrain.fetchingArea');
    setMenuStatus('menu.statusAreaLoading', 'loading', { area: requestedArea.label.toUpperCase() });
  }
  try {
    const replacement = await ensureTerrainLoaded(requestedId, (progress, detail = {}) => {
      if (requestId !== terrainRequest || controller.signal.aborted || sortie?.launchInProgress) return;
      setLaunchProgress(progress * 100, 'menu.loadingAreaTitle', detail.key ?? 'terrain.fetchingArea', detail.params ?? {});
    }, controller.signal);
    if (requestId !== terrainRequest || sortie?.started) {
      if (replacement !== terrain) disposeTerrain(replacement);
      return;
    }
    installTerrain(replacement);
    loadedAreaId = replacement.id;
    needsMenuRender = true;
    updateMenuArea(terrain);
    if (!sortie?.launchInProgress) {
      launchButton.disabled = false;
      launchButton.setAttribute('aria-busy', 'false');
      setLaunchProgress(0, 'menu.launchButton', 'menu.launchReadyStatus');
      setMenuStatus('menu.statusAreaReady', 'ready', { area: terrain.label.toUpperCase() });
    }
  } catch (error) {
    if (controller.signal.aborted) return;
    console.error('Theater terrain failed to load.', error);
    if (requestId === terrainRequest && !sortie?.started && !sortie?.launchInProgress) {
      launchButton.disabled = false;
      launchButton.setAttribute('aria-busy', 'false');
      setLaunchProgress(0, 'menu.launchButton', 'menu.launchReadyStatus');
      const preview = createPreviewTerrain();
      installTerrain(preview);
      loadedAreaId = preview.id;
      updateMenuArea(preview);
      setMenuStatus('menu.statusTerrainError', 'warning');
    }
  } finally {
    if (menuTerrainController === controller) menuTerrainController = null;
  }
}

menuTheater.addEventListener('change', () => {
  selectedAreaId = menuTheater.value;
  const requestedArea = theaterAreas.find(area => area.id === selectedAreaId);
  updateMenuArea(requestedArea);
  void loadTerrainForMenu(selectedAreaId);
});
menuDifficulty.addEventListener('change', () => {
  careerProgress.setDifficulty(menuDifficulty.value);
  renderMissionProgress();
});

for (const card of missionCards) card.addEventListener('click', () => selectMission(card.dataset.mission));

const creditsDialog = document.querySelector('#credits-dialog');
const pauseDialog = document.querySelector('#pause-dialog');
const pauseMainPanel = document.querySelector('#pause-main-panel');
const pauseConfirmPanel = document.querySelector('#pause-confirm-panel');
const pauseControlsPanel = document.querySelector('#pause-controls-panel');
const missionDebriefDialog = document.querySelector('#mission-debrief');
const resumeFlightButton = document.querySelector('#resume-flight');
const resumeLockStatus = document.querySelector('#resume-lock-status');
const showFlightControlsButton = document.querySelector('#show-flight-controls');
const backToPauseButton = document.querySelector('#back-to-pause');
const quitToMenuButton = document.querySelector('#quit-to-menu');
const cancelQuitToMenuButton = document.querySelector('#cancel-quit-to-menu');
const confirmQuitToMenuButton = document.querySelector('#confirm-quit-to-menu');
const missionDebriefReturnButton = document.querySelector('#mission-debrief-return');
document.querySelector('#open-credits').addEventListener('click', () => creditsDialog.showModal());
document.querySelector('#close-credits').addEventListener('click', () => creditsDialog.close());
document.querySelector('#credits-back').addEventListener('click', () => creditsDialog.close());
creditsDialog.addEventListener('click', event => {
  if (event.target === creditsDialog) creditsDialog.close();
});

function pauseFlight() {
  if (!sortie?.started || sortie.paused) return false;
  resumeCapturePending = false;
  if (sortie.pause()) return true;
  return false;
}

function showPauseControls() {
  if (!sortie?.paused) return;
  pauseMainPanel.hidden = true;
  pauseConfirmPanel.hidden = true;
  pauseControlsPanel.hidden = false;
  pauseDialog.setAttribute('aria-labelledby', 'pause-controls-title');
  pauseDialog.setAttribute('aria-describedby', 'pause-controls-description');
  backToPauseButton.focus({ preventScroll: true });
}

function returnToPauseOptions(focus = true, focusTarget = showFlightControlsButton) {
  pauseConfirmPanel.hidden = true;
  pauseControlsPanel.hidden = true;
  pauseMainPanel.hidden = false;
  pauseDialog.setAttribute('aria-labelledby', 'pause-title');
  pauseDialog.setAttribute('aria-describedby', 'pause-description');
  if (focus && sortie?.paused) focusTarget.focus({ preventScroll: true });
}

function confirmMissionInterruption() {
  if (!sortie?.paused) return;
  pauseMainPanel.hidden = true;
  pauseControlsPanel.hidden = true;
  pauseConfirmPanel.hidden = false;
  pauseDialog.setAttribute('aria-labelledby', 'pause-confirm-title');
  pauseDialog.setAttribute('aria-describedby', 'pause-confirm-description');
  cancelQuitToMenuButton.focus({ preventScroll: true });
}

let resumeCapturePending = false;

function setResumeLockStatus(key = null) {
  resumeLockStatus.hidden = !key;
  resumeLockStatus.textContent = key ? t(key) : '';
}

function reportResumeCaptureFailure() {
  if (!resumeCapturePending || !sortie?.started || !sortie.paused) return;
  resumeCapturePending = false;
  setResumeLockStatus('pause.pointerLockError');
  if (import.meta.env.DEV) {
    console.warn('Pointer lock was denied during resume; the sortie remains paused.');
  }
}

function resumeAfterPointerCapture() {
  if (!resumeCapturePending || !sortie?.started || !sortie.paused
    || document.pointerLockElement !== renderer.domElement) return false;
  resumeCapturePending = false;
  const resumed = sortie.resume();
  if (resumed) {
    setResumeLockStatus();
  }
  return resumed;
}

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement) return;
  if (resumeAfterPointerCapture()) return;
  if (sortie?.finished || (!sortie?.started && !sortie?.launchInProgress)) {
    document.exitPointerLock?.();
  }
});

document.addEventListener('pointerlockerror', reportResumeCaptureFailure);

function resumeFlight() {
  if (!sortie?.started || !sortie.paused || resumeCapturePending) return;
  resumeCapturePending = true;
  setResumeLockStatus();
  let captureRequest;
  try {
    // Keep this call inside the initiating click or P key gesture. The sortie
    // remains paused until the browser confirms canvas ownership.
    captureRequest = controls.requestMouseCapture();
  } catch {
    reportResumeCaptureFailure();
    return;
  }
  Promise.resolve(captureRequest).then(locked => {
    if (!resumeCapturePending) return;
    if (locked && document.pointerLockElement === renderer.domElement) {
      resumeAfterPointerCapture();
    } else {
      reportResumeCaptureFailure();
    }
  }, reportResumeCaptureFailure);
}

function resetPlayerAirframeVisuals() {
  Object.assign(player.userData, {
    airframeHealthRatio: 1,
    damageSmokeSeverity: 0,
    handlingFactor: 1,
    destroyed: false,
  });
}

function clearStartMenuHideTimer() {
  if (startMenuHideTimer !== null) clearTimeout(startMenuHideTimer);
  startMenuHideTimer = null;
}

function returnToMenu() {
  if (!sortie?.started) return;
  clearStartMenuHideTimer();
  resumeCapturePending = false;
  setResumeLockStatus();
  root.classList.remove('flight-active', 'flight-paused');
  if (pauseDialog.open) pauseDialog.close();
  if (missionDebriefDialog.open) missionDebriefDialog.close();
  sortie.dispose();
  delete window.__ilmatilaStress;
  delete window.__ilmatilaTelemetry;
  controls.resetMouseAim();
  controls.resetCameraZoom();
  controls.speed = 235;
  controls.pitch = 0;
  controls.roll = 0;
  controls.heading = 0;
  controls.elapsed = 0;
  controls.bankReferenceValid = true;
  player.position.set(0, 70, 0);
  player.quaternion.identity();
  resetPlayerAirframeVisuals();
  player.userData.boosting = false;
  if (player.userData.afterburner) player.userData.afterburner.visible = false;
  controls.updateAttitude();
  camera.position.set(0, 75, -22);
  camera.lookAt(0, 70, 30);
  clouds.position.set(0, 0, 0);
  fx.reset();
  previousAltitude = player.position.y;
  flightHud.hidden = true;
  document.querySelector('#death-screen').hidden = true;
  startMenu.hidden = false;
  startMenu.classList.remove('menu-leaving');
  launchButton.disabled = false;
  menuDifficulty.disabled = false;
  launchButton.setAttribute('aria-busy', 'false');
  menuTheater.disabled = false;
  setLaunchProgress(0, 'menu.launchButton', 'menu.launchReadyStatus');
  updateMenuArea(terrain);
  plannedSortieSeed = null;
  selectMission(selectedMissionId);
  if (terrain.real) setMenuStatus('menu.statusAreaReady', 'ready', { area: terrain.label.toUpperCase() });
  else setMenuStatus('menu.statusTerrainError', 'warning');
  const nextUrl = new URL(location.href);
  nextUrl.searchParams.set('mission', selectedMissionId);
  nextUrl.searchParams.set('area', selectedAreaId);
  history.replaceState(null, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  needsMenuRender = true;
  launchButton.focus({ preventScroll: true });
}

document.addEventListener('click', event => {
  if (event.target !== resumeFlightButton
    && event.target?.closest?.('#resume-flight') !== resumeFlightButton) return;
  resumeFlight();
});
showFlightControlsButton.addEventListener('click', showPauseControls);
backToPauseButton.addEventListener('click', () => returnToPauseOptions());
quitToMenuButton.addEventListener('click', confirmMissionInterruption);
cancelQuitToMenuButton.addEventListener('click', () => returnToPauseOptions(true, quitToMenuButton));
confirmQuitToMenuButton.addEventListener('click', returnToMenu);
missionDebriefReturnButton.addEventListener('click', returnToMenu);
missionDebriefDialog.addEventListener('cancel', event => event.preventDefault());
pauseDialog.addEventListener('cancel', event => {
  // Keep Escape from dismissing a paused sortie; P or Resume Flight resumes it.
  event.preventDefault();
});
document.addEventListener('keydown', event => {
  if (!sortie?.started || sortie.finished || sortie.combat?.destroyed) return;
  if (event.code !== 'KeyP' || event.repeat) return;
  event.preventDefault();
  event.stopPropagation();
  if (sortie.paused) resumeFlight();
  else pauseFlight();
}, { capture: true });

launchButton.addEventListener('click', async () => {
  if (sortie?.started || sortie?.launchInProgress || launchButton.disabled) return;
  if (plannedSortieSeed === null) {
    plannedSortieSeed = createSortieSeed();
    selectMission(selectedMissionId);
  }
  // Pointer lock must be requested directly in the launch-button gesture;
  // waiting for the asynchronous terrain/model loads loses browser activation.
  let captureRequest;
  try {
    captureRequest = controls.requestMouseCapture();
  } catch {
    captureRequest = Promise.resolve(false);
  }
  const selectedArea = theaterAreas.find(area => area.id === selectedAreaId) ?? theaterAreas[0];
  const prepared = await sortie.prepare({
    missionId: selectedMissionId,
    areaId: selectedArea.id,
    area: selectedArea,
    difficulty: careerProgress.difficulty,
    seed: plannedSortieSeed,
  });
  if (!prepared) return;
  const locked = await Promise.resolve(captureRequest).then(Boolean, () => false);
  if (!locked || document.pointerLockElement !== renderer.domElement) {
    sortie.dispose();
    launchButton.disabled = false;
    menuDifficulty.disabled = false;
    launchButton.setAttribute('aria-busy', 'false');
    menuTheater.disabled = false;
    setLaunchProgress(0, 'menu.launchButton', 'menu.launchReadyStatus');
    setMenuStatus('launch.pointerLockFailed', 'error');
    if (import.meta.env.DEV) console.warn('Pointer lock was denied during launch; the sortie was not started.');
    return;
  }
  sortie.start();
});

const clock = new THREE.Clock();
const speedEl = document.querySelector('#speed');
const altitudeEl = document.querySelector('#altitude');
const headingEl = document.querySelector('#heading');
const gunReticle = document.querySelector('.crosshair');
const gunBoresightPoint = new THREE.Vector3();
const gunReticleShift = new THREE.Vector2();
const activeAircraft = [];
const activeMissiles = [];
const HUD_READOUT_INTERVAL = 1 / 15;
let hasGunReticleShift = false;
let hudReadoutElapsed = HUD_READOUT_INTERVAL;
let previousAltitude = player.position.y;
let needsMenuRender = true;
const assets = new AssetRepository({
  terrainAnisotropy: Math.min(renderer.capabilities.getMaxAnisotropy(), 12),
  onAircraftLoaded: aircraftAssets => {
    const aircraftVisual = createFighter({ aircraftAsset: aircraftAssets.player });
    for (const child of [...aircraftVisual.children]) player.add(child);
    Object.assign(player.userData, aircraftVisual.userData);
    needsMenuRender = true;
  },
});
menuRadar = new MenuRadar({
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  missionId: selectedMissionId,
});

sortie = new SortieController({
  assets,
  ensureTerrainLoaded,
  getTerrain: () => terrain,
  installTerrain,
  scene,
  player,
  fx,
  audio,
  controls,
  renderer,
  difficulty: careerProgress.difficulty,
  playerStartAgl: PLAYER_START_AGL,
  stressMode,
  telemetryMode,
  onPrepareStart: () => {
    const supersededMenuTerrain = menuTerrainController;
    terrainRequest++;
    menuTerrainController = null;
    launchButton.disabled = true;
    menuDifficulty.disabled = true;
    launchButton.setAttribute('aria-busy', 'true');
    menuTheater.disabled = true;
    return supersededMenuTerrain;
  },
  onProgress: setLaunchProgress,
  onStatus: setMenuStatus,
  onTerrainReady: replacement => {
    loadedAreaId = replacement.id;
    updateMenuArea(replacement);
    needsMenuRender = true;
  },
  onResetForFlight: () => {
    previousAltitude = player.position.y;
    hudReadoutElapsed = HUD_READOUT_INTERVAL;
    hasGunReticleShift = false;
    fx.reset();
    resetPlayerAirframeVisuals();
  },
  onStart: () => {
    resumeCapturePending = false;
    setResumeLockStatus();
    const nextUrl = new URL(location.href);
    nextUrl.searchParams.set('mission', selectedMissionId);
    nextUrl.searchParams.set('area', selectedAreaId);
    history.replaceState(null, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    if (stressMode) window.__ilmatilaStress = sortie.stressScenario;
    if (telemetryMode) window.__ilmatilaTelemetry = sortie.telemetry;
    root.classList.add('flight-active');
    root.classList.remove('flight-paused');
    flightHud.hidden = false;
    setLaunchProgress(100, 'launch.flightReady', 'launch.enterCockpit');
    startMenu.classList.add('menu-leaving');
    setMenuStatus('launch.missionActive', 'active');
    clearStartMenuHideTimer();
    const activeCombat = sortie.combat;
    const timer = setTimeout(() => {
      if (startMenuHideTimer !== timer) return;
      startMenuHideTimer = null;
      if (sortie.started && sortie.combat === activeCombat) startMenu.hidden = true;
    }, 460);
    startMenuHideTimer = timer;
  },
  onPause: () => {
    root.classList.add('flight-paused');
    setResumeLockStatus();
    pauseConfirmPanel.hidden = true;
    pauseControlsPanel.hidden = true;
    pauseMainPanel.hidden = false;
    pauseDialog.setAttribute('aria-labelledby', 'pause-title');
    pauseDialog.setAttribute('aria-describedby', 'pause-description');
    pauseDialog.showModal();
    resumeFlightButton.focus({ preventScroll: true });
  },
  onResume: () => {
    root.classList.remove('flight-paused');
    setResumeLockStatus();
    if (pauseDialog.open) pauseDialog.close();
  },
  onFinish: (outcome, result) => {
    resumeCapturePending = false;
    setResumeLockStatus();
    const careerUpdate = careerProgress.recordMission({ ...result, outcome });
    renderMissionProgress();
    const note = document.querySelector('#debrief-career-note');
    const messages = [];
    if (careerUpdate.newRecord) messages.push(t('mission.debrief.newBest'));
    if (careerUpdate.unlocked.length) {
      const names = careerUpdate.unlocked.map(id => t(`mission.${id}.title`)).join(', ');
      messages.push(t('mission.debrief.unlocked', { missions: names }));
    }
    note.textContent = messages.join(' · ');
    note.hidden = messages.length === 0;
    root.classList.add('flight-paused');
    if (pauseDialog.open) pauseDialog.close();
    document.querySelector('#death-screen').hidden = true;
    if (!missionDebriefDialog.open) missionDebriefDialog.showModal();
    missionDebriefReturnButton.focus({ preventScroll: true });
  },
  onPrepareFailure: error => {
    console.error('Mission launch failed.', error);
    launchButton.disabled = false;
    menuDifficulty.disabled = false;
    launchButton.setAttribute('aria-busy', 'false');
    menuTheater.disabled = false;
    setLaunchProgress(0, 'launch.startFlight', 'launch.loadingFailed');
    setMenuStatus('launch.couldNotPrepare', 'error');
  },
});

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.04);
  if (!startMenu.hidden) menuRadar.update(dt);
  const combat = sortie.combat;
  if (sortie.started && !sortie.paused && combat) {
    const stressScenario = sortie.stressScenario;
    stressScenario?.recordFrame(performance.now());
    if (!combat.destroyed) {
      controls.update(dt);
      audio.updateEngine(controls.speed, Boolean(player.userData.boosting), dt);
      combat.update(dt);
      if (!sortie.paused) {
        stressScenario?.update(dt);
        combat.checkPlayerCollision(dt);
      }
    } else {
      combat.combatEffects.update(dt);
    }
    terrain.updateDetailPosition?.(player.position.x, player.position.z);
    activeAircraft.length = 0;
    activeMissiles.length = 0;
    if (!combat.destroyed) {
      activeAircraft.push(player);
      for (const unit of combat.enemies) if (!unit.dead) activeAircraft.push(unit.mesh);
      for (const unit of combat.allies) if (!unit.dead) activeAircraft.push(unit.mesh);
      for (const shot of combat.playerShots) if (shot.homing) activeMissiles.push(shot);
      for (const shot of combat.hostiles) if (shot.missile) activeMissiles.push(shot);
    }
    fx.update(dt, activeAircraft, activeMissiles, terrain, weather, camera);
    const verticalSpeed = dt > 0 ? (player.position.y - previousAltitude) / dt : 0;
    previousAltitude = player.position.y;
    hudReadoutElapsed += dt;
    if (hudReadoutElapsed >= HUD_READOUT_INTERVAL) {
      hudReadoutElapsed %= HUD_READOUT_INTERVAL;
      const speedText = Math.round(controls.speed * 1.943).toString();
      const altitude = Math.max(0, player.position.y - terrain.sampleHeight(player.position.x, player.position.z));
      const altitudeText = Math.round(altitude * 3.28).toLocaleString(getLanguage() === 'fi' ? 'fi-FI' : 'en-US');
      const headingText = String(Math.round(THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(controls.heading), 360))).padStart(3, '0');
      if (speedEl.textContent !== speedText) speedEl.textContent = speedText;
      if (altitudeEl.textContent !== altitudeText) altitudeEl.textContent = altitudeText;
      if (headingEl.textContent !== headingText) headingEl.textContent = headingText;
    }
    sortie.tacticalHud.update(controls, player, camera, combat.hudState, verticalSpeed, dt);
    if (gunReticle) {
      // Project the aircraft's real nose axis into the chase view; pitch/bank
      // heuristics can otherwise misalign the reticle from the cannon rounds.
      camera.updateMatrixWorld(true);
      const boresight = gunBoresightPoint.copy(player.position)
        .addScaledVector(controls.forward, 1000)
        .project(camera);
      const shiftX = THREE.MathUtils.clamp(boresight.x * innerWidth * 0.5, -innerWidth * 0.46, innerWidth * 0.46);
      const shiftY = THREE.MathUtils.clamp(-boresight.y * innerHeight * 0.5, -innerHeight * 0.44, innerHeight * 0.44);
      if (!hasGunReticleShift) {
        gunReticleShift.set(shiftX, shiftY);
        hasGunReticleShift = true;
      } else {
        // Smooth screen-space motion while keeping the reticle close to the
        // real boresight. Exponential damping feels consistent across FPS.
        const response = 1 - Math.exp(-12 * dt);
        gunReticleShift.x += (shiftX - gunReticleShift.x) * response;
        gunReticleShift.y += (shiftY - gunReticleShift.y) * response;
      }
      const aimShiftX = `${gunReticleShift.x}px`;
      const aimShiftY = `${gunReticleShift.y}px`;
      if (gunReticle.style.getPropertyValue('--aim-shift-x') !== aimShiftX) {
        gunReticle.style.setProperty('--aim-shift-x', aimShiftX);
      }
      if (gunReticle.style.getPropertyValue('--aim-shift-y') !== aimShiftY) {
        gunReticle.style.setProperty('--aim-shift-y', aimShiftY);
      }
    }
    // Let the cloud field drift across the camera slowly with the wind instead of locking it in place.
    clouds.position.x = player.position.x * 0.98 + weather.wind.x * clock.elapsedTime;
    clouds.position.z = player.position.z * 0.98 + weather.wind.z * clock.elapsedTime;
  }
  if (sortie.started || needsMenuRender) {
    sunEffects.update(camera);
    renderer.render(scene, camera);
    needsMenuRender = false;
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  needsMenuRender = true;
});
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('pagehide', event => {
  if(event.persisted)return;
  clearStartMenuHideTimer();
  sortie.dispose();
  fx.dispose();
  disposeMissilePool();
  disposeCombatEffectResources();
},{once:true});
animate();
void loadTerrainForMenu(initialAreaId);
void assets.ensureAircraftLoaded().catch((error) => {
  console.error('Combat aircraft assets failed to load; no placeholder aircraft will be shown.', error);
});
