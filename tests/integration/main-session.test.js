import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  worlds: [],
  assets: null,
  controls: null,
  audio: null,
  raf: [],
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
    ensureTerrainLoaded(areaId) {
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
    disposeTerrain: vi.fn(),
    TERRAIN_AREAS: [{ id: 'paijanne', label: 'Päijänne' }],
  };
});

vi.mock('../../src/environment/clouds.js', async () => {
  const THREE = await import('three');
  return { makeClouds: () => new THREE.Group() };
});

vi.mock('../../src/ui/menu-radar.js', () => ({
  MenuRadar: class { setMission() {} update() {} },
}));

vi.mock('../../src/input/controls.js', () => ({
  FlightControls: class {
    constructor() {
      this.enabled = false;
      this.keys = new Set();
      this.speed = 235;
      this.pitch = this.roll = this.heading = this.elapsed = 0;
      this.bankReferenceValid = true;
      harness.controls = this;
    }
    setEnabled(enabled) { this.enabled = enabled; }
    requestMouseCapture() {}
    resetMouseAim() {}
    resetCameraZoom() {}
    updateAttitude() {}
    update() {}
  },
}));

vi.mock('../../src/combat/world.js', () => ({
  CombatWorld: class {
    constructor(scene, player, terrain, fx, aircraftAsset, mission, audio, onMissionEnd) {
      Object.assign(this, { scene, player, terrain, fx, aircraftAsset, mission, audio, onMissionEnd });
      this.destroyed = false;
      this.enemies = [];
      this.allies = [];
      this.playerShots = [];
      this.hostiles = [];
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
      this.setPaused = vi.fn();
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
    for (const listener of this.listeners.get(type) ?? []) listener({ target: this, ...event });
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
      if (selector === '#start-menu .menu-control-grid' || selector === '#start-menu .menu-lock-instruction') {
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

async function loadMain() {
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
  globalThis.location = { href: 'http://localhost/?mission=training&area=paijanne', search: '?mission=training&area=paijanne' };
  globalThis.history = { replaceState: vi.fn() };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.addEventListener = windowMock.addEventListener.bind(windowMock);
  globalThis.requestAnimationFrame = callback => {
    harness.raf.push(callback);
    return harness.raf.length;
  };
  const storage = new Map();
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
  await vi.waitFor(() => expect(harness.raf.length).toBeGreaterThan(1));
  harness.raf.pop()(0);
  await vi.waitFor(() => {
    expect(harness.worlds).toHaveLength(expectedWorldCount);
    expect(document.querySelector('#game').classList.contains('flight-active')).toBe(true);
  });
}

describe('main game session lifecycle', () => {
  beforeEach(() => {
    harness.worlds.length = 0;
    harness.raf.length = 0;
  });

  it('completes a sortie, saves career progress, returns to menu, and launches again cleanly', async () => {
    const document = await loadMain();
    await launch(document);
    const firstWorld = harness.worlds[0];

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

    await launch(document);
    expect(harness.worlds).toHaveLength(2);
    expect(harness.worlds[1]).not.toBe(firstWorld);
    expect(harness.worlds[1].mission).toBeTruthy();
    expect(harness.audio.startEngine).toHaveBeenCalledTimes(2);
    expect(document.querySelector('#flight-hud').hidden).toBe(false);
    expect(document.listenerRegistry.get('keydown').size).toBe(1);
    expect(document.listenerRegistry.get('ilmatila:languagechange').size).toBe(1);
  });

  it('keeps a quit sortie from leaking into the next launch', async () => {
    const document = await loadMain();
    await launch(document);
    const firstWorld = harness.worlds[0];

    document.querySelector('#quit-to-menu').dispatch('click');
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
    document.querySelector('#launch-mission').dispatch('click');
    await vi.waitFor(() => expect(document.querySelector('#launch-mission').disabled).toBe(false));

    expect(harness.worlds).toHaveLength(0);
    expect(harness.controls.enabled).toBe(false);
    expect(document.querySelector('#menu-difficulty').disabled).toBe(false);
    expect(document.querySelector('#menu-theater').disabled).toBe(false);
    expect(document.querySelector('#launch-mission').getAttribute('aria-busy')).toBe('false');

    harness.assets.aircraftError = null;
    await launch(document);
    expect(harness.worlds).toHaveLength(1);
  });
});
