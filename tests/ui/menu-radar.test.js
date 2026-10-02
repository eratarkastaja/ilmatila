import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { MISSIONS } from '../../src/mission/missions.js';
import { resolveMissionVariant } from '../../src/mission/mission-variants.js';
import { MenuRadar } from '../../src/ui/menu-radar.js';
import { t } from '../../src/ui/i18n.js';

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

function installDocument() {
  const elements = new Map([
    ['.radar-scope', new MockElement()],
    ['.grid-sweep', new MockElement()],
    ['.radar-readout', new MockElement()],
  ]);
  globalThis.document = {
    querySelector: selector => elements.get(selector),
    createElement: () => new MockElement(),
    addEventListener() {},
    removeEventListener() {},
  };
  return elements;
}

afterEach(() => {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
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
      + (resolution.reinforcement?.scheduled ? resolution.reinforcement.hostiles : 0),
    );
    expect(friendlies.every(contact => contact.position.z < 0 && contact.top > 50)).toBe(true);
    expect(hostiles.every(contact => contact.position.z > 0 && contact.top < 50)).toBe(true);
    expect(hostiles.filter(contact => !contact.reinforcement)
      .every(contact => contact.range >= resolution.mission.hostileMinimumSpawnDistance)).toBe(true);
    expect(hostiles.filter(contact => contact.reinforcement)
      .every(contact => contact.range >= resolution.reinforcement.minimumSpawnDistance)).toBe(true);
    expect(radar.contacts.every(contact => !contact.detected)).toBe(true);
    expect(elements.get('.radar-readout').textContent).toBe(t('menu.echoTrack', {
      detected: '00',
      total: String(radar.contacts.length).padStart(2, '0'),
    }));
    expect(radar.seed).toBe(seed);

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
