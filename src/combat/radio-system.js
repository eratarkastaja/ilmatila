import { t } from '../ui/i18n.js';

const MAX_QUEUED_CALLS = 3;

export const RADIO_CREW = Object.freeze({
  flightLead: Object.freeze({ callsignKey: 'radio.callsign.flightLead' }),
  groundControl: Object.freeze({ callsignKey: 'radio.callsign.groundControl' }),
  wingman1: Object.freeze({ callsignKey: 'radio.callsign.wingman1' }),
  wingman2: Object.freeze({ callsignKey: 'radio.callsign.wingman2' }),
  wingman3: Object.freeze({ callsignKey: 'radio.callsign.wingman3' }),
  owl: Object.freeze({ callsignKey: 'radio.callsign.owl' }),
  varpunen: Object.freeze({ callsignKey: 'radio.callsign.varpunen' }),
});

export const WINGMAN_COMMAND_EVENTS = Object.freeze({
  attack: 'wingman.command.attack',
  defend: 'wingman.command.defend',
  regroup: 'wingman.command.regroup',
  rtb: 'wingman.command.rtb',
});

/** Message catalog: gameplay emits event names; this layer owns priority and pacing. */
export const RADIO_EVENTS = Object.freeze({
  'mission.departure': { messageKey: 'radio.phase.departure', crew: 'flightLead', priority: 1, duration: 3 },
  'campaign.chapterBriefing': { messageKey: 'campaign.radio.generic', crew: 'groundControl', priority: 3, duration: 4.2 },
  'campaign.awacsActive': { messageKey: 'radio.campaign.awacsActive', crew: 'groundControl', priority: 3, duration: 3.2 },
  'campaign.ito90Online': { messageKey: 'radio.campaign.ito90Online', crew: 'groundControl', priority: 3, duration: 3.2 },
  'campaign.mlrsReady': { messageKey: 'radio.campaign.mlrsReady', crew: 'groundControl', priority: 3, duration: 3.2 },
  'campaign.mlrsRequest': { messageKey: 'radio.campaign.mlrsRequest', crew: 'groundControl', priority: 4, duration: 2.8 },
  'campaign.mlrsFired': { messageKey: 'radio.campaign.mlrsFired', crew: 'groundControl', priority: 4, duration: 3.2 },
  'campaign.mlrsFailed': { messageKey: 'radio.campaign.mlrsFailed', crew: 'groundControl', priority: 3, duration: 2.8 },
  'mission.controlIngress': { messageKey: 'radio.control.ingress', crew: 'groundControl', priority: 2, duration: 3.2, cooldown: 10 },
  'mission.controlContact': { messageKey: 'radio.control.contact', crew: 'groundControl', priority: 2, duration: 3.4, cooldown: 8 },
  'mission.controlEngagement': { messageKey: 'radio.control.engagement', crew: 'groundControl', priority: 2, duration: 3.4, cooldown: 8 },
  'mission.controlObjective': { messageKey: 'radio.control.objective', crew: 'groundControl', priority: 2, duration: 3.4, cooldown: 8 },
  'mission.controlPressure': { messageKey: 'radio.control.pressure', crew: 'groundControl', priority: 3, duration: 3.8, cooldown: 30 },
  'mission.controlRtb': { messageKey: 'radio.control.rtb', crew: 'groundControl', priority: 2, duration: 3.2, cooldown: 8 },
  'mission.contact': { messageKey: 'radio.phase.contact', crew: 'flightLead', priority: 1, duration: 2.6 },
  'mission.engagement': { messageKey: 'radio.phase.engagement', crew: 'flightLead', priority: 1, duration: 2.6 },
  'mission.objective': { messageKey: 'radio.phase.objective', crew: 'flightLead', priority: 1, duration: 3 },
  'mission.objectiveStage': { messageKey: 'radio.objectiveStage', crew: 'groundControl', priority: 3, duration: 3.8, cooldown: 4 },
  'mission.objectiveComplete': { messageKey: 'radio.objectiveComplete', crew: 'flightLead', priority: 2, duration: 3 },
  'mission.weaponsHold': { messageKey: 'radio.weaponsHold', crew: 'flightLead', priority: 5, duration: 3.8, cooldown: 5 },
  'mission.airPolicingIdentified': { messageKey: 'radio.airPolicingIdentified', crew: 'flightLead', priority: 3, duration: 4 },
  'mission.setbackRtb': { messageKey: 'radio.setbackRtb', crew: 'flightLead', priority: 4, duration: 4 },
  'mission.protectedSiteLost': { messageKey: 'radio.protectedSiteLost', crew: 'flightLead', priority: 5, duration: 4.8 },
  'mission.rtb': { messageKey: 'radio.phase.rtb', crew: 'flightLead', priority: 3, duration: 2.6 },
  'encounter.reinforcementExpected': { messageKey: 'radio.encounter.reinforcementExpected', crew: 'flightLead', priority: 4, duration: 3.8 },
  'threat.newContact': { messageKey: 'radio.threat.newContact', crew: 'flightLead', priority: 4, duration: 4 },
  'threat.contactIdentified': { messageKey: 'radio.threat.contactIdentified', crew: 'flightLead', priority: 4, duration: 3.5 },
  'threat.contactCommit': { messageKey: 'radio.threat.contactCommit', crew: 'groundControl', priority: 3, duration: 3.6, cooldown: 12 },
  'support.contactAwaitingOrders': { messageKey: 'radio.support.contactAwaitingOrders', crew: 'flightLead', priority: 4, duration: 5 },
  'support.fightersIdentified': { messageKey: 'radio.support.fightersIdentified', crew: 'flightLead', priority: 4, duration: 4 },
  'wingman.formation': { messageKey: 'radio.wingman.formation', crew: 'wingman', priority: 1, duration: 2.2 },
  'wingman.ingress': { messageKey: 'radio.wingman.ingress', crew: 'wingman', priority: 2, duration: 2.6, cooldown: 20 },
  'wingman.contact': { messageKey: 'radio.wingman.contact', crew: 'wingman', priority: 2, duration: 2.8, cooldown: 18, cooldownScope: 'flight' },
  'wingman.six': { messageKey: 'radio.wingman.six', crew: 'wingman', priority: 4, duration: 3, cooldown: 12, cooldownScope: 'flight' },
  'wingman.missileLock': { messageKey: 'radio.wingman.missileLock', crew: 'wingman', priority: 4, duration: 3, cooldown: 12, cooldownScope: 'flight' },
  'wingman.missileInbound': { messageKey: 'radio.wingman.missileInbound', crew: 'wingman', priority: 5, duration: 3, cooldown: 8, cooldownScope: 'flight' },
  'wingman.rescueMissileInbound': { messageKey: 'radio.wingman.rescueMissileInbound', crew: 'wingman', priority: 5, duration: 3, cooldown: 8, cooldownScope: 'flight' },
  'wingman.rifle': { messageKey: 'radio.wingman.rifle', crew: 'wingman', priority: 2, duration: 2.7, cooldown: 4 },
  'wingman.hit': { messageKey: 'radio.wingman.hit', crew: 'wingman', priority: 4, duration: 3 },
  'wingman.lost': { messageKey: 'radio.wingman.lost', crew: 'wingman', priority: 4, duration: 3.5 },
  'wingman.targetDestroyed': { messageKey: 'radio.wingman.targetDestroyed', crew: 'wingman', priority: 2, duration: 2.6 },
  'wingman.command.attack': { messageKey: 'radio.wingman.command.attack', crew: 'wingman', priority: 3, duration: 2.3, cooldown: 2.5 },
  'wingman.command.defend': { messageKey: 'radio.wingman.command.defend', crew: 'wingman', priority: 3, duration: 2.3, cooldown: 2.5 },
  'wingman.command.regroup': { messageKey: 'radio.wingman.command.regroup', crew: 'wingman', priority: 3, duration: 2.3, cooldown: 2.5 },
  'wingman.command.rtb': { messageKey: 'radio.wingman.command.rtb', crew: 'wingman', priority: 3, duration: 2.3, cooldown: 2.5 },
});

