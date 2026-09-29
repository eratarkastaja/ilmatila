import * as THREE from 'three';
import { createFighter } from './plane.js';
import { AssetRepository } from './asset-repository.js';
import { makeClouds } from './clouds.js';
import { MenuRadar } from './menu-radar.js';
import { FlightControls } from './controls.js';
import { CombatWorld } from './combat.js';
import { createPreviewTerrain, disposeTerrain, TERRAIN_AREAS } from './terrain.js';
import { FlightFX } from './fx.js';
import { GameAudio } from './audio.js';
import { TacticalHud } from './hud.js';
import { SunEffects, SUN_DIRECTION } from './sun.js';
import { MISSIONS } from './missions.js';
import { getLanguage, initializeLanguagePicker, t } from './i18n.js';
import './style.css';
import './hud.css';
import './menu.css';

const root = document.querySelector('#game');
const startMenu = document.querySelector('#start-menu');
const flightHud = document.querySelector('#flight-hud');
const menuStatus = document.querySelector('#menu-status');
const menuTheater = document.querySelector('#menu-theater');
const launchButton = document.querySelector('#launch-mission');
const launchProgress = document.querySelector('#launch-progress');
const launchProgressFill = document.querySelector('#launch-progress-fill');
const launchProgressStatus = document.querySelector('#launch-progress-status');
const launchProgressTitle = document.querySelector('#launch-progress-title');
const audio = new GameAudio();
initializeLanguagePicker();
const missionCards = [...document.querySelectorAll('[data-mission]')];
const urlParams = new URLSearchParams(location.search);
const areaAliases = new Map([['vironlahti', 'virolahti']]);
let selectedMissionId = Object.hasOwn(MISSIONS, urlParams.get('mission')) ? urlParams.get('mission') : 'intercept';
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
scene.background = new THREE.Color('#8fa9b7');
scene.fog = new THREE.FogExp2('#9baeb4', 0.00016);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 22000);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
root.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xc5e0eb, 0x343b36, 2.2));
const sun = new THREE.DirectionalLight(0xffedcf, 3.2);
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
controls.enabled = false;
const fx = new FlightFX(scene);
const weather = {
  // Moist, cloudy air makes long contrails visible once aircraft climb above 5.2 km AGL.
  humidity: 0.78,
  cloudCoverage: 0.62,
  contrailBaseAltitude: 5200,
  contrailFullAltitude: 6800,
  wind: new THREE.Vector3(5, 0.15, -3),
};
let combat = null;
let tacticalHud = null;
let gameStarted = false;
let gamePaused = false;
let launchInProgress = false;
let aircraftAsset = null;
let menuStatusDescriptor = { key: 'menu.statusReady', params: {}, state: 'ready' };
let launchProgressDescriptor = { progress: 0, titleKey: 'menu.launchButton', detailKey: 'menu.launchReadyStatus', params: {} };
document.addEventListener('ilmatila:languagechange', () => {
  selectMission(selectedMissionId);
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

function ensureTerrainLoaded(areaId, onProgress, signal) {
  if (terrain.real && terrain.id === areaId) {
    onProgress?.(1, { key: 'terrain.ready' });
    return Promise.resolve(terrain);
  }
  return assets.ensureTerrainLoaded(areaId, onProgress, signal);
}

function selectMission(id) {
  if (!Object.hasOwn(MISSIONS, id)) return;
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
  if (!requestedArea || gameStarted) return;
  if (requestedId === loadedAreaId) {
    if (!launchInProgress && terrain.real) {
      setMenuStatus('menu.statusAreaReady', 'ready', { area: terrain.label.toUpperCase() });
    }
    return;
  }
  const controller = new AbortController();
  menuTerrainController = controller;
  if (!launchInProgress) setMenuStatus('menu.statusAreaLoading', 'loading', { area: requestedArea.label.toUpperCase() });
  try {
    const replacement = await ensureTerrainLoaded(requestedId, null, controller.signal);
    if (requestId !== terrainRequest || gameStarted) {
      if (replacement !== terrain) disposeTerrain(replacement);
      return;
    }
    installTerrain(replacement);
    loadedAreaId = replacement.id;
    needsMenuRender = true;
    updateMenuArea(terrain);
    if (!launchInProgress) setMenuStatus('menu.statusAreaReady', 'ready', { area: terrain.label.toUpperCase() });
  } catch (error) {
    if (controller.signal.aborted) return;
    console.error('Theater terrain failed to load.', error);
    if (requestId === terrainRequest && !gameStarted && !launchInProgress) {
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

for (const card of missionCards) card.addEventListener('click', () => selectMission(card.dataset.mission));

const creditsDialog = document.querySelector('#credits-dialog');
const pauseDialog = document.querySelector('#pause-dialog');
const resumeFlightButton = document.querySelector('#resume-flight');
const quitToMenuButton = document.querySelector('#quit-to-menu');
document.querySelector('#open-credits').addEventListener('click', () => creditsDialog.showModal());
document.querySelector('#close-credits').addEventListener('click', () => creditsDialog.close());
document.querySelector('#credits-back').addEventListener('click', () => creditsDialog.close());
creditsDialog.addEventListener('click', event => {
  if (event.target === creditsDialog) creditsDialog.close();
});

function pauseFlight() {
  if (!gameStarted || gamePaused || !combat || combat.destroyed) return;
  gamePaused = true;
  controls.enabled = false;
  controls.keys.clear();
  combat.clearInput();
  audio.setPaused(true);
  pauseDialog.showModal();
  resumeFlightButton.focus({ preventScroll: true });
}

function resumeFlight() {
  if (!gamePaused) return;
  gamePaused = false;
  if (pauseDialog.open) pauseDialog.close();
  controls.keys.clear();
  combat?.clearInput();
  controls.enabled = true;
  audio.setPaused(false);
}

function returnToMenu() {
  if (!gameStarted) return;
  gamePaused = false;
  if (pauseDialog.open) pauseDialog.close();
  audio.setPaused(false);
  audio.setGunFiring(false);
  audio.stopEngine(true);
  combat?.dispose();
  combat = null;
  tacticalHud = null;
  controls.enabled = false;
  controls.keys.clear();
  controls.speed = 235;
  controls.pitch = 0;
  controls.roll = 0;
  controls.heading = 0;
  controls.elapsed = 0;
  controls.bankReferenceValid = true;
  player.position.set(0, 70, 0);
  player.quaternion.identity();
  player.userData.boosting = false;
  if (player.userData.afterburner) player.userData.afterburner.visible = false;
  controls.updateAttitude();
  camera.position.set(0, 75, -22);
  camera.lookAt(0, 70, 30);
  clouds.position.set(0, 0, 0);
  fx.reset();
  previousAltitude = player.position.y;
  gameStarted = false;
  flightHud.hidden = true;
  document.querySelector('#death-screen').hidden = true;
  startMenu.hidden = false;
  startMenu.classList.remove('menu-leaving');
  launchInProgress = false;
  launchButton.disabled = false;
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

resumeFlightButton.addEventListener('click', resumeFlight);
quitToMenuButton.addEventListener('click', returnToMenu);
pauseDialog.addEventListener('cancel', event => {
  event.preventDefault();
  resumeFlight();
});
document.addEventListener('keydown', event => {
  if (event.code !== 'Escape' || event.repeat || !gameStarted || combat?.destroyed) return;
  event.preventDefault();
  event.stopPropagation();
  if (gamePaused) resumeFlight();
  else pauseFlight();
}, { capture: true });

launchButton.addEventListener('click', async () => {
  if (gameStarted || launchInProgress || launchButton.disabled) return;
  const supersededMenuTerrain = menuTerrainController;
  terrainRequest++;
  menuTerrainController = null;
  launchInProgress = true;
  launchButton.disabled = true;
  launchButton.setAttribute('aria-busy', 'true');
  menuTheater.disabled = true;

  const selectedArea = theaterAreas.find(area => area.id === selectedAreaId) ?? theaterAreas[0];
  let aircraftProgress = aircraftAsset ? 1 : assets.aircraftProgress;
  let terrainProgress = terrain.real && terrain.id === selectedAreaId ? 1 : 0;
  let terrainDetail = terrainProgress ? { key: 'terrain.ready' } : { key: 'launch.terrainWaiting' };
  let usingPreviewTerrain = false;
  const updateProgress = () => {
    const percent = 5 + aircraftProgress * 27 + terrainProgress * 63;
    const aircraftText = aircraftProgress >= 1
      ? { key: 'launch.aircraftReady' }
      : { key: 'launch.aircraftProgress', params: { percent: Math.round(aircraftProgress * 100) } };
    const titleKey = aircraftProgress < 1 ? 'launch.loadingAircraft'
      : terrainProgress < 1 ? 'launch.loadingTerrain'
        : 'launch.preparingFlight';
    setLaunchProgress(percent, titleKey, 'launch.progressSummary', { aircraft: aircraftText, terrain: terrainDetail });
  };

  updateProgress();
  setMenuStatus('menu.statusPreparingArea', 'loading', { area: selectedArea.label.toUpperCase() });
  const terrainLoadController = new AbortController();
  const aircraftLoadController = new AbortController();
  let pendingTerrain = null;
  let launchFailed = false;
  try {
    const terrainRequestPromise = ensureTerrainLoaded(selectedAreaId, (progress, detail) => {
      terrainProgress = progress;
      terrainDetail = detail;
      updateProgress();
    }, terrainLoadController.signal);
    const terrainPromise = withTimeout(
      terrainRequestPromise,
      25000,
      'Terrain data load timed out',
      () => terrainLoadController.abort(),
    ).then(
      value => ({ status: 'ready', value }),
      error => ({ status: 'fallback', error }),
    );
    // Register the launch as a subscriber before aborting a stale menu load.
    supersededMenuTerrain?.abort();
    void terrainRequestPromise.then(replacement => {
      if (launchFailed || usingPreviewTerrain) {
        if (replacement !== terrain) disposeTerrain(replacement);
      } else {
        pendingTerrain = replacement;
      }
    }, () => {});
    const aircraftPromise = withTimeout(
      assets.ensureAircraftLoaded(progress => {
        aircraftProgress = progress;
        updateProgress();
      }, aircraftLoadController.signal),
      25000,
      'Aircraft model load timed out',
      () => aircraftLoadController.abort(),
    );
    const [terrainResult, asset] = await Promise.all([terrainPromise, aircraftPromise]);

    if (terrainResult.status === 'ready') {
      const replacement = terrainResult.value;
      installTerrain(replacement);
      pendingTerrain = null;
      loadedAreaId = replacement.id;
      updateMenuArea(replacement);
      terrainProgress = 1;
    } else {
      terrainProgress = 1;
      usingPreviewTerrain = true;
      terrainDetail = { key: 'terrain.preview' };
      console.warn('Selected terrain unavailable; launching with preview terrain.', terrainResult.error);
      if (pendingTerrain && pendingTerrain !== terrain) disposeTerrain(pendingTerrain);
      pendingTerrain = null;
      installTerrain(createPreviewTerrain());
      loadedAreaId = terrain.id;
      updateMenuArea(terrain);
      document.querySelector('#area-name').textContent = t('terrain.previewAreaName').toUpperCase();
    }

    setLaunchProgress(96,
      usingPreviewTerrain ? 'launch.terrainUnavailable' : 'launch.buildingMission',
      usingPreviewTerrain ? 'launch.previewStarting' : 'launch.systemsStarting');
    setMenuStatus(usingPreviewTerrain ? 'launch.previewFinishing' : 'launch.finalizingArea', usingPreviewTerrain ? 'warning' : 'loading');
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

    const nextCombat = new CombatWorld(scene, player, terrain, fx, asset, MISSIONS[selectedMissionId], audio);
    const nextHud = new TacticalHud();
    const nextUrl = new URL(location.href);
    nextUrl.searchParams.set('mission', selectedMissionId);
    nextUrl.searchParams.set('area', selectedAreaId);
    history.replaceState(null, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);

    combat = nextCombat;
    tacticalHud = nextHud;
    gameStarted = true;
    launchInProgress = false;
    controls.enabled = true;
    audio.startEngine();
    flightHud.hidden = false;
    setLaunchProgress(100, 'launch.flightReady', 'launch.enterCockpit');
    startMenu.classList.add('menu-leaving');
    setMenuStatus('launch.missionActive', 'active');
    setTimeout(() => { if (gameStarted) startMenu.hidden = true; }, 460);
  } catch (error) {
    console.error('Mission launch failed.', error);
    launchFailed = true;
    if (pendingTerrain && pendingTerrain !== terrain) disposeTerrain(pendingTerrain);
    terrainLoadController.abort();
    aircraftLoadController.abort();
    launchInProgress = false;
    launchButton.disabled = false;
    launchButton.setAttribute('aria-busy', 'false');
    menuTheater.disabled = false;
    setLaunchProgress(0, 'launch.startFlight', 'launch.loadingFailed');
    setMenuStatus('launch.couldNotPrepare', 'error');
  }
});

const clock = new THREE.Clock();
const speedEl = document.querySelector('#speed');
const altitudeEl = document.querySelector('#altitude');
const headingEl = document.querySelector('#heading');
const gunReticle = document.querySelector('.crosshair');
let previousAltitude = player.position.y;
let needsMenuRender = true;
const assets = new AssetRepository({
  onAircraftLoaded: aircraftAssets => {
    const aircraftVisual = createFighter({ aircraftAsset: aircraftAssets.player });
    for (const child of [...aircraftVisual.children]) player.add(child);
    Object.assign(player.userData, aircraftVisual.userData);
    aircraftAsset = aircraftAssets;
    needsMenuRender = true;
  },
});
menuRadar = new MenuRadar({
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  missionId: selectedMissionId,
});

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.04);
  if (!startMenu.hidden) menuRadar.update(dt);
  if (gameStarted && !gamePaused && combat) {
    if (!combat.destroyed) {
      controls.update(dt);
      audio.updateEngine(controls.speed, Boolean(player.userData.boosting), dt);
      combat.update(dt);
      combat.checkPlayerCollision(dt);
    } else {
      combat.updateEffects(dt);
    }
    const activeAircraft = combat.destroyed ? [] : [
      player,
      ...combat.enemies.filter(unit => !unit.dead).map(unit => unit.mesh),
      ...combat.allies.filter(unit => !unit.dead).map(unit => unit.mesh),
    ];
    const activeMissiles = combat.destroyed ? [] : [
      ...combat.playerShots.filter(shot => shot.homing),
      ...combat.hostiles.filter(shot => shot.missile),
    ];
    fx.update(dt, activeAircraft, activeMissiles, terrain, weather, camera);
    const altitude = Math.max(0, player.position.y - terrain.sampleHeight(player.position.x, player.position.z));
    const verticalSpeed = dt > 0 ? (player.position.y - previousAltitude) / dt : 0;
    previousAltitude = player.position.y;
    speedEl.textContent = Math.round(controls.speed * 1.943).toString();
    altitudeEl.textContent = Math.round(altitude * 3.28).toLocaleString(getLanguage() === 'fi' ? 'fi-FI' : 'en-US');
    headingEl.textContent = String(Math.round(THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(controls.heading), 360))).padStart(3, '0');
    tacticalHud.update(controls, player, camera, combat, verticalSpeed, dt);
    if (gunReticle) {
      const bankCue = THREE.MathUtils.clamp(Math.sin(controls.roll) * innerHeight * 0.02, -24, 24);
      const pitchCue = THREE.MathUtils.clamp(controls.pitch * innerHeight * 0.012, -18, 18);
      gunReticle.style.setProperty('--aim-shift-x', `${bankCue}px`);
      gunReticle.style.setProperty('--aim-shift-y', `${pitchCue}px`);
    }
    // Let the cloud field drift across the camera slowly with the wind instead of locking it in place.
    clouds.position.x = player.position.x * 0.98 + weather.wind.x * clock.elapsedTime;
    clouds.position.z = player.position.z * 0.98 + weather.wind.z * clock.elapsedTime;
  }
  if (gameStarted || needsMenuRender) {
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
animate();
void loadTerrainForMenu(initialAreaId);
void assets.ensureAircraftLoaded().catch((error) => {
  console.error('Combat aircraft assets failed to load; no placeholder aircraft will be shown.', error);
});
