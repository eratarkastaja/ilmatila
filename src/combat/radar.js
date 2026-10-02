import * as THREE from 'three';
import { t } from '../ui/i18n.js';
import { MISSILE_PROFILES } from './projectiles.js';

const setClassIfChanged = (node, className, enabled) => {
  if (node && node.classList.contains(className) !== Boolean(enabled)) {
    node.classList.toggle(className, Boolean(enabled));
  }
};

/** Owns radar contacts, search mode and the arcade-friendly weapon lock cue. */
export class CombatRadar {
  constructor(player, audio) {
    this.player = player;
    this.audio = audio;
    this.mode = 'air';
    // Search sensors reach beyond the weapon envelopes, while launch ranges
    // stay in sync with the missile profiles.
    this.airRange = 27000;
    this.airLockRange = MISSILE_PROFILES.playerAir.maxLaunchRange;
    this.groundRange = 11000;
    this.range = this.airRange;
    this.groundLockRange = MISSILE_PROFILES.playerGround.maxLaunchRange;
    this.target = null;
    this.targetDomain = null;
    this.targetLastKnownPosition = new THREE.Vector3();
    this.hasLastKnownPosition = false;
    this.lock = 0;
    this.inLockEnvelope = false;
    this.targetInSensorRange = false;
    this.lockCueTarget = false;
    this.lockCueConfirmed = false;
    this.tracks = new Map();
    this._delta = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._lockOffset = new THREE.Vector3();
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
    setClassIfChanged(this.screen, 'ground-mode', this.mode === 'ground');
    const modeText = t(this.mode === 'air' ? 'hud.airModeShort' : 'hud.groundModeShort');
    if (this.modeIndicator && this.modeIndicator.textContent !== modeText) this.modeIndicator.textContent = modeText;
  }

  updateContacts(dt, playerHeading, { airFriendly, airHostile, groundFriendly, groundHostile }) {
    this.playerHeading=playerHeading;
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

    if(this.mode==='ground'){
      this.updateContactList(groundFriendly,'friendly','ground');
      this.updateContactList(groundHostile,'hostile','ground');
    }else{
      this.updateContactList(airFriendly,'friendly','air');
      this.updateContactList(airHostile,'hostile','air');
    }
  }

  updateContactList(units,team,domain){
    for(const unit of units){
      if(unit.dead)continue;
      const mesh=unit.mesh;
      const delta = this._delta.copy(mesh.position).sub(this.player.position);
      const distance = delta.length();
      if (distance > this.range) continue;
      // Keep the aircraft nose fixed at the top of the scope. Contacts rotate
      // around ownship with heading so the display reads as a heading-up radar.
      const bearing = Math.atan2(delta.x, delta.z) - this.playerHeading;
      let track = this.tracks.get(mesh);
      if (!track) {
        track = { age: 0, node: document.createElement('span') };
        this.screen?.append(track.node);
        this.tracks.set(mesh, track);
      }
      track.age = 0;
      track.domain = domain;
      track.team = team;
      if (this.target?.mesh === mesh) {
        this.targetLastKnownPosition.copy(mesh.position);
        this.hasLastKnownPosition = true;
      }
      const selected = this.target?.mesh === mesh;
      const className = selected
        ? `radar-contact ${domain} ${team}${this.lockCueConfirmed ? ' target locked' : ' target'}`
        : `radar-contact ${domain} ${team}`;
      if(track.node.className!==className)track.node.className=className;
      const radius = THREE.MathUtils.clamp(distance / this.range, 0, 1) * 43;
      track.node.style.left = `${50 - Math.sin(bearing) * radius}%`;
      track.node.style.top = `${50 - Math.cos(bearing) * radius}%`;
      if(track.node.style.opacity!=='1')track.node.style.opacity = '1';
    }
  }

  cycleTarget(enemies, groundHostiles, direction = 1) {
    const groundMode = this.mode === 'ground';
    const candidates = (groundMode ? groundHostiles : enemies).filter(contact => {
      if (contact.dead || !this.tracks.has(contact.mesh)) return false;
      return contact.mesh.position.distanceTo(this.player.position) <= this.range;
    });
    if (!candidates.length) return false;

    const currentIndex = candidates.indexOf(this.target);
    const step = direction < 0 ? -1 : 1;
    const nextIndex = currentIndex < 0
      ? (step > 0 ? 0 : candidates.length - 1)
      : THREE.MathUtils.euclideanModulo(currentIndex + step, candidates.length);
    const next = candidates[nextIndex];
    if (next !== this.target) {
      this.target = next;
      this.targetDomain = groundMode ? 'ground' : 'air';
      this.targetLastKnownPosition.copy(next.mesh.position);
      this.hasLastKnownPosition = true;
      this.lock = 0;
      this.inLockEnvelope = false;
      this.targetInSensorRange = true;
      this.lockCueTarget = false;
      this.lockCueConfirmed = false;
      this.crosshair?.classList.remove('locked', 'acquiring');
    }
    return true;
  }

  updateLock(dt, enemies, groundHostiles) {
    const groundMode = this.mode === 'ground';
    const forward = this._forward.set(0,0,1).applyQuaternion(this.player.quaternion);
    const candidates = groundMode ? groundHostiles : enemies;
    const maxRange = groundMode ? this.groundLockRange : this.airLockRange;
    const boresight = groundMode ? 0.55 : 0.88;
    let candidate = this.target;

    // Keep the pilot's selection after contact loss so the HUD can show its
    // bearing. It remains ineligible for weapon lock outside sensor range.
    if (!candidate || candidate.dead || !candidates.includes(candidate)) candidate = null;

    const targetChanged = candidate !== this.target;
    const hadTarget = this.lockCueTarget;
    const wasConfirmed = this.lockCueConfirmed && !targetChanged;
    if (targetChanged) this.lock = 0;
    this.target = candidate;
    if (!candidate) this.hasLastKnownPosition = false;
    const offset = candidate ? this._lockOffset.copy(candidate.mesh.position).sub(this.player.position) : null;
    const distance = offset?.length() ?? Infinity;
    this.targetInSensorRange = Boolean(candidate && distance <= this.range);
    this.inLockEnvelope = Boolean(candidate && this.targetInSensorRange && distance <= maxRange);
    const inBoresight = Boolean(this.inLockEnvelope && distance > 0 && forward.dot(offset.normalize()) > boresight);
    this.lock = THREE.MathUtils.damp(this.lock, inBoresight ? 1 : 0, inBoresight ? 2.8 : 4, dt);
    this.targetDomain = candidate ? (groundMode ? 'ground' : 'air') : null;
    const confirmed = Boolean(candidate && inBoresight && this.lock > 0.96);
    for (const track of this.tracks.values()) {
      setClassIfChanged(track.node, 'locked', Boolean(confirmed && track.node?.classList.contains('target')));
    }

    if (inBoresight && (!hadTarget || targetChanged)) this.audio?.playLockAcquire();
    if (!inBoresight && hadTarget) this.audio?.playLockLost();
    if (confirmed && !wasConfirmed) this.audio?.playLockReady();
    this.lockCueTarget = inBoresight;
    this.lockCueConfirmed = confirmed;
    setClassIfChanged(this.crosshair, 'acquiring', Boolean(inBoresight && !confirmed));
    setClassIfChanged(this.crosshair, 'locked', confirmed);
  }

  clearLock() {
    this.target = null;
    this.targetDomain = null;
    this.hasLastKnownPosition = false;
    this.lock = 0;
    this.inLockEnvelope = false;
    this.targetInSensorRange = false;
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

}
