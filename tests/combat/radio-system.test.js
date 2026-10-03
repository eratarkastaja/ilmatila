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

  it('reports a wingman missile lock and names the attacker on the inbound call', () => {
    expect(radio.radio.emit('wingman.missileLock', {
      wingmanId: 'wingman2', scope: 'track-31', params: { attacker: 'MiG-29' },
    })).toBe(true);
    expect(radio.message.textContent).toBe('Defensive! Missile lock from MiG-29!');

    radio.radio.update(3.1);
    expect(radio.radio.emit('wingman.rescueMissileInbound', {
      wingmanId: 'wingman2', scope: 'missile-31', params: { attacker: 'MiG-29' },
    })).toBe(true);
    expect(radio.message.textContent).toBe('Missile inbound from MiG-29!');
  });

  it('reports the pop-up contact bearing and range before the identification call', () => {
    const params = { bearing: '310', range: '18.0' };
    expect(radio.radio.emit('threat.newContact', { scope: 'reinforcement', params })).toBe(true);
    expect(radio.message.textContent).toBe(
      'New contact, bearing 310, 18.0 kilometres, fast mover. Radar return uncertain.',
    );

    radio.radio.update(4.1);
    setLanguage('fi');
    expect(radio.radio.emit('threat.contactIdentified', { scope: 'reinforcement', params })).toBe(true);
    expect(radio.message.textContent).toBe(
      'Viholliskontakti tunnistettu, suuntima 310, 18.0 kilometriä. Kohde lähestyy.',
    );
  });

  it('preserves uncertain contact timing while adding CAS tasking context', () => {
    const params = { bearing: '270', range: '12.0' };
    expect(radio.radio.emit('support.contactAwaitingOrders', { params, scope: 'support-reinforcement' })).toBe(true);
    expect(radio.message.textContent).toBe(
      'Uncertain contact, bearing 270, 12.0 kilometres, closing fast. Ground forces still need CAS; wingman tasking is yours.',
    );

    radio.radio.update(5.1);
    expect(radio.radio.emit('support.fightersIdentified', { params, scope: 'support-reinforcement' })).toBe(true);
    expect(radio.message.textContent).toBe(
      'Two hostile fighters identified, bearing 270, 12.0 kilometres. CAS continues.',
    );

    setLanguage('fi');
    radio.radio.refreshLanguage();
    expect(radio.message.textContent).toBe(
      'Kaksi vihollishävittäjää tunnistettu, suuntima 270, 12.0 kilometriä. CAS-tuki jatkuu.',
    );
  });
});
