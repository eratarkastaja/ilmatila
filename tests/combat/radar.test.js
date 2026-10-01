import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CombatRadar } from '../../src/combat/radar.js';

function makeElement() {
  const names = new Set();
  const element = {
    style: {},
    classList: {
      add: (...items) => items.forEach(item => names.add(item)),
      remove: (...items) => items.forEach(item => names.delete(item)),
      contains: item => names.has(item),
      toggle(item, force) {
        const enabled = force ?? !names.has(item);
        if (enabled) names.add(item);
        else names.delete(item);
        return enabled;
      },
    },
    children: [],
    append(child) {
      child.parent = this;
      this.children.push(child);
    },
    remove() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter(child => child !== this);
      this.parent = null;
    },
  };
  Object.defineProperty(element, 'className', {
    get: () => [...names].join(' '),
    set: value => {
      names.clear();
      value.split(/\s+/).filter(Boolean).forEach(name => names.add(name));
    },
  });
  element.querySelectorAll = selector => element.children.filter(child => child.className.includes(selector.slice(1)));
  return element;
}

function makeContact(x, y, z) {
  const mesh = new THREE.Object3D();
  mesh.position.set(x, y, z);
  return { mesh, dead: false };
}

function setupRadar() {
  const screen = makeElement();
  const indicator = { textContent: '' };
  const crosshair = makeElement();
  vi.stubGlobal('document', {
    querySelector(selector) {
      if (selector === '.radar-screen') return screen;
      if (selector === '#radar-mode-indicator') return indicator;
      if (selector === '.crosshair') return crosshair;
      return null;
    },
    createElement: () => makeElement(),
  });
  const player = new THREE.Object3D();
  const audio = {
    playRadarMode: vi.fn(),
    playLockAcquire: vi.fn(),
    playLockLost: vi.fn(),
    playLockReady: vi.fn(),
  };
  return { radar: new CombatRadar(player, audio), player, screen, indicator, crosshair, audio };
}

afterEach(() => vi.unstubAllGlobals());

describe('combat radar target and lock logic', () => {
  it('shows returns without automatically selecting or locking a target', () => {
    const { radar } = setupRadar();
    const hostile = makeContact(0, 0, 2000);
    const contacts = { airFriendly: [], airHostile: [hostile], groundFriendly: [], groundHostile: [] };

    radar.updateContacts(0.016, 0, contacts);

    expect(radar.tracks.has(hostile.mesh)).toBe(true);
    expect(radar.target).toBeNull();
    expect(radar.lockCueConfirmed).toBe(false);
  });

  it('cycles only to a detected in-range hostile and confirms lock in the nose envelope', () => {
    const { radar, audio } = setupRadar();
    const hostile = makeContact(0, 0, 2000);
    radar.updateContacts(0.016, 0, { airFriendly: [], airHostile: [hostile], groundFriendly: [], groundHostile: [] });

    expect(radar.cycleTarget([hostile], [])).toBe(true);
    for (let step = 0; step < 20; step++) radar.updateLock(0.1, [hostile], []);

    expect(radar.target).toBe(hostile);
    expect(radar.targetDomain).toBe('air');
    expect(radar.inLockEnvelope).toBe(true);
    expect(radar.lockCueConfirmed).toBe(true);
    expect(audio.playLockReady).toHaveBeenCalledOnce();
  });

  it('drops lock when a selected target leaves the nose envelope', () => {
    const { radar } = setupRadar();
    const hostile = makeContact(0, 0, 2000);
    radar.updateContacts(0.016, 0, { airFriendly: [], airHostile: [hostile], groundFriendly: [], groundHostile: [] });
    radar.cycleTarget([hostile], []);
    for (let step = 0; step < 20; step++) radar.updateLock(0.1, [hostile], []);
    const acquiredLock = radar.lock;

    hostile.mesh.position.set(1600, 0, 1000);
    radar.updateLock(0.1, [hostile], []);

    expect(radar.target).toBe(hostile);
    expect(radar.inLockEnvelope).toBe(true);
    expect(radar.lockCueTarget).toBe(false);
    expect(radar.lockCueConfirmed).toBe(false);
    expect(radar.lock).toBeLessThan(acquiredLock);
  });

  it('uses ground contacts in ground mode and rejects contacts beyond weapon lock range', () => {
    const { radar, indicator } = setupRadar();
    const hostileVehicle = makeContact(0, 0, 5400);
    radar.toggleMode();
    radar.updateContacts(0.016, 0, {
      airFriendly: [], airHostile: [], groundFriendly: [], groundHostile: [hostileVehicle],
    });

    expect(indicator.textContent).toBe('GND');
    expect(radar.cycleTarget([], [hostileVehicle])).toBe(true);
    radar.updateLock(0.1, [], [hostileVehicle]);

    expect(radar.target).toBe(hostileVehicle);
    expect(radar.targetDomain).toBe('ground');
    expect(radar.inLockEnvelope).toBe(false);
    expect(radar.lockCueConfirmed).toBe(false);
  });
});
