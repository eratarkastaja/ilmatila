import * as THREE from 'three';
import { t } from '../i18n.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Owns radar contacts, search mode and the arcade-friendly weapon lock cue. */
export class CombatRadar {
  constructor(player, audio) {
    this.player = player;
    this.audio = audio;
    this.mode = 'air';
    this.airRange = 2500;
    this.groundRange = 6000;
    this.range = this.airRange;
    this.groundLockRange = 5200;
    this.target = null;
    this.targetDomain = null;
    this.lock = 0;
    this.lockCueTarget = false;
    this.lockCueConfirmed = false;
    this.tracks = new Map();
    this.screen = document.querySelector('.radar-screen');
    this.modeIndicator = document.querySelector('#radar-mode-indicator');
    this.crosshair = document.querySelector('.crosshair');
    this.renderMode();
  }

  toggleMode() {
    this.mode = this.mode === 'air' ? 'ground' : 'air';
    this.audio?.playRadarMode(this.mode);
    this.range = this.mode === 'air' ? this.airRange : this.groundRange;
    this.clearTracks();
    if (this.mode === 'ground') this.clearLock();
    this.renderMode();
  }

  renderMode() {
    this.screen?.classList.toggle('ground-mode', this.mode === 'ground');
    if (this.modeIndicator) this.modeIndicator.textContent = t(this.mode === 'air' ? 'hud.airModeShort' : 'hud.groundModeShort');
  }

  updateContacts(dt, playerHeading, { airFriendly, airHostile, groundFriendly, groundHostile }) {
    for (const [key, track] of this.tracks) {
      track.age += dt;
      if (track.age > 1.4) {
        track.node?.remove();
        this.tracks.delete(key);
      }
    }

    const contacts = this.mode === 'ground'
      ? [...this.liveContacts(groundFriendly, 'friendly', 'ground'), ...this.liveContacts(groundHostile, 'hostile', 'ground')]
      : [...this.liveContacts(airFriendly, 'friendly', 'air'), ...this.liveContacts(airHostile, 'hostile', 'air')];
    const inverseHeading = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, -playerHeading);

    for (const contact of contacts) {
      const delta = contact.mesh.position.clone().sub(this.player.position);
      const distance = delta.length();
      if (distance > this.range) continue;
      const local = delta.applyQuaternion(inverseHeading);
      const bearing = Math.atan2(local.x, local.z);
      let track = this.tracks.get(contact.mesh);
      if (!track) {
        track = { age: 0, node: document.createElement('span') };
        this.screen?.append(track.node);
        this.tracks.set(contact.mesh, track);
      }
      track.age = 0;
      track.domain = contact.domain;
      track.team = contact.team;
      track.node.className = `radar-contact ${contact.domain} ${contact.team}${this.target?.mesh === contact.mesh ? ' target' : ''}`;
      const radius = THREE.MathUtils.clamp(distance / this.range, 0, 1) * 43;
      track.node.style.left = `${50 + Math.sin(bearing) * radius}%`;
      track.node.style.top = `${50 - Math.cos(bearing) * radius}%`;
      track.node.style.opacity = '1';
    }
  }

  updateLock(dt, enemies, groundHostiles) {
    const groundMode = this.mode === 'ground';
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.player.quaternion);
    const candidates = groundMode ? groundHostiles : enemies;
    const maxRange = groundMode ? this.groundLockRange : this.airRange;
    const boresight = groundMode ? 0.55 : 0.78;
    let candidate = null;
    let bestDistance = Infinity;

    for (const contact of candidates) {
      if (contact.dead) continue;
      const offset = contact.mesh.position.clone().sub(this.player.position);
      const distance = offset.length();
      if (this.tracks.has(contact.mesh) && distance < maxRange && forward.dot(offset.normalize()) > boresight && distance < bestDistance) {
        bestDistance = distance;
        candidate = contact;
      }
    }

    const targetChanged = candidate !== this.target;
    const hadTarget = this.lockCueTarget;
    const wasConfirmed = this.lockCueConfirmed && !targetChanged;
    if (targetChanged) this.lock = 0;
    this.target = candidate;
    this.lock = THREE.MathUtils.damp(this.lock, candidate ? 1 : 0, candidate ? 5.2 : 4, dt);
    this.targetDomain = candidate ? (groundMode ? 'ground' : 'air') : null;
    const confirmed = Boolean(candidate && this.lock > 0.96);

    if (candidate && (!hadTarget || targetChanged)) this.audio?.playLockAcquire();
    if (!candidate && hadTarget) this.audio?.playLockLost();
    if (confirmed && !wasConfirmed) this.audio?.playLockReady();
    this.lockCueTarget = Boolean(candidate);
    this.lockCueConfirmed = confirmed;
    this.crosshair?.classList.toggle('acquiring', Boolean(candidate && !confirmed));
    this.crosshair?.classList.toggle('locked', Boolean(candidate && this.lock > 0.96));
  }

  clearLock() {
    this.target = null;
    this.targetDomain = null;
    this.lock = 0;
    this.lockCueTarget = false;
    this.lockCueConfirmed = false;
    this.crosshair?.classList.remove('locked', 'acquiring');
  }

  clearTracks() {
    for (const track of this.tracks.values()) track.node?.remove();
    this.tracks.clear();
  }

  dispose() {
    this.clearTracks();
    this.clearLock();
    this.screen?.classList.remove('ground-mode');
    this.screen?.querySelectorAll('.radar-contact').forEach(node => node.remove());
  }

  liveContacts(units, team, domain) {
    return units.filter(unit => !unit.dead).map(unit => ({ mesh: unit.mesh, team, domain }));
  }
}