/** Presents queued radio calls with localized identities and a restrained receiver cue. */
export class RadioSystem {
  constructor({ node, audio }) {
    this.node = node;
    this.audio = audio;
    this.callsign = node?.querySelector('[data-radio-callsign]');
    this.message = node?.querySelector('[data-radio-message]');
    this.elapsed = 0;
    this.current = null;
    this.remaining = 0;
    this.queue = [];
    this.cooldowns = new Map();
  }

  emit(eventName, { wingmanId = null, params = {}, scope = '', priority, duration } = {}) {
    const event = RADIO_EVENTS[eventName];
    if (!event) return false;
    const crew = event.crew === 'wingman'
      ? RADIO_CREW[wingmanId]
      : RADIO_CREW[event.crew];
    if (!crew) return false;

    const identity = event.cooldownScope === 'flight' ? 'flight' : wingmanId ?? event.crew;
    const cooldownKey = `${eventName}:${identity}:${scope}`;
    return this.announce(params.messageKey ?? event.messageKey, {
      callsignKey: crew.callsignKey,
      params,
      priority: priority ?? event.priority,
      duration: duration ?? event.duration,
      cooldown: event.cooldown ?? 0,
      cooldownKey,
      dedupeKey: cooldownKey,
    });
  }

  acknowledgeWingmanCommand(order, wingmen, accepted) {
    if (!accepted) return false;
    const eventName = WINGMAN_COMMAND_EVENTS[order];
    if (!eventName) return false;
    let acknowledged = false;
    for (const wingman of wingmen) {
      if (wingman.dead) continue;
      acknowledged = this.emit(eventName, { wingmanId: wingman.radioId, scope: order }) || acknowledged;
    }
    return acknowledged;
  }

