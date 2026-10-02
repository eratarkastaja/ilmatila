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
import { CareerProgress } from './mission/progression.js';
import { SortieController } from './game/sortie-controller.js';
import { disposeMissilePool } from './combat/projectiles.js';
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
const careerProgress = new CareerProgress();
menuDifficulty.value = careerProgress.difficulty;
const urlParams = new URLSearchParams(location.search);
const stressMode = import.meta.env.DEV && urlParams.get('stress') === '1';
const areaAliases = new Map([['vironlahti', 'virolahti']]);
let selectedMissionId = Object.hasOwn(MISSIONS, urlParams.get('mission')) ? urlParams.get('mission') : 'patrol';
if (!careerProgress.isUnlocked(selectedMissionId)) selectedMissionId = 'patrol';
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
  selectedMissionId = id;
  menuRadar?.setMission(id);
  for (const card of missionCards) {
    const selected = card.dataset.mission === id;
    card.classList.toggle('selected', selected);
    card.setAttribute('aria-pressed', String(selected));
  }
  document.querySelector('#briefing-code').textContent = t(`mission.${id}.code`);
  document.querySelector('#briefing-copy').textContent = t(`mission.${id}.briefing`);
  document.querySelector('#theater-mission-name').textContent = t(`mission.${id}.title`).toUpperCase();
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
  sortie?.pause();
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

document.addEventListener('pointerlockchange', () => {
  // Escape releases pointer lock before the page receives its key event in
  // some browsers. Use that release to open pause immediately; the key handler
  // below also covers browsers that deliver the key event first.
  if (!sortie?.started || sortie.paused || !controls.enabled || controls.pointerLockActive) return;
  pauseFlight();
});

function resumeFlight() {
  sortie?.resume();
}

function resetPlayerAirframeVisuals() {
  Object.assign(player.userData, {
    airframeHealthRatio: 1,
    damageSmokeSeverity: 0,
    handlingFactor: 1,
    destroyed: false,
  });
}

function returnToMenu() {
  if (!sortie?.started) return;
  root.classList.remove('flight-active', 'flight-paused');
  if (pauseDialog.open) pauseDialog.close();
  if (missionDebriefDialog.open) missionDebriefDialog.close();
  sortie.dispose();
  if (stressMode) delete window.__ilmatilaStress;
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
  if (terrain.real) setMenuStatus('menu.statusAreaReady', 'ready', { area: terrain.label.toUpperCase() });
  else setMenuStatus('menu.statusTerrainError', 'warning');
  const nextUrl = new URL(location.href);
  nextUrl.searchParams.set('mission', selectedMissionId);
  nextUrl.searchParams.set('area', selectedAreaId);
  history.replaceState(null, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  needsMenuRender = true;
  launchButton.focus({ preventScroll: true });
}

resumeFlightButton.addEventListener('click', () => resumeFlight());
showFlightControlsButton.addEventListener('click', showPauseControls);
backToPauseButton.addEventListener('click', () => returnToPauseOptions());
quitToMenuButton.addEventListener('click', confirmMissionInterruption);
cancelQuitToMenuButton.addEventListener('click', () => returnToPauseOptions(true, quitToMenuButton));
confirmQuitToMenuButton.addEventListener('click', returnToMenu);
missionDebriefReturnButton.addEventListener('click', returnToMenu);
missionDebriefDialog.addEventListener('cancel', event => event.preventDefault());
pauseDialog.addEventListener('cancel', event => {
  // Escape is reserved for opening pause; use the visible controls to resume
  // so the browser can grant pointer lock from a direct click gesture.
  event.preventDefault();
});
document.addEventListener('keydown', event => {
  if (event.code !== 'Escape' || event.repeat || !sortie?.started || sortie.combat?.destroyed) return;
  if (missionDebriefDialog.open) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (sortie.paused) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  pauseFlight();
}, { capture: true });

launchButton.addEventListener('click', async () => {
  if (sortie?.started || sortie?.launchInProgress || launchButton.disabled) return;
  // Pointer lock must be requested directly in the launch-button gesture;
  // waiting for the asynchronous terrain/model loads loses browser activation.
  controls.requestMouseCapture();
  const selectedArea = theaterAreas.find(area => area.id === selectedAreaId) ?? theaterAreas[0];
  const prepared = await sortie.prepare({
    missionId: selectedMissionId,
    areaId: selectedArea.id,
    area: selectedArea,
    difficulty: careerProgress.difficulty,
  });
  if (prepared) sortie.start();
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
let hasGunReticleShift = false;
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
    fx.reset();
    resetPlayerAirframeVisuals();
  },
  onStart: () => {
    const nextUrl = new URL(location.href);
    nextUrl.searchParams.set('mission', selectedMissionId);
    nextUrl.searchParams.set('area', selectedAreaId);
    history.replaceState(null, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    if (stressMode) window.__ilmatilaStress = sortie.stressScenario;
    root.classList.add('flight-active');
    root.classList.remove('flight-paused');
    flightHud.hidden = false;
    setLaunchProgress(100, 'launch.flightReady', 'launch.enterCockpit');
    startMenu.classList.add('menu-leaving');
    setMenuStatus('launch.missionActive', 'active');
    setTimeout(() => { if (sortie.started) startMenu.hidden = true; }, 460);
  },
  onPause: () => {
    root.classList.add('flight-paused');
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
    if (pauseDialog.open) pauseDialog.close();
  },
  onFinish: (outcome, result) => {
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
    const altitude = Math.max(0, player.position.y - terrain.sampleHeight(player.position.x, player.position.z));
    const verticalSpeed = dt > 0 ? (player.position.y - previousAltitude) / dt : 0;
    previousAltitude = player.position.y;
    speedEl.textContent = Math.round(controls.speed * 1.943).toString();
    altitudeEl.textContent = Math.round(altitude * 3.28).toLocaleString(getLanguage() === 'fi' ? 'fi-FI' : 'en-US');
    headingEl.textContent = String(Math.round(THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(controls.heading), 360))).padStart(3, '0');
    sortie.tacticalHud.update(controls, player, camera, combat, verticalSpeed, dt);
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
      gunReticle.style.setProperty('--aim-shift-x', `${gunReticleShift.x}px`);
      gunReticle.style.setProperty('--aim-shift-y', `${gunReticleShift.y}px`);
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
