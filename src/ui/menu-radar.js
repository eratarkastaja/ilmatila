import * as THREE from 'three';
import { getAircraftEdgeMargin, planAirFormation } from '../combat/air-combat-utils.js';
import { t } from './i18n.js';

const AIR_RADAR_RANGE = 27000;
const RADAR_RADIUS_PERCENT = 43;
const FRIENDLY_MIN_RADIUS_PERCENT = 5;
const CONTACT_PULSE_SECONDS = 0.72;
const DEFAULT_MISSION = { hostiles: 4, wingmen: 2 };

function sweepCrossesContact(contactBearing, previousAngle, sweptDegrees) {
  if (sweptDegrees <= 0) return false;
  if (sweptDegrees >= 360) return true;
  const bearingFromSweepStart = THREE.MathUtils.euclideanModulo(contactBearing - previousAngle, 360);
  return bearingFromSweepStart <= sweptDegrees;
}

function addFormationContacts(contacts, positions, team, origin, heading, { reinforcement = false } = {}) {
  for (const position of positions) {
    const dx = position.x - origin.x;
    const dz = position.z - origin.z;
    const range = Math.hypot(dx, dz);
    const bearing = Math.atan2(dx, dz) - heading;
    const radius = Math.min(range / AIR_RADAR_RANGE, 1) * RADAR_RADIUS_PERCENT;
    // Wingmen are only a few hundred metres from ownship and overlap its symbol
    // at radar scale; preserve their true aft bearings with a small display floor.
    const displayRadius = team === 'friendly'
      ? Math.max(radius, FRIENDLY_MIN_RADIUS_PERCENT)
      : radius;
    contacts.push({
      bearing,
      range,
      team,
      domain: 'air',
      position,
      reinforcement,
      left: 50 - Math.sin(bearing) * displayRadius,
      top: 50 - Math.cos(bearing) * displayRadius,
    });
  }
}

function formationPositions(origin, forward, right, terrain, {
  count,
  requestedDistance,
  minimumDistance,
  lateralSpacing,
  forwardLaneSpacing = 0,
  margin,
}) {
  if (count <= 0) return [];
  return planAirFormation({
    origin,
    forward,
    right,
    terrain,
    count,
    requestedDistance,
    minimumDistance,
    lateralSpacing,
    forwardLaneSpacing,
    margin,
  }).positions;
}

function getScenarioContacts(missionResolution, terrain, origin, heading) {
  const mission = { ...DEFAULT_MISSION, ...missionResolution.mission };
  const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
  const right = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
  const spawnMargin = Math.min(getAircraftEdgeMargin({ terrain }), 1200);
  const contacts = [];

  for (let index = 0; index < (mission.wingmen ?? 0); index++) {
    const wing = index === 0 ? -1 : 1;
    const position = origin.clone()
      .addScaledVector(right, wing * 230)
      .addScaledVector(forward, -300);
    addFormationContacts(contacts, [position], 'friendly', origin, heading);
  }

  const hostilePositions = formationPositions(origin, forward, right, terrain, {
    count: mission.hostiles ?? 0,
    requestedDistance: mission.hostileSpawnDistance ?? 12000,
    minimumDistance: mission.hostileMinimumSpawnDistance ?? 10000,
    lateralSpacing: mission.hostileLateralSpacing ?? 560,
    forwardLaneSpacing: 90,
    margin: spawnMargin,
  });
  addFormationContacts(contacts, hostilePositions, 'hostile', origin, heading);

  const helicopterPositions = formationPositions(origin, forward, right, terrain, {
    count: mission.hostileHelicopters ?? 0,
    requestedDistance: mission.hostileHelicopterSpawnDistance ?? 9500,
    minimumDistance: mission.hostileHelicopterMinimumSpawnDistance ?? 8500,
    lateralSpacing: mission.hostileHelicopterLateralSpacing ?? 850,
    margin: spawnMargin,
  });
  addFormationContacts(contacts, helicopterPositions, 'hostile', origin, heading);

  for (const encounter of missionResolution.encounters ?? []) {
    if (!encounter.scheduled || !encounter.response) continue;
    const response = encounter.response;
    const encounterHeading = THREE.MathUtils.degToRad(response.bearingDegrees ?? 0);
    const encounterForward = new THREE.Vector3(Math.sin(encounterHeading), 0, Math.cos(encounterHeading));
    const encounterRight = new THREE.Vector3(Math.cos(encounterHeading), 0, -Math.sin(encounterHeading));
    const encounterPositions = formationPositions(origin, encounterForward, encounterRight, terrain, {
      count: response.hostiles,
      requestedDistance: response.spawnDistance ?? mission.hostileSpawnDistance ?? 12000,
      minimumDistance: response.minimumSpawnDistance ?? mission.hostileMinimumSpawnDistance ?? 10000,
      lateralSpacing: response.lateralSpacing ?? mission.hostileLateralSpacing ?? 560,
      forwardLaneSpacing: 90,
      margin: spawnMargin,
    });
    addFormationContacts(contacts, encounterPositions, 'hostile', origin, heading, { reinforcement: true });
  }

  return contacts;
}

