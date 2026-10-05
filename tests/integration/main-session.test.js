import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import packageMetadata from '../../package.json';

const harness = vi.hoisted(() => ({
  worlds: [],
  assets: null,
  controls: null,
  audio: null,
  terrainLoader: null,
  terrainCalls: [],
  disposedTerrains: [],
  raf: [],
  resumeOrder: [],
}));

vi.mock('three', async importOriginal => {
  const THREE = await importOriginal();
  return {
    ...THREE,
    WebGLRenderer: class {
      constructor() {
        this.domElement = new MockElement();
        this.capabilities = { getMaxAnisotropy: () => 8 };
      }
      setPixelRatio() {}
      setSize() {}
      render() {}
    },
  };
});

vi.mock('../../src/aircraft/plane.js', async importOriginal => {
  const original = await importOriginal();
  return { ...original };
});

vi.mock('../../src/assets/asset-repository.js', () => ({
  AssetRepository: class {
    constructor(options) {
      this.options = options;
      this.aircraftProgress = 0;
      harness.assets = this;
    }
    ensureAircraftLoaded() {
      if (this.aircraftError) return Promise.reject(this.aircraftError);
      return Promise.resolve({ id: 'aircraft-assets' });
    }
    ensureTerrainLoaded(areaId, onProgress, signal) {
      harness.terrainCalls.push({ areaId, signal });
      if (harness.terrainLoader) return harness.terrainLoader(areaId, onProgress, signal);
      if (this.terrainError) return Promise.reject(this.terrainError);
      return Promise.resolve(makeTerrain(areaId));
    }
  },
}));

vi.mock('../../src/environment/terrain.js', async importOriginal => {
  const THREE = await import('three');
  const original = await importOriginal();
  return {
    ...original,
    createPreviewTerrain: () => makeTerrain('preview', THREE),
    disposeTerrain: terrain => harness.disposedTerrains.push(terrain),
    TERRAIN_AREAS: [
      { id: 'paijanne', label: 'Päijänne' },
      { id: 'virolahti', label: 'Virolahti' },
      { id: 'keitele', label: 'Keitele' },
    ],
  };
});

vi.mock('../../src/environment/clouds.js', async () => {
  const THREE = await import('three');
  return { makeClouds: () => new THREE.Group() };
});

vi.mock('../../src/ui/menu-radar.js', () => ({
  MenuRadar: class { setScenario() {} update() {} },
}));

vi.mock('../../src/input/controls.js', () => ({
  FlightControls: class {
    constructor(plane, camera, canvas) {
      this.enabled = false;
      this.canvas = canvas;
      this.keys = new Set();
      this.speed = 235;
      this.pitch = this.roll = this.heading = this.elapsed = 0;
      this.bankReferenceValid = true;
      canvas.addEventListener('pointerdown', event => {
        if (!this.enabled || globalThis.document.pointerLockElement === canvas || event.pointerType !== 'mouse') return;
        this.requestMouseCapture();
      });
      harness.controls = this;
    }
    setEnabled(enabled) {
      this.enabled = enabled;
      if (!enabled && globalThis.document.pointerLockElement === this.canvas) {
        globalThis.document.pointerLockElement = null;
        globalThis.document.dispatchEvent(new Event('pointerlockchange'));
      }
    }
    requestMouseCapture() {
      harness.resumeOrder.push('pointer-lock');
      this.pauseDialogOpenAtCapture = globalThis.document.querySelector('#pause-dialog').open;
      this.documentGestureReceivedAtRequest = globalThis.document.clickGestureReceived;
      const captureResult = this.capturePromise ?? Promise.resolve(this.captureResult ?? true);
      return Promise.resolve(captureResult).then(locked => {
        if (locked) {
          globalThis.document.pointerLockElement = this.canvas;
          globalThis.document.dispatchEvent(new Event('pointerlockchange'));
        } else {
          globalThis.document.dispatchEvent(new Event('pointerlockerror'));
        }
        return locked;
      });
    }
    resetMouseAim() {}
    resetCameraZoom() {}
    updateAttitude() {}
    update() {}
  },
}));

