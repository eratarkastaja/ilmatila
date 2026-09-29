import * as THREE from 'three';
import { t } from '../i18n.js';

/** Owns radar contacts, search mode and the arcade-friendly weapon lock cue. */
export class CombatRadar {
  constructor(player, audio) {
    this.player = player;
    this.audio = audio;
    this.mode = 'air';
    this.airRange = 8500;
    this.groundRange = 6000;
    this.range = this.airRange;
    this.groundLockRange = 5200;
    this.target = null;
    this.targetDomain = null;
    this.lock = 0;
    this.inLockEnvelope = false;
    this.lockCueTarget = false;
    this.lockCueConfirmed = false;
    this.tracks = new Map();
    this.screen = document.querySelector('.radar-screen');
    this.ownship = this.screen?.querySelector('.ownship');
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
      } else if (track.node) {
        // Let a lost return decay instead of lingering at full strength.
        track.node.style.opacity = String(1 - track.age / 1.4);
      }
    }

    const contacts = this.mode === 'ground'
      ? [...this.liveContacts(groundFriendly, 'friendly', 'ground'), ...this.liveContacts(groundHostile, 'hostile', 'ground')]
      : [...this.liveContacts(airFriendly, 'friendly', 'air'), ...this.liveContacts(airHostile, 'hostile', 'air')];
    if (this.ownship) this.ownship.style.setProperty('--ownship-heading', `${THREE.MathUtils.radToDeg(playerHeading)}deg`);

    for (const contact of contacts) {
      const delta = contact.mesh.position.clone().sub(this.player.position);
      const distance = delta.length();
      if (distance > this.range) continue;
      // Keep the display north-up so contacts do not sweep across the screen
      // opposite to a turn. The ownship symbol carries the aircraft heading.
      const bearing = Math.atan2(delta.x, delta.z);
      let track = this.tracks.get(contact.mesh);
      if (!track) {
        track = { age: 0, node: document.createElement('span') };
        this.screen?.append(track.node);
        this.tracks.set(contact.mesh, track);
      }
      track.age = 0;
      track.domain = contact.domain;
      track.team = contact.team;
      const selected = this.target?.mesh === contact.mesh;
      track.node.className = ['radar-contact', contact.domain, contact.team, selected ? 'target' : '', selected && this.lockCueConfirmed ? 'locked' : ''].filter(Boolean).join(' ');
      const radius = THREE.MathUtils.clamp(distance / this.range, 0, 1) * 43;
      track.node.style.left = `${50 + Math.sin(bearing) * radius}%`;
      track.node.style.top = `${50 - Math.cos(bearing) * radius}%`;
      track.node.style.opacity = '1';
    }
  }

  cycleTarget(enemies, groundHostiles) {
    const groundMode = this.mode === 'ground';
    const candidates = (groundMode ? groundHostiles : enemies).filter(contact => {
      if (contact.dead || !this.tracks.has(contact.mesh)) return false;
      return contact.mesh.position.distanceTo(this.player.position) <= this.range;
    });
    if (!candidates.length) return false;

    const currentIndex = candidates.indexOf(this.target);
    const next = candidates[(currentIndex + 1) % candidates.length];
    if (next !== this.target) {
      this.target = next;
      this.targetDomain = groundMode ? 'ground' : 'air';
      this.lock = 0;
      this.inLockEnvelope = false;
      this.lockCueTarget = false;
      this.lockCueConfirmed = false;
      this.crosshair?.classList.remove('locked', 'acquiring');
    }
    return true;
  }

  updateLock(dt, enemies, groundHostiles) {
    const groundMode = this.mode === 'ground';
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.player.quaternion);
    const candidates = groundMode ? groundHostiles : enemies;
    const maxRange = groundMode ? this.groundLockRange : this.airRange;
    const boresight = groundMode ? 0.55 : 0.88;
    let candidate = this.target;

    const tracked = contact => {
      if (contact.dead) return false;
      const offset = contact.mesh.position.clone().sub(this.player.position);
      const distance = offset.length();
      return this.tracks.has(contact.mesh) && distance <= this.range;
    };

    // Only the pilot may select a track. Keep it selected while it remains on
    // radar, even when it is outside the weapon's boresight.
    if (!candidate || !candidates.includes(candidate) || !tracked(candidate)) candidate = null;

    const targetChanged = candidate !== this.target;
    const hadTarget = this.lockCueTarget;
    const wasConfirmed = this.lockCueConfirmed && !targetChanged;
    if (targetChanged) this.lock = 0;
    this.target = candidate;
    const offset = candidate?.mesh.position.clone().sub(this.player.position);
    const distance = offset?.length() ?? Infinity;
    this.inLockEnvelope = Boolean(candidate && distance <= maxRange);
    const inBoresight = Boolean(this.inLockEnvelope && distance > 0 && forward.dot(offset.normalize()) > boresight);
    this.lock = THREE.MathUtils.damp(this.lock, inBoresight ? 1 : 0, inBoresight ? 2.8 : 4, dt);
    this.targetDomain = candidate ? (groundMode ? 'ground' : 'air') : null;
    const confirmed = Boolean(candidate && inBoresight && this.lock > 0.96);
    for (const track of this.tracks.values()) {
      track.node?.classList.toggle('locked', Boolean(confirmed && track.node.classList.contains('target')));
    }

    if (inBoresight && (!hadTarget || targetChanged)) this.audio?.playLockAcquire();
    if (!inBoresight && hadTarget) this.audio?.playLockLost();
    if (confirmed && !wasConfirmed) this.audio?.playLockReady();
    this.lockCueTarget = inBoresight;
    this.lockCueConfirmed = confirmed;
    this.crosshair?.classList.toggle('acquiring', Boolean(inBoresight && !confirmed));
    this.crosshair?.classList.toggle('locked', confirmed);
  }

  clearLock() {
    this.target = null;
    this.targetDomain = null;
    this.lock = 0;
    this.inLockEnvelope = false;
    this.lockCueTarget = false;
    this.lockCueConfirmed = false;
    this.crosshair?.classList.remove('locked', 'acquiring');
    for (const track of this.tracks.values()) track.node?.classList.remove('locked');
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