/** Heading-up preview of the selected sortie's authored air formations. */
export class MenuRadar {
  constructor({ reducedMotion = false } = {}) {
    this.scope = document.querySelector('.radar-scope');
    this.sweep = document.querySelector('.grid-sweep');
    this.readout = document.querySelector('.radar-readout');
    this.scanSeconds = reducedMotion ? 24 : 9;
    this.angle = 0;
    this.elapsed = 0;
    this.visibleCount = -1;
    this.detectedCount = 0;
    this.missionId = null;
    this.seed = null;
    this.contacts = [];

    this.onLanguageChange = () => {
      this.updateContactLabels();
      this.visibleCount = -1;
      this.updateReadout(this.detectedCount);
    };
    document.addEventListener('ilmatila:languagechange', this.onLanguageChange);
  }

  setScenario(missionResolution, { seed, terrain, origin = new THREE.Vector3(), heading = 0 } = {}) {
    if (!missionResolution?.mission || !this.scope) return;
    for (const contact of this.contacts) contact.element.remove();
    this.contacts.length = 0;
    this.missionId = missionResolution.mission.id;
    this.seed = seed === undefined ? null : Number(seed) >>> 0;

    for (const contact of getScenarioContacts(missionResolution, terrain, origin, heading)) {
      const element = document.createElement('b');
      element.className = `grid-contact contact-${contact.team} contact-air${contact.reinforcement ? ' contact-reinforcement' : ''}`;
      element.style.left = `${contact.left}%`;
      element.style.top = `${contact.top}%`;
      this.scope.append(element);
      contact.element = element;
      contact.scanBearing = THREE.MathUtils.euclideanModulo(-THREE.MathUtils.radToDeg(contact.bearing), 360);
      contact.detectedUntil = -Infinity;
      contact.detected = false;
      this.contacts.push(contact);
    }

    this.updateContactLabels();
    this.visibleCount = -1;
    this.detectedCount = 0;
    this.updateReadout(0);
  }

  updateContactLabels() {
    for (const contact of this.contacts) {
      contact.element.textContent = t(contact.team === 'friendly' ? 'radar.friendlyCode' : 'radar.hostileCode');
    }
  }

  update(dt) {
    const sweptDegrees = Math.max(0, dt * 360 / this.scanSeconds);
    const previousAngle = this.angle;
    this.angle = THREE.MathUtils.euclideanModulo(previousAngle + sweptDegrees, 360);
    if (this.sweep) this.sweep.style.transform = `rotate(${this.angle}deg)`;
    this.elapsed += Math.max(0, dt);

    let detectedCount = 0;
    for (const contact of this.contacts) {
      if (sweepCrossesContact(contact.scanBearing, previousAngle, sweptDegrees)) {
        contact.detectedUntil = this.elapsed + CONTACT_PULSE_SECONDS;
      }
      const detected = this.elapsed < contact.detectedUntil;
      if (detected !== contact.detected) {
        contact.detected = detected;
        contact.element.classList.toggle('detected', detected);
      }
      if (detected) detectedCount++;
    }
    this.detectedCount = detectedCount;
    this.updateReadout(detectedCount);
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