vi.mock('../../src/combat/world.js', () => ({
  CombatWorld: class {
    constructor(scene, player, terrain, fx, aircraftAsset, mission, audio, onMissionEnd, _difficulty, _inputTarget, seed) {
      Object.assign(this, { scene, player, terrain, fx, aircraftAsset, mission, audio, onMissionEnd, seed });
      this.destroyed = false;
      this.enemies = [];
      this.allies = [];
      this.playerShots = [];
      this.hostiles = [];
      this.setTelemetry = vi.fn();
      this.dispose = vi.fn(() => { this.destroyed = true; });
      this.clearInput = vi.fn();
      this.checkPlayerCollision = vi.fn();
      this.update = vi.fn();
      this.updateEffects = vi.fn();
      harness.worlds.push(this);
    }
  },
  disposeCombatEffectResources: vi.fn(),
}));

vi.mock('../../src/effects/fx.js', () => ({
  FlightFX: class { reset() {} update() {} dispose() {} },
}));

vi.mock('../../src/audio/audio.js', () => ({
  GameAudio: class {
    constructor() {
      this.setPaused = vi.fn(paused => harness.resumeOrder.push(paused ? 'audio-pause' : 'audio-resume'));
      this.setGunFiring = vi.fn();
      this.stopEngine = vi.fn();
      this.startEngine = vi.fn();
      this.updateEngine = vi.fn();
      harness.audio = this;
    }
  },
}));

vi.mock('../../src/ui/hud.js', () => ({ TacticalHud: class { update() {} } }));
vi.mock('../../src/environment/sun.js', async () => {
  const THREE = await import('three');
  return {
    SUN_DIRECTION: new THREE.Vector3(1, 1, 1),
    SunEffects: class { update() {} },
  };
});
vi.mock('../../src/performance/stress-scenario.js', () => ({ CombatStressScenario: class {} }));
vi.mock('../../src/combat/projectiles.js', () => ({ disposeMissilePool: vi.fn() }));

