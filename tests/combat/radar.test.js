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

function setupRadar(weather = null, campaignSupport = {}) {
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
  return { radar: new CombatRadar(player, audio, weather, 1, {}, campaignSupport), player, screen, indicator, crosshair, audio };
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

  it('shortens the effective search range in low cloud without changing the base radar profile', () => {
    const { radar } = setupRadar({ radarRangeScale: .5 });
    const near = makeContact(0, 0, 13000);
    const far = makeContact(0, 0, 16000);
    radar.updateContacts(.016, 0, {
      airFriendly: [], airHostile: [near, far], groundFriendly: [], groundHostile: [],
    });
    expect(radar.tracks.has(near.mesh)).toBe(true);
    expect(radar.tracks.has(far.mesh)).toBe(false);
    expect(radar.airRange).toBe(27000);
  });

  it('shows a first hostile return as uncertain before classifying it', () => {
    const { radar } = setupRadar();
    const hostile = makeContact(0, 0, 2000);
    hostile.combatant = true;
    hostile.identified = true;
    hostile.radarTeam = 'hostile';
    const contacts = { airFriendly: [], airHostile: [hostile], groundFriendly: [], groundHostile: [] };

    radar.updateContacts(.016, 0, contacts);
    expect(radar.tracks.get(hostile.mesh).node.className).toContain('unknown');
    expect(radar.cycleTarget([hostile], [])).toBe(true);

    for (let step = 0; step < 36; step++) radar.updateContacts(.1, 0, contacts);
    expect(radar.tracks.get(hostile.mesh).node.className).toContain('hostile');
    expect(radar.tracks.get(hostile.mesh).node.className).not.toContain('unknown');
  });

  it('keeps an uncertain pop-up return visible in ground mode and unselectable until identification', () => {
    const { radar } = setupRadar();
    const contact = makeContact(0, 0, 12000);
    contact.identified = false;
    contact.popUpContact = true;
    const contacts = {
      airFriendly: [], airHostile: [contact], groundFriendly: [], groundHostile: [],
    };

    radar.toggleMode();
    radar.updateContacts(0.016, 0, contacts);

    let track = radar.tracks.get(contact.mesh);
    expect(track.team).toBe('unknown');
    expect(track.node.className).toContain('unknown');
    expect(radar.cycleTarget([], [])).toBe(false);

    radar.toggleMode();
    radar.updateContacts(0.016, 0, contacts);
    track = radar.tracks.get(contact.mesh);
    expect(radar.cycleTarget([contact], [])).toBe(false);

    contact.identified = true;
    radar.updateContacts(0.016, 0, contacts);

    expect(track.team).toBe('hostile');
    expect(track.node.className).toContain('hostile');
    expect(radar.cycleTarget([contact], [])).toBe(true);
  });

  it('allows an identified neutral air-policing contact to be selected and locked', () => {
    const { radar } = setupRadar();
    const contact = makeContact(0, 0, 2600);
    contact.identified = true;
    contact.combatant = false;
    contact.radarTeam = 'neutral';
    radar.updateContacts(0.016, 0, {
      airFriendly: [], airHostile: [contact], groundFriendly: [], groundHostile: [],
    });

    expect(radar.tracks.get(contact.mesh).team).toBe('neutral');
    expect(radar.cycleTarget([contact], [])).toBe(true);
    for (let step = 0; step < 20; step++) radar.updateLock(0.1, [contact], []);

    expect(radar.target).toBe(contact);
    expect(radar.lockCueConfirmed).toBe(true);
  });

  it('keeps an unknown air-policing contact selected until visual identification allows lock', () => {
    const { radar } = setupRadar();
    const contact = makeContact(0, 0, 2600);
    contact.identified = false;
    contact.combatant = false;
    contact.radarTeam = 'unknown';
    radar.updateContacts(0.016, 0, {
      airFriendly: [], airHostile: [contact], groundFriendly: [], groundHostile: [],
    });

    expect(radar.cycleTarget([contact], [])).toBe(true);
    radar.updateLock(.1, [contact], []);
    expect(radar.target).toBe(contact);
    expect(radar.lockCueConfirmed).toBe(false);
    contact.identified = true;
    contact.radarTeam = 'neutral';
    radar.updateContacts(.016, 0, {
      airFriendly: [], airHostile: [contact], groundFriendly: [], groundHostile: [],
    });
    for (let step = 0; step < 20; step++) radar.updateLock(0.1, [contact], []);
    expect(radar.lockCueConfirmed).toBe(true);
  });

  it('highlights the threatened wingman and missile attacker in both radar modes', () => {
    const { radar } = setupRadar();
    const wingman = makeContact(250, 300, 1800);
    wingman.rescueHighlight = true;
    wingman.rescueFocusKind = 'rescue-wingman';
    const attacker = makeContact(-250, 300, 2200);
    attacker.rescueHighlight = true;
    attacker.rescueFocusKind = 'rescue-attacker';
    const contacts = {
      airFriendly: [wingman], airHostile: [attacker], groundFriendly: [], groundHostile: [],
    };

    radar.toggleMode();
    radar.updateContacts(.016, 0, contacts);
    expect(radar.tracks.get(wingman.mesh).node.className).toContain('rescue-wingman');
    expect(radar.tracks.get(attacker.mesh).node.className).toContain('rescue-attacker');

    radar.toggleMode();
    radar.updateContacts(.016, 0, contacts);
    expect(radar.tracks.get(wingman.mesh).node.className).toContain('rescue-focus');
    expect(radar.tracks.get(attacker.mesh).node.className).toContain('rescue-focus');
  });

  it('marks mission-role ground contacts on the scope', () => {
    const { radar } = setupRadar();
    const relay = makeContact(0, 0, 2200);
    relay.missionTargetRoleKey = 'combat.groundTargetRole.logistics';
    radar.toggleMode();
    radar.updateContacts(0.016, 0, {
      airFriendly: [], airHostile: [], groundFriendly: [], groundHostile: [relay],
    });

    expect(radar.tracks.get(relay.mesh).node.className).toContain('mission-target');
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
    const hostileVehicle = makeContact(0, 0, 7400);
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

  it('extends only air search and AMRAAM launch envelopes with AWACS', () => {
    const { radar } = setupRadar(null, { awacs: true });
    expect(radar.airRange).toBe(36450);
    expect(radar.airLockRange).toBeCloseTo(13200);
    expect(radar.groundRange).toBe(11000);
    expect(radar.groundLockRange).toBe(6800);
    expect(radar.trackMemoryDuration).toBeGreaterThan(1.4);
  });
});
