import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../../src/ui/i18n.js';
import { AirBattle } from '../../src/combat/air-battle.js';
import { RadioSystem } from '../../src/combat/radio-system.js';

function makeRadioNode() {
  const children = {
    '[data-radio-callsign]': { textContent: '' },
    '[data-radio-message]': { textContent: '' },
  };
  const classes = new Set();
  const node = {
    hidden: true,
    classList: {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      contains: value => classes.has(value),
    },
    querySelector: selector => children[selector] ?? null,
    get offsetWidth() { return 140; },
  };
  return { node, callsign: children['[data-radio-callsign]'], message: children['[data-radio-message]'] };
}

function makeRadio() {
  const view = makeRadioNode();
  const audio = { playRadioSquelch: vi.fn() };
  return { ...view, audio, radio: new RadioSystem({ node: view.node, audio }) };
}

describe('RadioSystem', () => {
  let radio;

  beforeEach(() => {
    vi.stubGlobal('document', {
      title: '',
      documentElement: {},
      querySelectorAll: () => [],
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal('CustomEvent', class CustomEventStub {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    });
    setLanguage('en');
    radio = makeRadio();
  });

  afterEach(() => {
    radio.radio.dispose();
    setLanguage('en');
    vi.unstubAllGlobals();
  });

  it('localizes both wingman callsigns and refreshes active and queued calls after a language change', () => {
    radio.radio.emit('wingman.formation', { wingmanId: 'wingman1' });
    radio.radio.emit('wingman.formation', { wingmanId: 'wingman2' });
    expect(radio.callsign.textContent).toBe('GROUSE');
    setLanguage('fi');
    radio.radio.refreshLanguage();
    expect(radio.callsign.textContent).toBe('METSO');
    radio.radio.update(2.3);
    expect(radio.callsign.textContent).toBe('KORPPI');
    radio.radio.update(2.3);
    radio.radio.emit('wingman.formation', { wingmanId: 'wingman1' });
    expect(radio.message.textContent).toBe('Siivelläsi.');
    setLanguage('en');
    radio.radio.refreshLanguage();
    expect(radio.callsign.textContent).toBe('GROUSE');
    expect(radio.message.textContent).toBe('On your wing.');
  });

  it('reports reaching ingress with the active language and localized callsign', () => {
    setLanguage('fi');
    expect(radio.radio.emit('wingman.ingress', { wingmanId: 'wingman2', scope: 'ingress' })).toBe(true);
    expect(radio.callsign.textContent).toBe('KORPPI');
    expect(radio.message.textContent).toBe('Sisääntulopiste saavutettu. Pysyn muodostelmassa.');
    setLanguage('en');
    radio.radio.refreshLanguage();
    expect(radio.callsign.textContent).toBe('RAVEN');
    expect(radio.message.textContent).toBe('Ingress reached. Holding formation.');
  });

  it('acknowledges only accepted commands and staggers flight-wide replies in queue order', () => {
    const wingmen = [
      { radioId: 'wingman1', dead: false },
      { radioId: 'wingman2', dead: false },
    ];
    expect(radio.radio.acknowledgeWingmanCommand('attack', wingmen, false)).toBe(false);
    expect(radio.radio.acknowledgeWingmanCommand('unsupported', wingmen, true)).toBe(false);
    expect(radio.node.hidden).toBe(true);

    const noWingmen = [{ radioId: 'wingman1', dead: true }];
    expect(radio.radio.acknowledgeWingmanCommand('attack', noWingmen, true)).toBe(false);

    expect(radio.radio.acknowledgeWingmanCommand('attack', wingmen, true)).toBe(true);
    expect(radio.callsign.textContent).toBe('GROUSE');
    expect(radio.message.textContent).toBe('Engaging.');
    expect(radio.radio.queue).toHaveLength(1);

    radio.radio.update(2.4);
    expect(radio.callsign.textContent).toBe('RAVEN');
    expect(radio.message.textContent).toBe('Engaging.');
  });

  it('does not acknowledge an unsupported order rejected by the wingman controller', () => {
    const wingmen = [
      { radioId: 'wingman1', dead: false, target: {}, targetRefresh: 4, phase: 'attack' },
      { radioId: 'wingman2', dead: false, target: {}, targetRefresh: 4, phase: 'attack' },
    ];
    const airBattle = Object.create(AirBattle.prototype);
    airBattle.allies = wingmen;
    airBattle.wingmanOrder = 'attack';

    const rejected = airBattle.issueWingmanOrder('fly-to-the-moon');
    expect(rejected).toBe(false);
    expect(radio.radio.acknowledgeWingmanCommand('fly-to-the-moon', wingmen, rejected)).toBe(false);
    expect(radio.node.hidden).toBe(true);

    const accepted = airBattle.issueWingmanOrder('disengage');
    expect(accepted).toBe(true);
    expect(radio.radio.acknowledgeWingmanCommand('disengage', wingmen, accepted)).toBe(true);
    expect(radio.callsign.textContent).toBe('GROUSE');
    expect(radio.message.textContent).toBe('Disengaging.');
    expect(wingmen.every(wingman => wingman.target === null)).toBe(true);
  });

  it('deduplicates contact reports and enforces event cooldowns', () => {
    const params = { direction: { key: 'radio.direction.right' } };
    expect(radio.radio.emit('wingman.contact', { wingmanId: 'wingman1', scope: 'track-42', params })).toBe(true);
    expect(radio.radio.emit('wingman.contact', { wingmanId: 'wingman1', scope: 'track-42', params })).toBe(false);
    expect(radio.message.textContent).toBe('Contact right. Engaging.');

    radio.radio.update(2.5);
    expect(radio.radio.emit('wingman.contact', { wingmanId: 'wingman2', scope: 'track-42', params })).toBe(false);
    radio.radio.update(15);
    expect(radio.radio.emit('wingman.contact', { wingmanId: 'wingman2', scope: 'track-42', params })).toBe(false);
    radio.radio.update(1);
    expect(radio.radio.emit('wingman.contact', { wingmanId: 'wingman1', scope: 'track-42', params })).toBe(true);
  });

  it('puts an immediate missile warning ahead of routine queued chatter', () => {
    radio.radio.emit('mission.contact');
    radio.radio.emit('mission.engagement');
    expect(radio.radio.emit('wingman.missileInbound', { wingmanId: 'wingman2', scope: 'player' })).toBe(true);
    expect(radio.callsign.textContent).toBe('RAVEN');
    expect(radio.message.textContent).toBe('Missile inbound!');
    expect(radio.radio.queue.map(entry => entry.key)).toContain('radio.phase.engagement');
  });
});
