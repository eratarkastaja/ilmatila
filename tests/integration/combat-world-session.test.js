import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

class MockElement {
  constructor() {
    this.hidden = false;
    this.textContent = '';
    this.dataset = {};
    this.style = { setProperty() {} };
    this.children = [];
    this.listeners = new Map();
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle: (name, force) => {
        const enabled = force ?? !classes.has(name);
        if (enabled) classes.add(name);
        else classes.delete(name);
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
  querySelector() { return new MockElement(); }
  querySelectorAll() { return []; }
  append(child) { this.children.push(child); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  remove() { this.removed = true; }
}

class TrackedEventTarget extends EventTarget {
  constructor() {
    super();
    this.listenerRegistry = new Map();
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
  listenerCount(type) { return this.listenerRegistry.get(type)?.size ?? 0; }
}

class MockDocument extends TrackedEventTarget {
  constructor() {
    super();
    this.elements = new Map();
    this.documentElement = { lang: 'en' };
    this.title = '';
  }
  querySelector(selector) {
    if (!this.elements.has(selector)) this.elements.set(selector, new MockElement());
    return this.elements.get(selector);
  }
  createElement(tagName) {
    if (tagName !== 'canvas') return new MockElement();
    const gradient = { addColorStop() {} };
    return {
      width: 0,
      height: 0,
      getContext: () => ({
        createRadialGradient: () => gradient,
        fillRect() {},
      }),
    };
  }
  createTextNode(textContent) { return { textContent }; }
}

const originalGlobals = {};

afterEach(() => {
  for (const [name, value] of Object.entries(originalGlobals)) {
    if (value === undefined) delete globalThis[name];
    else globalThis[name] = value;
  }
  for (const name of Object.keys(originalGlobals)) delete originalGlobals[name];
});

function installBrowserGlobals() {
  for (const name of ['document', 'window', 'localStorage', 'requestAnimationFrame']) {
    originalGlobals[name] = globalThis[name];
  }
  const document = new MockDocument();
  const window = new TrackedEventTarget();
  const values = new Map();
  globalThis.document = document;
  globalThis.window = window;
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  globalThis.requestAnimationFrame = undefined;
  return { document, window };
}

function createTerrain() {
  return {
    worldSize: 32000,
    operationBounds: { minX: -16000, maxX: 16000, minZ: -16000, maxZ: 16000 },
    sampleHeight: () => 0,
    isPlayableArea: () => true,
    isWater: () => false,
  };
}

function createMission() {
  return {
    id: 'training',
    hostiles: 1,
    deferredHostiles: true,
    hostileSpawnDistance: 4000,
    hostileMinimumSpawnDistance: 4000,
    wingmen: 0,
    groundBattle: true,
    groundPairs: 1,
    groundTrucks: 1,
    departureDuration: 0,
    navigationDistance: 100,
    navigationRadius: 50,
    extractionRadius: 50,
    objectiveReportDuration: 0,
    objective: { type: 'training', duration: 0.2 },
  };
}

function createAircraftAsset() {
  const model = () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(6, 2, 12), new THREE.MeshBasicMaterial()));
    return root;
  };
  return { hostiles: { su27: model(), mig29: model() } };
}

describe('CombatWorld sortie lifecycle', () => {
  it('runs a training mission through RTB and debrief, saves its record, and releases listeners between sorties', async () => {
    const { document, window } = installBrowserGlobals();
    const { CombatWorld } = await import('../../src/combat/world.js');
    const { CareerProgress } = await import('../../src/mission/progression.js');
    const storage = globalThis.localStorage;
    const career = new CareerProgress(storage);
    const scene = new THREE.Scene();
    const player = new THREE.Group();
    player.position.set(0, 100, 0);
    const terrain = createTerrain();
    const aircraftAsset = createAircraftAsset();
    const mission = createMission();
    const onMissionEnd = vi.fn((outcome, result) => career.recordMission({ ...result, outcome }));

    const first = new CombatWorld(scene, player, terrain, null, aircraftAsset, mission, null, onMissionEnd, 'hard');
    expect(window.listenerCount('keydown')).toBe(1);
    expect(document.listenerCount('ilmatila:languagechange')).toBe(1);
    expect(first.redUnits.filter(unit => unit.armed !== false)).toHaveLength(1);
    expect(first.friends.length).toBeGreaterThan(0);

    first.update(0.1);
    expect(first.missionFlow.phase).toBe('navigation');
    player.position.copy(first.missionFlow.ingress);
    first.update(0.1);
    expect(first.missionFlow.phase).toBe('contact');
    expect(first.enemies).toHaveLength(1);
    expect(first.enemies[0].phase).toBe('staging');
    first.update(3);
    expect(first.enemies[0].phase).toBe('inbound');
    expect(first.missionSystem.objectiveSatisfied).toBe(true);
    expect(first.missionFlow.phase).toBe('rtb');
    player.position.copy(first.missionFlow.home);
    first.update(0.1);

    expect(first.debriefData).toMatchObject({ missionId: 'training', outcome: 'complete' });
    expect(onMissionEnd).toHaveBeenCalledOnce();
    expect(career.getBest('training', 'hard')).toMatchObject({ completed: true, score: 1250 });
    expect(new CareerProgress(storage).getBest('training', 'hard')).toMatchObject({ completed: true });
    expect(first.missionFlow.phase).toBe('debrief');

    first.dispose();
    expect(window.listenerCount('keydown')).toBe(0);
    expect(document.listenerCount('ilmatila:languagechange')).toBe(0);
    expect(scene.children).toHaveLength(0);

    const second = new CombatWorld(scene, player, terrain, null, aircraftAsset, mission, null, vi.fn(), 'hard');
    expect(window.listenerCount('keydown')).toBe(1);
    expect(document.listenerCount('ilmatila:languagechange')).toBe(1);
    second.dispose();
    expect(window.listenerCount('keydown')).toBe(0);
    expect(document.listenerCount('ilmatila:languagechange')).toBe(0);
  });
});
