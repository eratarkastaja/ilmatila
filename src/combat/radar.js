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
    this.screen?.classList.toggle('ground-mode', this.mode === 'ground');
    if (this.modeIndicator) this.modeIndicator.textContent = t(this.mode === 'air' ? 'hud.airModeShort' : 'hud.groundModeShort');
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
    const forward = this._forward.set(0,0,1).applyQuaternion(this.player.quaternion);
    const candidates = groundMode ? groundHostiles : enemies;
    const maxRange = groundMode ? this.groundLockRange : this.airRange;
    const boresight = groundMode ? 0.55 : 0.88;
    let candidate = this.target;

    // Only the pilot may select a track. Keep it selected while it remains on
    // radar, even when it is outside the weapon's boresight.
    if (!candidate || candidate.dead || !candidates.includes(candidate)
      || !this.tracks.has(candidate.mesh)
      || candidate.mesh.position.distanceTo(this.player.position)>this.range) candidate = null;

    const targetChanged = candidate !== this.target;
    const hadTarget = this.lockCueTarget;
    const wasConfirmed = this.lockCueConfirmed && !targetChanged;
    if (targetChanged) this.lock = 0;
    this.target = candidate;
    const offset = candidate ? this._lockOffset.copy(candidate.mesh.position).sub(this.player.position) : null;
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

}
