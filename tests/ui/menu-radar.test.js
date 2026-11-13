import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { MISSIONS } from '../../src/mission/missions.js';
import { resolveMissionVariant } from '../../src/mission/mission-variants.js';
import { MenuRadar } from '../../src/ui/menu-radar.js';
import { getLanguage, setLanguage, t } from '../../src/ui/i18n.js';

class MockElement {
  constructor() {
    this.style = {};
    this.children = [];
    this.textContent = '';
    this.className = '';
    this.classList = {
      values: new Set(),
      toggle: (name, force) => {
        const enabled = force ?? !this.classList.values.has(name);
        if (enabled) this.classList.values.add(name);
        else this.classList.values.delete(name);
        return enabled;
      },
      contains: name => this.classList.values.has(name),
    };
  }
  append(child) {
    child.parent = this;
    this.children.push(child);
  }
  remove() {
    this.parent?.children.splice(this.parent.children.indexOf(this), 1);
  }
}

const originalDocument = globalThis.document;
const originalLocalStorage = globalThis.localStorage;
const originalCustomEvent = globalThis.CustomEvent;

function installDocument() {
  const listeners = new Map();
  const elements = new Map([
    ['.radar-scope', new MockElement()],
    ['.grid-sweep', new MockElement()],
    ['.radar-readout', new MockElement()],
  ]);
  globalThis.document = {
    querySelector: selector => elements.get(selector),
    querySelectorAll: () => [],
    createElement: () => new MockElement(),
    documentElement: { lang: '' },
    title: '',
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
  };
  globalThis.localStorage = { setItem() {} };
  globalThis.CustomEvent = class extends Event {
    constructor(type, options = {}) {
      super(type);
      this.detail = options.detail;
    }
  };
  return elements;
}

afterEach(() => {
  if (globalThis.document?.querySelectorAll) setLanguage('en');
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
  if (originalCustomEvent === undefined) delete globalThis.CustomEvent;
  else globalThis.CustomEvent = originalCustomEvent;
});