  announce(key, {
    callsign = '',
    callsignKey = 'radio.callsign.flightLead',
    params = {},
    priority = 1,
    duration = 2.5,
    cooldown = 0,
    cooldownKey = key,
    dedupeKey = `${key}:${callsignKey ?? callsign}`,
  } = {}) {
    if (!this.node || !this.message) return false;
    const cooldownUntil = this.cooldowns.get(cooldownKey) ?? -Infinity;
    if (this.elapsed < cooldownUntil) return false;
    if (this.current?.dedupeKey === dedupeKey || this.queue.some(entry => entry.dedupeKey === dedupeKey)) return false;

    const entry = { key, callsign, callsignKey, params, priority, duration, dedupeKey };
    if (!this.current) {
      this.accept(entry, cooldownKey, cooldown);
      this.present(entry);
      return true;
    }

    // Immediate threat and distress calls may displace routine chatter. The
    // message channel remains single-voice; ordinary reports stay queued.
    if (priority >= 4 && priority > this.current.priority) {
      this.accept(entry, cooldownKey, cooldown);
      this.present(entry);
      return true;
    }

    if (this.queue.length >= MAX_QUEUED_CALLS) {
      const replaceIndex = this.queue.findIndex(queued => queued.priority < priority);
      if (replaceIndex < 0) return false;
      this.queue.splice(replaceIndex, 1);
    }
    this.accept(entry, cooldownKey, cooldown);
    this.queue.push(entry);
    this.queue.sort((a, b) => b.priority - a.priority);
    return true;
  }

  accept(entry, cooldownKey, cooldown) {
    if (cooldown > 0) this.cooldowns.set(cooldownKey, this.elapsed + cooldown);
  }

  present(entry) {
    this.current = entry;
    this.remaining = entry.duration;
    this.node.hidden = false;
    this.node.classList.remove('radio-call-arriving');
    void this.node.offsetWidth;
    this.node.classList.add('radio-call-arriving');
    this.audio?.playRadioSquelch();
    this.render();
  }

  update(dt) {
    const delta = Math.max(0, Number.isFinite(dt) ? dt : 0);
    this.elapsed += delta;
    if (!this.current) return;
    this.remaining -= delta;
    if (this.remaining > 0) return;
    this.current = null;
    if (this.queue.length) this.present(this.queue.shift());
    else this.hide();
  }

  render() {
    if (!this.current) return;
    if (this.callsign) this.callsign.textContent = this.current.callsignKey ? t(this.current.callsignKey) : this.current.callsign;
    this.message.textContent = t(this.current.key, this.current.params);
  }

  refreshLanguage() {
    this.render();
  }

  hide() {
    this.current = null;
    this.queue.length = 0;
    if (this.node) {
      this.node.hidden = true;
      this.node.classList.remove('radio-call-arriving');
    }
  }

  dispose() {
    this.hide();
    this.cooldowns.clear();
  }
}
