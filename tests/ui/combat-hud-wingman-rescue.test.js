import { afterEach, describe, expect, it, vi } from 'vitest';
import { CombatHud } from '../../src/ui/combat-hud.js';

function makeElement() {
  const classes = new Set();
  return {
    hidden: false,
    textContent: '',
    dataset: {},
    style: {},
    classList: {
      contains: name => classes.has(name),
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
    getAttribute: () => null,
    setAttribute() {},
  };
}

function makeState() {
  return {
    session: { destroyed: false, gunFiring: false },
    weapons: {
      gunAmmoRemaining: 0,
      missiles: { air: 4, ground: 2 },
      cooldown: 0,
      feedbackKey: null,
      feedbackTimer: 0,
    },
    countermeasures: { flares: 8, chaff: 8 },
    fuel: { unlimited: true, fraction: 1 },
    wingmanOrder: 'attack',
    wingmanRescue: {
      wingman: { radioId: 'wingman2' },
      attacker: { label: 'MiG-29' },
      remaining: 12,
      missileInbound: true,
    },
    score: 0,
    radar: {
      mode: 'air', target: null, targetDomain: 'air', targetInSensorRange: false,
      inLockEnvelope: false, lockCueConfirmed: false, lockCueTarget: false, lock: 0,
    },
    threats: {
      radarWarningState: null, missile: null, missileEta: Infinity, missileDistance: Infinity,
      launchVisible: false, launchSourcePosition: null, launchSeeker: null,
    },
    mission: { boundaryApproach: null, boundaryCritical: false },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('CombatHud wingman rescue alert', () => {
  it('names the threatened wingman and attacker, then hides the alert when the threat clears', () => {
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

    expect(hud.wingmanRescue.hidden).toBe(false);
    expect(hud.wingmanRescueTitle.textContent).toContain('RAVEN');
    expect(hud.wingmanRescueDetail.textContent).toContain('MiG-29');
    expect(hud.wingmanRescueDetail.textContent).toContain('12s');

    state.wingmanRescue.wingman = null;
    hud.update(state);
    expect(hud.wingmanRescue.hidden).toBe(true);
  });

  it('uses the translated generic attacker name when no attacker label is available', () => {
    const nodes = new Map();
    vi.stubGlobal('document', {
      querySelector(selector) {
        if (!nodes.has(selector)) nodes.set(selector, makeElement());
        return nodes.get(selector);
      },
    });
    const hud = new CombatHud();
    const state = makeState();
    state.wingmanRescue.attacker = null;

    hud.update(state);

    expect(hud.wingmanRescueDetail.textContent).toContain('hostile aircraft');
    expect(hud.wingmanRescueDetail.textContent).not.toContain('mission.optionalTarget.generic');
  });
});
