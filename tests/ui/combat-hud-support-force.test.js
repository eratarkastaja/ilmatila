import { afterEach, describe, expect, it, vi } from 'vitest';
import { CombatHud } from '../../src/ui/combat-hud.js';

function makeElement() {
  const attributes = new Map();
  return {
    hidden: false,
    textContent: '',
    dataset: {},
    style: {},
    classList: { contains: () => false, toggle() {} },
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
  };
}

function makeState() {
  return {
    session: { destroyed: false, gunFiring: false },
    environment: { timeOfDay: 23.1, night: true, nightVision: true },
    weapons: {
      gunAmmoRemaining: 100,
      missiles: { air: 4, ground: 2 },
      cooldown: 0,
      feedbackKey: null,
      feedbackTimer: 0,
    },
    countermeasures: { flares: 8, chaff: 8 },
    fuel: { unlimited: true, fraction: 1 },
    wingmanOrder: 'attack',
    wingmanRescue: { wingman: null, attacker: null, remaining: 0, missileInbound: false },
    supportForce: { active: true, fraction: 0.73, unitsAlive: 5, unitsTotal: 7 },
    score: 0,
    radar: {
      mode: 'air', target: null, targetDomain: 'air', targetInSensorRange: false,
      inLockEnvelope: false, lockCueConfirmed: false, lockCueTarget: false, lock: 0,
    },
    threats: {
      radarWarningState: null, missile: null, missileEta: Infinity, missileDistance: Infinity,
      launchVisible: false, launchSourcePosition: null, launchSeeker: null,
      contactApproach: { active: false, phase: 'approach', count: 0, distance: Infinity },
    },
    mission: {
      boundaryApproach: null,
      boundaryCritical: false,
      protectedAsset: { active: false, fraction: 0, distance: Infinity },
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('CombatHud Support force status', () => {
  it('shows live defender integrity and hides the meter outside Support', () => {
    const nodes = new Map();
    vi.stubGlobal('document', {
      querySelector(selector) {
        if (!nodes.has(selector)) nodes.set(selector, makeElement());
        return nodes.get(selector);
      },
    });
    const hud = new CombatHud();
    const state = makeState();

    hud.update(state);

    expect(hud.supportForce.hidden).toBe(false);
    expect(hud.supportForceValue.textContent).toBe('73%');
    expect(hud.supportForceUnits.textContent).toBe('5/7 DEFENDERS ACTIVE');
    expect(hud.supportForce.getAttribute('aria-valuenow')).toBe('73');
    expect(hud.supportForce.dataset.level).toBe('green');
    expect(hud.supportForceFill.style.transform).toBe('scaleX(0.73)');
    expect(hud.radarTime.textContent).toBe('23:06');
    expect(hud.nightVisionStatus.hidden).toBe(false);

    state.supportForce.fraction = 0.51;
    state.supportForce.unitsAlive = 4;
    hud.update(state);
    expect(hud.supportForceValue.textContent).toBe('51%');
    expect(hud.supportForceUnits.textContent).toBe('4/7 DEFENDERS ACTIVE');
    expect(hud.supportForce.dataset.level).toBe('yellow');

    state.supportForce.active = false;
    hud.update(state);
    expect(hud.supportForce.hidden).toBe(true);
  });

  it('shows protected site threat as it closes on the objective', () => {
    const nodes = new Map();
    vi.stubGlobal('document', {
      querySelector(selector) {
        if (!nodes.has(selector)) nodes.set(selector, makeElement());
        return nodes.get(selector);
      },
    });
    const hud = new CombatHud();
    const state = makeState();
    state.mission.protectedAsset = { active: true, fraction: .72, distance: 8400 };

    hud.update(state);

    expect(hud.protectedAsset.hidden).toBe(false);
    expect(hud.protectedAssetValue.textContent).toBe('72%');
    expect(hud.protectedAssetDistance.textContent).toBe('8.4 KM');
    expect(hud.protectedAsset.dataset.level).toBe('red');
    expect(hud.protectedAssetFill.style.transform).toBe('scaleX(0.72)');
    expect(hud.protectedAsset.getAttribute('aria-valuenow')).toBe('72');
  });

  it('shows the approaching hostile group before the engagement phase', () => {
    const nodes = new Map();
    vi.stubGlobal('document', {
      querySelector(selector) {
        if (!nodes.has(selector)) nodes.set(selector, makeElement());
        return nodes.get(selector);
      },
    });
    const hud = new CombatHud();
    const state = makeState();
    state.threats.contactApproach = { active: true, phase: 'committing', count: 3, distance: 25800 };

    hud.update(state);

    expect(hud.contactApproach.hidden).toBe(false);
    expect(hud.contactApproachText.textContent).toBe('3 HOSTILE TRACKS COMMITTING · 25.8 KM');
  });
});