describe('MenuRadar sortie preview', () => {
  it('shows the real aft wingman bearings and forward hostile formation for a seeded mission', () => {
    const elements = installDocument();
    const radar = new MenuRadar();
    const seed = 0x5eed1234;
    const resolution = resolveMissionVariant(MISSIONS.patrol, seed);
    const terrain = {
      worldSize: 32000,
      operationBounds: { minX: -16000, maxX: 16000, minZ: -16000, maxZ: 16000 },
    };

    radar.setScenario(resolution, { seed, terrain });

    const friendlies = radar.contacts.filter(contact => contact.team === 'friendly');
    const hostiles = radar.contacts.filter(contact => contact.team === 'hostile');
    expect(friendlies).toHaveLength(resolution.mission.wingmen);
    expect(hostiles).toHaveLength(
      resolution.mission.hostiles
      + (resolution.mission.hostileHelicopters ?? 0)
      + resolution.encounters
        .filter(encounter => encounter.scheduled)
        .reduce((count, encounter) => count + encounter.response.hostiles, 0),
    );
    expect(friendlies.every(contact => contact.position.z < 0 && contact.top > 50)).toBe(true);
    expect(friendlies.every(contact => (
      Math.hypot(contact.left - 50, contact.top - 50) >= 4.99
      && contact.element.style.left === `${contact.left}%`
      && contact.element.style.top === `${contact.top}%`
    ))).toBe(true);
    expect(hostiles.filter(contact => !contact.reinforcement)
      .every(contact => contact.position.z > 0 && contact.top < 50)).toBe(true);
    expect(hostiles.filter(contact => !contact.reinforcement)
      .every(contact => contact.range >= resolution.mission.hostileMinimumSpawnDistance)).toBe(true);
    const selectedEncounter = resolution.encounters.find(encounter => encounter.scheduled);
    expect(hostiles.filter(contact => contact.reinforcement)
      .every(contact => contact.range >= selectedEncounter.response.minimumSpawnDistance)).toBe(true);
    expect(radar.contacts.every(contact => !contact.detected)).toBe(true);
    expect(elements.get('.radar-readout').textContent).toBe(t('menu.echoTrack', {
      detected: '00',
      total: String(radar.contacts.length).padStart(2, '0'),
    }));
    expect(radar.seed).toBe(seed);

    radar.dispose();
  });

  it('keeps campaign intelligence estimates through sweeps and an actual language change', () => {
    const elements = installDocument();
    const radar = new MenuRadar();
    const intel = {
      minimumStrength: 3,
      maximumStrength: 7,
      sectorKey: 'campaign.intel.sector.north',
    };
    radar.setIntel(intel);
    const readout = elements.get('.radar-readout');
    const initialText = t('campaign.intel.radarReadout', { minimum: 3, maximum: 7 });
    expect(readout.textContent).toBe(initialText);

    radar.update(5);
    expect(radar.detectedCount).toBeGreaterThan(0);
    expect(readout.textContent).toBe(initialText);

    setLanguage(getLanguage() === 'en' ? 'fi' : 'en');
    expect(readout.textContent).toBe(t('campaign.intel.radarReadout', { minimum: 3, maximum: 7 }));
    expect(readout.textContent).not.toBe(initialText);

    const seed = 0x0ddba11;
    radar.setScenario(resolveMissionVariant(MISSIONS.patrol, seed), {
      seed,
      terrain: { worldSize: 32000, operationBounds: { minX: -16000, maxX: 16000, minZ: -16000, maxZ: 16000 } },
    });
    expect(readout.textContent).toBe(t('menu.echoTrack', {
      detected: '00',
      total: String(radar.contacts.length).padStart(2, '0'),
    }));
    radar.dispose();
  });

  it('keeps intelligence contact pulses aligned with heading-up positions', () => {
    installDocument();
    const radar = new MenuRadar();
    radar.setIntel({
      minimumStrength: 3,
      maximumStrength: 7,
      sectorKey: 'campaign.intel.sector.north',
    }, {
      origin: new THREE.Vector3(120, 0, -80),
      heading: Math.PI / 2,
    });

    for (const contact of radar.contacts) {
      const displayRadius = Math.hypot(contact.left - 50, contact.top - 50);
      const sweepBearing = THREE.MathUtils.degToRad(-contact.scanBearing);
      expect(contact.left).toBeCloseTo(50 - Math.sin(sweepBearing) * displayRadius);
      expect(contact.top).toBeCloseTo(50 - Math.cos(sweepBearing) * displayRadius);
    }
    radar.dispose();
  });

  it('shows a contact briefly when the sweep crosses its bearing', () => {
    const elements = installDocument();
    const radar = new MenuRadar();
    const seed = 0x5eed1234;
    radar.setScenario(resolveMissionVariant(MISSIONS.patrol, seed), {
      seed,
      terrain: { worldSize: 32000, operationBounds: { minX: -16000, maxX: 16000, minZ: -16000, maxZ: 16000 } },
    });
    const target = radar.contacts[0];
    radar.angle = THREE.MathUtils.euclideanModulo(target.scanBearing - 1, 360);

    radar.update(0.03);

    expect(target.detected).toBe(true);
    expect(target.element.classList.contains('detected')).toBe(true);
    const detectedCount = radar.contacts.filter(contact => contact.detected).length;
    expect(elements.get('.radar-readout').textContent).toBe(t('menu.echoTrack', {
      detected: String(detectedCount).padStart(2, '0'),
      total: String(radar.contacts.length).padStart(2, '0'),
    }));

    radar.update(0.5);
    expect(target.detected).toBe(true);
    radar.update(0.3);
    expect(target.detected).toBe(false);
    expect(target.element.classList.contains('detected')).toBe(false);

    radar.dispose();
  });

  it('shows air-policing contacts as unknown instead of hostile', () => {
    installDocument();
    const radar = new MenuRadar();
    const resolution = resolveMissionVariant({
      ...MISSIONS.patrol,
      variants: [],
      hostiles: 2,
      hostileDisposition: 'noncombatant',
    }, 77);

    radar.setScenario(resolution, {
      seed: 77,
      terrain: { worldSize: 32000, operationBounds: { minX: -16000, maxX: 16000, minZ: -16000, maxZ: 16000 } },
    });

    expect(radar.contacts.filter(contact => contact.team === 'unknown')).toHaveLength(2);
    expect(radar.contacts.filter(contact => contact.team === 'hostile')).toHaveLength(0);
    expect(radar.contacts.filter(contact => contact.team === 'unknown')
      .every(contact => contact.element.textContent === t('radar.unknownCode'))).toBe(true);
    radar.dispose();
  });

  it('keeps heading-up radar positions repeatable for the same resolved mission and terrain', () => {
    installDocument();
    const radar = new MenuRadar();
    const seed = 0x0ddba11;
    const resolution = resolveMissionVariant(MISSIONS.intercept, seed);
    const terrain = {
      worldSize: 32000,
      operationBounds: { minX: -16000, maxX: 16000, minZ: -16000, maxZ: 16000 },
    };
    const origin = new THREE.Vector3(120, 0, -80);
    const options = { seed, terrain, origin, heading: Math.PI / 6 };

    radar.setScenario(resolution, options);
    const firstPositions = radar.contacts.map(({ team, range, left, top }) => ({ team, range, left, top }));
    radar.setScenario(resolveMissionVariant(MISSIONS.intercept, seed), options);

    expect(radar.contacts.map(({ team, range, left, top }) => ({ team, range, left, top })))
      .toEqual(firstPositions);
    radar.dispose();
  });
});
