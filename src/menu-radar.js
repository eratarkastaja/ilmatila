import * as THREE from 'three';
import { t } from './i18n.js';
import { MISSIONS } from './missions.js';

const CONVOY_GROUP_SIZE = 4;

function getMissionContacts(mission) {
  const contacts = [];
  for (let index = 0; index < mission.wingmen; index += 1) contacts.push({ team: 'friendly', domain: 'air' });
  for (let index = 0; index < mission.hostiles; index += 1) contacts.push({ team: 'hostile', domain: 'air' });

  if (mission.groundBattle) {
    for (let index = 0; index < mission.groundPairs; index += 1) {
      contacts.push({ team: 'friendly', domain: 'ground' });
      contacts.push({ team: 'hostile', domain: 'ground' });
    }
    const convoyGroups = Math.ceil(mission.groundTrucks / CONVOY_GROUP_SIZE);
    for (let index = 0; index < convoyGroups; index += 1) contacts.push({ team: 'hostile', domain: 'ground' });
  }

  return contacts;
}

function createRandom(missionId) {
  let seed = 2166136261;
  for (const character of missionId) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  seed >>>= 0;
  if (seed === 0) seed = 1;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Decorative mission-theater radar used by the start menu. */
export class MenuRadar {
  constructor({ reducedMotion = false, missionId = 'intercept' } = {}) {
    this.scope = document.querySelector('.radar-scope');
    this.sweep = document.querySelector('.grid-sweep');
    this.readout = document.querySelector('.radar-readout');
    this.scanSeconds = reducedMotion ? 24 : 9;
    this.angle = 0;
    this.elapsed = 0;
    this.visibleCount = -1;
    this.missionId = null;
    this.contacts = [];

    this.onLanguageChange = () => {
      this.updateContactLabels();
      this.visibleCount = -1;
      this.updateReadout(this.contacts.filter(contact => contact.visibleUntil > this.elapsed).length);
    };
    document.addEventListener('ilmatila:languagechange', this.onLanguageChange);
    this.setMission(missionId);
  }

  setMission(missionId) {
    const mission = MISSIONS[missionId];
    if (!mission || this.missionId === missionId || !this.scope) return;

    for (const contact of this.contacts) contact.element.remove();
    this.contacts = [];
    this.missionId = missionId;

    const random = createRandom(missionId);
    for (const spec of getMissionContacts(mission)) {
      const element = document.createElement('b');
      element.className = `grid-contact contact-${spec.team} contact-${spec.domain}`;
      this.scope.append(element);

      const bearing = random() * 360;
      const range = 0.2 + random() * 0.7;
      const radius = range * 46;
      const radians = THREE.MathUtils.degToRad(bearing);
      element.style.left = `${50 + Math.sin(radians) * radius}%`;
      element.style.top = `${50 - Math.cos(radians) * radius}%`;
      this.contacts.push({ element, bearing, team: spec.team, visibleUntil: -1 });
    }

    this.updateContactLabels();
    this.visibleCount = -1;
    this.updateReadout(0);
  }

  updateContactLabels() {
    for (const contact of this.contacts) {
      contact.element.textContent = t(contact.team === 'friendly' ? 'radar.friendlyCode' : 'radar.hostileCode');
    }
  }

  update(dt) {
    this.elapsed += dt;
    this.angle = THREE.MathUtils.euclideanModulo(this.angle + dt * 360 / this.scanSeconds, 360);
    if (this.sweep) this.sweep.style.transform = `rotate(${this.angle}deg)`;
    const beamTolerance = 1.6 + dt * 180 / this.scanSeconds;
    let visibleCount = 0;

    for (const contact of this.contacts) {
      const angularError = THREE.MathUtils.euclideanModulo(this.angle - contact.bearing + 180, 360) - 180;
      if (Math.abs(angularError) <= beamTolerance) contact.visibleUntil = this.elapsed + 1.15;
      const remaining = contact.visibleUntil - this.elapsed;
      const opacity = remaining > 0 ? Math.min(1, remaining / .55) : 0;
      contact.element.style.opacity = String(opacity);
      contact.element.classList.toggle('detected', opacity > .05);
      if (opacity > .05) visibleCount++;
    }

    this.updateReadout(visibleCount);
  }

  updateReadout(visibleCount) {
    if (visibleCount === this.visibleCount || !this.readout) return;
    this.visibleCount = visibleCount;
    this.readout.textContent = t('menu.echoTrack', {
      detected: String(visibleCount).padStart(2, '0'),
      total: String(this.contacts.length).padStart(2, '0'),
    });
  }

  dispose() {
    document.removeEventListener('ilmatila:languagechange', this.onLanguageChange);
    for (const contact of this.contacts) contact.element.remove();
    this.contacts.length = 0;
  }
}