class MockElement {
  constructor() {
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.value = '';
    this.textContent = '';
    this.dataset = {};
    this.style = { setProperty() {} };
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.options = [];
    this.classList = {
      values: new Set(),
      add: (...names) => names.forEach(name => this.classList.values.add(name)),
      remove: (...names) => names.forEach(name => this.classList.values.delete(name)),
      contains: name => this.classList.values.has(name),
      toggle: (name, force) => {
        const enabled = force ?? !this.classList.values.has(name);
        if (enabled) this.classList.values.add(name);
        else this.classList.values.delete(name);
        return enabled;
      },
    };
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type, event = {}) {
    const dispatchedEvent = { target: this, ...event };
    for (const listener of this.listeners.get(type) ?? []) listener(dispatchedEvent);
    if (type === 'click' && this !== globalThis.document) {
      globalThis.document.clickGestureReceived = true;
      for (const listener of globalThis.document.listenerRegistry.get(type) ?? []) listener(dispatchedEvent);
    }
  }
  append(...children) {
    this.children.push(...children);
    if (children[0]?.value !== undefined) this.options.push(...children);
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  cloneNode() { return new MockElement(); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  querySelector(selector) { return document.querySelector(`${selector}@${this.id ?? ''}`); }
  closest() { return new MockElement(); }
  focus() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function makeTerrain(id, THREE = globalThis.THREE_FOR_TESTS) {
  return {
    id,
    label: id,
    real: id !== 'preview',
    metadata: {},
    mesh: new THREE.Group(),
    sampleHeight: () => 0,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function createDocument() {
  class MockDocument extends EventTarget {
    constructor() {
      super();
      this.elements = new Map();
      this.listenerRegistry = new Map();
      this.documentElement = { lang: '' };
      this.title = '';
    }
    addEventListener(type, listener, options) {
      const listeners = this.listenerRegistry.get(type) ?? new Set();
      listeners.add(listener);
      this.listenerRegistry.set(type, listeners);
      super.addEventListener(type, listener, options);
    }
    removeEventListener(type, listener, options) {
      this.listenerRegistry.get(type)?.delete(listener);
      super.removeEventListener(type, listener, options);
    }
    querySelector(selector) {
      if (selector === '#menu-controls-dialog .menu-control-grid' || selector === '#menu-controls-dialog .menu-lock-instruction') {
        if (!this.elements.has(selector)) this.elements.set(selector, new MockElement());
        return this.elements.get(selector);
      }
      const id = selector.startsWith('#') ? selector.slice(1) : selector;
      if (!this.elements.has(id)) this.elements.set(id, new MockElement());
      return this.elements.get(id);
    }
    querySelectorAll(selector) {
      if (selector !== '[data-mission]') return [];
      return ['patrol', 'training', 'intercept', 'support'].map(id => {
        const card = new MockElement();
        card.dataset.mission = id;
        card.querySelector = query => query === '[data-mission-state]' ? new MockElement() : null;
        return card;
      });
    }
    createElement() { return new MockElement(); }
    createTextNode(text) { return { textContent: text }; }
  }
  return new MockDocument();
}

let documentMock;
let windowMock;

async function loadMain(missionId = 'training', { quickStartSeen = true } = {}) {
  vi.resetModules();
  const THREE = await import('three');
  globalThis.THREE_FOR_TESTS = THREE;
  documentMock = createDocument();
  windowMock = new EventTarget();
  globalThis.document = documentMock;
  globalThis.window = windowMock;
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 720;
  globalThis.devicePixelRatio = 1;
  globalThis.location = {
    href: `http://localhost/?mission=${missionId}&area=paijanne`,
    search: `?mission=${missionId}&area=paijanne`,
  };
  globalThis.history = { replaceState: vi.fn() };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.addEventListener = windowMock.addEventListener.bind(windowMock);
  globalThis.requestAnimationFrame = callback => {
    harness.raf.push(callback);
    return harness.raf.length;
  };
  const storage = new Map();
  if (quickStartSeen) storage.set('ilmatila.quick-start-seen', 'true');
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  await import('../../src/main.js');
  return documentMock;
}

async function launch(document) {
  const expectedWorldCount = harness.worlds.length + 1;
  document.querySelector('#launch-mission').dispatch('click');
  await completeTriggeredLaunch(document, expectedWorldCount);
}

async function completeTriggeredLaunch(document, expectedWorldCount) {
  await vi.waitFor(() => expect(harness.raf.length).toBeGreaterThan(1));
  harness.raf.pop()(0);
  await vi.waitFor(() => {
    expect(harness.worlds).toHaveLength(expectedWorldCount);
    expect(document.querySelector('#game').classList.contains('flight-active')).toBe(true);
  });
}

async function returnToMenuFromFlight(document) {
  pressPauseKey(document);
  document.querySelector('#quit-to-menu').dispatch('click');
  document.querySelector('#confirm-quit-to-menu').dispatch('click');
  expect(document.querySelector('#start-menu').hidden).toBe(false);
}

function pressKey(document, code) {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'code', { value: code });
  document.dispatchEvent(event);
  return event;
}

function pressPauseKey(document) {
  pressKey(document, 'KeyP');
}

describe('main game session lifecycle', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    harness.worlds.length = 0;
    harness.terrainLoader = null;
    harness.terrainCalls.length = 0;
    harness.disposedTerrains.length = 0;
    harness.raf.length = 0;
    harness.resumeOrder.length = 0;
  });

  it('opens the menu flight controls in a modal instead of expanding the launch page', async () => {
    const document = await loadMain();
    const menu = document.querySelector('#start-menu');
    const controlsDialog = document.querySelector('#menu-controls-dialog');

    document.querySelector('#show-menu-controls').dispatch('click');

    expect(controlsDialog.open).toBe(true);
    expect(menu.hidden).toBe(false);

    document.querySelector('#close-menu-controls').dispatch('click');

    expect(controlsDialog.open).toBe(false);
    expect(menu.hidden).toBe(false);
  });

  it('starts Training directly from the first-visit Quick Start', async () => {
    const document = await loadMain('patrol', { quickStartSeen: false });
    const quickStart = document.querySelector('#quick-start-dialog');

    expect(quickStart.open).toBe(true);
    const expectedWorldCount = harness.worlds.length + 1;
    document.querySelector('#quick-start-training').dispatch('click');
    await completeTriggeredLaunch(document, expectedWorldCount);

    const { MISSIONS } = await import('../../src/mission/missions.js');
    expect(harness.worlds.at(-1).mission).toBe(MISSIONS.training);
    expect(quickStart.open).toBe(false);
  });

  it('completes a sortie, saves career progress, returns to menu, and launches again cleanly', async () => {
    const document = await loadMain();
    const window = globalThis.window;
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    expect(document.querySelector('#menu-version').textContent).toBe(packageMetadata.version);
    await launch(document);
    const firstWorld = harness.worlds[0];
    const menuHideTimerCall = setTimeoutSpy.mock.calls.findLastIndex(([, delay]) => delay === 460);
    expect(menuHideTimerCall).toBeGreaterThanOrEqual(0);
    const firstMenuHideTimer = setTimeoutSpy.mock.results[menuHideTimerCall].value;
    expect(window.__ilmatilaTelemetry).toBeTruthy();

    expect(document.querySelector('#flight-hud').hidden).toBe(false);
    expect(document.querySelector('#game').classList.contains('flight-active')).toBe(true);
    expect(harness.controls.enabled).toBe(true);
    expect(harness.audio.startEngine).toHaveBeenCalledOnce();

    firstWorld.onMissionEnd('complete', {
      missionId: 'training', difficulty: 'standard', score: 1250, accuracy: 0.8,
      damageTaken: 0, missionTime: 90, outcome: 'complete',
    });
    const { CareerProgress } = await import('../../src/mission/progression.js');
    const savedCareerProgress = new CareerProgress(globalThis.localStorage);
    expect(savedCareerProgress.getBest('training')).toMatchObject({ score: 1250, completed: true });
    expect(document.querySelector('#mission-debrief').open).toBe(true);

    document.querySelector('#mission-debrief-return').dispatch('click');
    expect(firstWorld.dispose).toHaveBeenCalledOnce();
    expect(document.querySelector('#mission-debrief').open).toBe(false);
    expect(document.querySelector('#start-menu').hidden).toBe(false);
    expect(document.querySelector('#game').classList.contains('flight-active')).toBe(false);
    expect(harness.controls.enabled).toBe(false);
    expect(document.pointerLockElement).toBe(null);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(firstMenuHideTimer);
    expect(window.__ilmatilaTelemetry).toBeUndefined();

    await launch(document);
    expect(harness.worlds).toHaveLength(2);
    expect(harness.worlds[1]).not.toBe(firstWorld);
    expect(harness.worlds[1].mission).toBeTruthy();
    expect(harness.audio.startEngine).toHaveBeenCalledTimes(2);
    expect(document.querySelector('#flight-hud').hidden).toBe(false);
    expect(document.listenerRegistry.get('keydown').size).toBe(1);
    expect(document.listenerRegistry.get('ilmatila:languagechange').size).toBe(1);

    for (let sortieIndex = 1; sortieIndex < 10; sortieIndex++) {
      const world = harness.worlds[sortieIndex];
      world.onMissionEnd('complete', {
        missionId: 'training', difficulty: 'standard', score: 1250, accuracy: 0.8,
        damageTaken: 0, missionTime: 90, outcome: 'complete',
      });
      expect(document.querySelector('#mission-debrief').open).toBe(true);
      document.querySelector('#mission-debrief-return').dispatch('click');
      expect(world.dispose).toHaveBeenCalledOnce();
      expect(document.pointerLockElement).toBe(null);
      expect(document.querySelector('#start-menu').hidden).toBe(false);
      expect(window.__ilmatilaTelemetry).toBeUndefined();
      expect(document.listenerRegistry.get('keydown').size).toBe(1);
      expect(document.listenerRegistry.get('ilmatila:languagechange').size).toBe(1);
      if (sortieIndex < 9) await launch(document);
    }

    expect(harness.worlds).toHaveLength(10);
    expect(new Set(harness.worlds).size).toBe(10);
    expect(harness.worlds[9]).not.toBe(firstWorld);
    expect(harness.worlds.every(world => world.dispose.mock.calls.length === 1)).toBe(true);
    expect(harness.audio.startEngine).toHaveBeenCalledTimes(10);
  });

  it('does not start a prepared sortie unless launch pointer lock is confirmed', async () => {
    const document = await loadMain();
    harness.controls.captureResult = false;
    const launchButton = document.querySelector('#launch-mission');

    launchButton.dispatch('click');
    expect(launchButton.disabled).toBe(true);
    await vi.waitFor(() => expect(harness.raf.length).toBeGreaterThan(1));
    harness.raf.pop()(0);
    await vi.waitFor(() => expect(launchButton.disabled).toBe(false));

    expect(document.querySelector('#game').classList.contains('flight-active')).toBe(false);
    expect(harness.controls.enabled).toBe(false);
    expect(document.querySelector('#start-menu').hidden).toBe(false);
    expect(harness.worlds[0].dispose).toHaveBeenCalledOnce();
  });

  it('shows the objectives and variant selected by the seed passed into the sortie', async () => {
    const document = await loadMain();
    await launch(document);
    const { MISSIONS } = await import('../../src/mission/missions.js');
    const { resolveMissionVariant } = await import('../../src/mission/mission-variants.js');
    const { t } = await import('../../src/ui/i18n.js');
    const world = harness.worlds[0];
    const resolution = resolveMissionVariant(MISSIONS.training, world.seed);
    const variantNode = document.querySelector('#briefing-variant');

    expect(variantNode.hidden).toBe(false);
    expect(variantNode.textContent).toBe(t('mission.briefing.variant', {
      name: t(resolution.variant.labelKey),
    }));
    const rows = document.querySelector('#briefing-optional-objective-list').children;
    expect(rows).toHaveLength(resolution.mission.optionalObjectives.length);
    const timeObjective = resolution.mission.optionalObjectives.find(objective => objective.id === 'time-limit');
    const timeDescription = rows[resolution.mission.optionalObjectives.indexOf(timeObjective)]
      .children[0].children[1].textContent;
    expect(timeDescription).toContain(String(timeObjective.limitSeconds));

    const variantBeforeLanguageChange = variantNode.textContent;
    document.dispatchEvent(new Event('ilmatila:languagechange'));
    expect(variantNode.textContent).toBe(variantBeforeLanguageChange);
    expect(harness.worlds[0].seed).toBe(world.seed);
  });

  it('shows a missile reserve objective that fits the selected difficulty loadout', async () => {
    const document = await loadMain('patrol');
    const difficulty = document.querySelector('#menu-difficulty');
    difficulty.value = 'hard';
    difficulty.dispatch('change');

    const missileObjective = [...document.querySelector('#briefing-optional-objective-list').children]
      .find(row => row.children[0].children[0].textContent === 'SAVE GUIDED MISSILES');

    expect(missileObjective.children[0].children[1].textContent).toMatch(/(?:9|10) guided missiles/);
  });

  it('resumes with one click after an application pause releases pointer lock programmatically', async () => {
    const document = await loadMain();
    await launch(document);

    pressPauseKey(document);
    expect(document.querySelector('#pause-dialog').open).toBe(true);
    expect(document.pointerLockElement).toBe(null);
    harness.resumeOrder.length = 0;

    const resumeButton = document.querySelector('#resume-flight');
    resumeButton.dispatch('click', { detail: 1 });

    await vi.waitFor(() => expect(harness.controls.enabled).toBe(true));
    expect(harness.controls.enabled).toBe(true);
    expect(document.querySelector('#pause-dialog').open).toBe(false);
    expect(harness.controls.pauseDialogOpenAtCapture).toBe(true);
    expect(harness.controls.documentGestureReceivedAtRequest).toBe(true);
    expect(harness.resumeOrder).toEqual(['pointer-lock', 'audio-resume']);
  });

  it('lets Escape release only the mouse and recaptures it on a canvas click', async () => {
    const document = await loadMain();
    await launch(document);
    document.exitPointerLock = vi.fn(() => {
      document.pointerLockElement = null;
      document.dispatchEvent(new Event('pointerlockchange'));
    });
    const escapeEvent = pressKey(document, 'Escape');
    expect(escapeEvent.defaultPrevented).toBe(false);
    expect(document.exitPointerLock).toHaveBeenCalledOnce();

    expect(document.querySelector('#pause-dialog').open).toBe(false);
    expect(document.querySelector('#game').classList.contains('flight-active')).toBe(true);
    expect(document.querySelector('#game').classList.contains('flight-paused')).toBe(false);
    expect(harness.controls.enabled).toBe(true);
    expect(document.querySelector('#resume-lock-status').hidden).toBe(true);
    expect(harness.audio.setPaused).not.toHaveBeenCalledWith(true);

    harness.controls.canvas.dispatch('pointerdown', { pointerType: 'mouse' });
    await vi.waitFor(() => expect(document.pointerLockElement).toBe(harness.controls.canvas));
    expect(document.querySelector('#pause-dialog').open).toBe(false);
    expect(harness.controls.enabled).toBe(true);
    expect(harness.audio.setPaused).not.toHaveBeenCalledWith(true);
  });

  it('uses one P press to pause and another to capture the mouse and resume', async () => {
    const document = await loadMain();
    await launch(document);
    harness.resumeOrder.length = 0;

    const pauseEvent = pressKey(document, 'KeyP');
    expect(pauseEvent.defaultPrevented).toBe(true);
    expect(document.querySelector('#pause-dialog').open).toBe(true);
    expect(harness.controls.enabled).toBe(false);
    expect(document.pointerLockElement).toBe(null);

    const resumeEvent = pressKey(document, 'KeyP');
    expect(resumeEvent.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(harness.controls.enabled).toBe(true));

    expect(document.querySelector('#pause-dialog').open).toBe(false);
    expect(document.pointerLockElement).toBe(harness.controls.canvas);
    expect(harness.audio.setPaused.mock.calls.filter(([paused]) => !paused)).toHaveLength(1);
  });

  it('keeps the sortie paused and reports pointerlockerror after a programmatic resume request', async () => {
    const document = await loadMain();
    await launch(document);
    pressPauseKey(document);
    harness.controls.captureResult = false;

    document.querySelector('#resume-flight').dispatch('click', { detail: 1 });
    await vi.waitFor(() => expect(document.querySelector('#resume-lock-status').hidden).toBe(false));

    expect(harness.controls.enabled).toBe(false);
    expect(document.querySelector('#pause-dialog').open).toBe(true);
    expect(document.querySelector('#game').classList.contains('flight-paused')).toBe(true);
    expect(harness.audio.setPaused).not.toHaveBeenCalledWith(false);
  });

  it('keeps keyboard click activation available for Resume Flight', async () => {
    const document = await loadMain();
    await launch(document);
    harness.resumeOrder.length = 0;

    pressPauseKey(document);
    document.querySelector('#resume-flight').dispatch('click', { detail: 0 });

    await vi.waitFor(() => expect(harness.controls.enabled).toBe(true));
    expect(harness.resumeOrder).toEqual(['audio-pause', 'pointer-lock', 'audio-resume']);
  });

  it('keeps the pause state until the browser confirms pointer capture', async () => {
    const document = await loadMain();
    await launch(document);
    let confirmCapture;
    harness.controls.capturePromise = new Promise(resolve => { confirmCapture = resolve; });

    pressPauseKey(document);
    document.querySelector('#resume-flight').dispatch('click', { detail: 1 });

    expect(document.querySelector('#pause-dialog').open).toBe(true);
    expect(document.querySelector('#game').classList.contains('flight-paused')).toBe(true);
    expect(harness.controls.enabled).toBe(false);
    expect(harness.audio.setPaused).not.toHaveBeenCalledWith(false);

    confirmCapture(true);
    await vi.waitFor(() => expect(harness.controls.enabled).toBe(true));
    expect(document.querySelector('#pause-dialog').open).toBe(false);
    expect(document.querySelector('#game').classList.contains('flight-paused')).toBe(false);
    expect(harness.audio.setPaused).toHaveBeenLastCalledWith(false);
    document.dispatchEvent(new Event('pointerlockchange'));
    expect(harness.audio.setPaused.mock.calls.filter(([paused]) => !paused)).toHaveLength(1);
  });

  it('keeps a quit sortie from leaking into the next launch', async () => {
    const document = await loadMain();
    await launch(document);
    const firstWorld = harness.worlds[0];

    pressPauseKey(document);
    expect(document.querySelector('#pause-dialog').open).toBe(true);

    document.querySelector('#quit-to-menu').dispatch('click');
    expect(document.querySelector('#pause-confirm-panel').hidden).toBe(false);
    expect(firstWorld.dispose).not.toHaveBeenCalled();

    document.querySelector('#confirm-quit-to-menu').dispatch('click');
    expect(firstWorld.dispose).toHaveBeenCalledOnce();
    expect(harness.audio.stopEngine).toHaveBeenCalledWith(true);
    expect(document.querySelector('#flight-hud').hidden).toBe(true);

    await launch(document);
    expect(harness.worlds).toHaveLength(2);
    expect(harness.controls.enabled).toBe(true);
    expect(document.querySelector('#game').classList.contains('flight-paused')).toBe(false);
  });

  it('restores launch controls after assets fail and allows a later retry', async () => {
    const document = await loadMain();
    harness.assets.aircraftError = new Error('aircraft unavailable');
    const launchErrorDialog = document.querySelector('#launch-error-dialog');
    document.querySelector('#launch-mission').dispatch('click');
    await vi.waitFor(() => expect(document.querySelector('#launch-mission').disabled).toBe(false));

    expect(launchErrorDialog.open).toBe(true);
    expect(harness.worlds).toHaveLength(0);
    expect(harness.controls.enabled).toBe(false);
    expect(document.querySelector('#menu-difficulty').disabled).toBe(false);
    expect(document.querySelector('#menu-theater').disabled).toBe(false);
    expect(document.querySelector('#launch-mission').getAttribute('aria-busy')).toBe('false');

    harness.assets.aircraftError = null;
    document.querySelector('#retry-launch').dispatch('click');
    await completeTriggeredLaunch(document, 1);
    expect(launchErrorDialog.open).toBe(false);
    expect(harness.worlds).toHaveLength(1);
  });

  it('returns from a launch error to a usable mission menu', async () => {
    const document = await loadMain();
    harness.assets.aircraftError = new Error('aircraft unavailable');
    document.querySelector('#launch-mission').dispatch('click');
    await vi.waitFor(() => expect(document.querySelector('#launch-error-dialog').open).toBe(true));

    document.querySelector('#launch-error-return').dispatch('click');
    expect(document.querySelector('#launch-error-dialog').open).toBe(false);
    expect(document.querySelector('#start-menu').hidden).toBe(false);
    expect(document.querySelector('#launch-mission').disabled).toBe(false);
    expect(document.querySelector('#launch-mission').getAttribute('aria-busy')).toBe('false');

    harness.assets.aircraftError = null;
    await launch(document);
    expect(harness.worlds).toHaveLength(1);
  });

  it('releases pointer lock if an asset failure wins before the gesture capture resolves', async () => {
    const document = await loadMain();
    harness.assets.aircraftError = new Error('aircraft unavailable');
    let resolveCapture;
    harness.controls.capturePromise = new Promise(resolve => { resolveCapture = resolve; });
    const launchButton = document.querySelector('#launch-mission');

    launchButton.dispatch('click');
    await vi.waitFor(() => expect(launchButton.disabled).toBe(false));
    expect(launchButton.getAttribute('aria-busy')).toBe('false');
    expect(document.querySelector('#menu-theater').disabled).toBe(false);

    resolveCapture(true);
    await vi.waitFor(() => expect(document.pointerLockElement).toBe(null));
    expect(harness.controls.enabled).toBe(false);
    expect(document.querySelector('#start-menu').hidden).toBe(false);
  });

  it('releases an older menu terrain result after a newer theater request wins', async () => {
    const document = await loadMain();
    await vi.waitFor(() => expect(document.querySelector('#launch-mission').disabled).toBe(false));
    const oldRequest = deferred();
    const currentRequest = deferred();
    const oldTerrain = makeTerrain('virolahti');
    const currentTerrain = makeTerrain('keitele');
    harness.terrainLoader = vi.fn()
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(currentRequest.promise);
    const theater = document.querySelector('#menu-theater');
    const launchButton = document.querySelector('#launch-mission');

    theater.value = 'virolahti';
    theater.dispatch('change');
    theater.value = 'keitele';
    theater.dispatch('change');
    const [oldCall, currentCall] = harness.terrainCalls.slice(-2);
    const oldSignal = oldCall.signal;
    const currentSignal = currentCall.signal;

    expect(oldSignal.aborted).toBe(true);
    expect(currentSignal.aborted).toBe(false);
    currentRequest.resolve(currentTerrain);
    await vi.waitFor(() => expect(launchButton.disabled).toBe(false));
    oldRequest.resolve(oldTerrain);
    await vi.waitFor(() => expect(harness.disposedTerrains).toContain(oldTerrain));

    expect(launchButton.getAttribute('aria-busy')).toBe('false');
    expect(document.querySelector('#menu-status').dataset.state).toBe('ready');
    await launch(document);
    expect(harness.worlds[0].terrain).toBe(currentTerrain);
    await returnToMenuFromFlight(document);
    await launch(document);
    expect(harness.worlds).toHaveLength(2);
    expect(harness.worlds[1].terrain).toBe(currentTerrain);
  });

  it('cancels the menu terrain preview when launch takes ownership and still supports the next sortie', async () => {
    const previewRequest = deferred();
    const sortieRequest = deferred();
    const stalePreview = makeTerrain('paijanne');
    const sortieTerrain = makeTerrain('paijanne');
    harness.terrainLoader = vi.fn()
      .mockReturnValueOnce(previewRequest.promise)
      .mockReturnValueOnce(sortieRequest.promise);
    const document = await loadMain();
    const launchButton = document.querySelector('#launch-mission');
    const expectedWorldCount = harness.worlds.length + 1;

    // A browser will not dispatch clicks to a disabled button; force the controller path
    // to cover the preview/launch race if another caller starts the launch programmatically.
    launchButton.disabled = false;
    launchButton.dispatch('click');
    await vi.waitFor(() => expect(harness.terrainCalls).toHaveLength(2));
    const [menuCall, sortieCall] = harness.terrainCalls;
    const menuSignal = menuCall.signal;
    const sortieSignal = sortieCall.signal;
    expect(menuSignal.aborted).toBe(true);
    expect(sortieSignal.aborted).toBe(false);
    sortieRequest.resolve(sortieTerrain);
    await completeTriggeredLaunch(document, expectedWorldCount);
    expect(harness.worlds[0].terrain).toBe(sortieTerrain);

    previewRequest.resolve(stalePreview);
    await vi.waitFor(() => expect(harness.disposedTerrains).toContain(stalePreview));
    expect(harness.worlds[0].terrain).toBe(sortieTerrain);

    await returnToMenuFromFlight(document);
    expect(launchButton.disabled).toBe(false);
    expect(launchButton.getAttribute('aria-busy')).toBe('false');
    await launch(document);
    expect(harness.worlds).toHaveLength(2);
    expect(harness.worlds[1].terrain).toBe(sortieTerrain);
  });

  it('aborts menu terrain loading when the page exits and releases its late result', async () => {
    const pendingTerrain = deferred();
    const lateTerrain = makeTerrain('paijanne');
    harness.terrainLoader = vi.fn().mockReturnValue(pendingTerrain.promise);
    await loadMain();
    const [menuCall] = harness.terrainCalls;

    globalThis.window.dispatchEvent(new Event('pagehide'));
    expect(menuCall.signal.aborted).toBe(true);
    pendingTerrain.resolve(lateTerrain);
    await vi.waitFor(() => expect(harness.disposedTerrains).toContain(lateTerrain));
    expect(harness.worlds).toHaveLength(0);
  });
});
