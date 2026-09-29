import * as THREE from 'three';
import { estimateInterceptTime, GUN_PROJECTILE_LIFETIME, GUN_PROJECTILE_SPEED } from './combat/ballistics.js';
import { formatNumber, t } from './i18n.js';

const wrapHeading = degrees => THREE.MathUtils.euclideanModulo(degrees, 360);

export class TacticalHud {
  constructor() {
    this.headingTicks = document.querySelector('#heading-ticks');
    this.headingMarks = [];
    this.targetDesignator = document.querySelector('#target-designator');
    this.targetCode = this.targetDesignator?.querySelector('#target-code');
    this.gunAimCue = document.querySelector('#gun-aim-cue');
    this.verticalSpeed = document.querySelector('#vertical-speed');
    this.lastLabeledHeading = null;
    this.cameraForward = new THREE.Vector3();
    this.gunAimOffset = new THREE.Vector3();
    this.gunAimVelocity = new THREE.Vector3();
    this.gunAimPoint = new THREE.Vector3();
    this.smoothedGunAimPoint = new THREE.Vector3();
    this.gunAimTarget = null;
    this.hasGunAimPoint = false;

    // A sortie can be restarted without reloading the page; discard the old
    // tape marks so they do not stack over each other on later flights.
    this.headingTicks?.replaceChildren();
    for (let step = -12; step <= 12; step += 1) {
      const mark = document.createElement('i');
      mark.className = `heading-tick${step % 2 === 0 ? ' major' : ''}`;
      mark.dataset.step = String(step);
      if (step % 2 === 0) {
        const label = document.createElement('b');
        mark.append(label);
      }
      this.headingTicks?.append(mark);
      this.headingMarks.push(mark);
    }
  }

  update(controls, player, camera, combat, verticalSpeedMps, dt = 0) {
    const heading = wrapHeading(THREE.MathUtils.radToDeg(controls.heading));
    const baseHeading = Math.floor(heading / 5) * 5;
    const fraction = (heading - baseHeading) / 5;
    const labelHeading = baseHeading;
    for (const mark of this.headingMarks) {
      const step = Number(mark.dataset.step);
      mark.style.left = `calc(50% + ${(step - fraction) * 12}px)`;
      if (mark.firstElementChild && labelHeading !== this.lastLabeledHeading) {
        mark.firstElementChild.textContent = String(wrapHeading(baseHeading + step * 5)).padStart(3, '0');
      }
    }
    this.lastLabeledHeading = labelHeading;

    if (this.verticalSpeed) {
      const feetPerMinute = Math.round(verticalSpeedMps * 196.8504 / 100) * 100;
      const sign = feetPerMinute >= 0 ? '+' : '';
      this.verticalSpeed.textContent = `${sign}${String(feetPerMinute).padStart(4, '0')}`;
    }

    this.updateGunAimCue(player, camera, combat, dt);

    const radar = combat.radar;
    const target = radar.target;
    if (!target || target.dead) {
      if (this.targetDesignator) this.targetDesignator.hidden = true;
      return;
    }
    const targetPosition = target.mesh.position.clone();
    if (radar.targetDomain === 'ground') targetPosition.y += (target.mesh.userData.vehicleSpec?.totalHeight ?? 2.5) * 0.5;
    this.placeWorldMarker(this.targetDesignator, targetPosition, camera);
    const range = targetPosition.distanceTo(player.position);
    const rangeText = range >= 1000
      ? `${formatNumber(range / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KM`
      : `${formatNumber(Math.round(range))} M`;
    const groundTarget = radar.targetDomain === 'ground';
    const targetType = t(groundTarget ? 'combat.targetGround' : 'combat.targetAir');
    const platform = target.mesh.userData.platformName ?? target.label;
    const hostiles = (groundTarget ? combat.redUnits : combat.enemies)
      .filter(unit => !unit.dead && combat.radar.tracks.has(unit.mesh));
    const targetIndex = hostiles.indexOf(target);
    const targetNumber = targetIndex >= 0
      ? t('combat.targetNumber', { number: targetIndex + 1, total: hostiles.length })
      : targetType;
    if (this.targetCode) this.targetCode.textContent = platform ? `${targetNumber} · ${platform}` : targetNumber;
    const label = this.targetDesignator.querySelector('small');
    const lockText = !radar.inLockEnvelope
      ? t('combat.outOfRange')
      : radar.lockCueConfirmed
        ? t('combat.locked')
        : radar.lockCueTarget
          ? t('combat.locking', { percent: Math.round(radar.lock * 100) })
          : t('combat.aimAtSelected');
    if (label) label.textContent = `${lockText} · ${rangeText}`;
    this.targetDesignator.classList.toggle('ground-target', groundTarget);
    this.targetDesignator.classList.toggle('out-of-range', !radar.inLockEnvelope);
    this.targetDesignator.classList.toggle('acquiring', radar.lockCueTarget && !radar.lockCueConfirmed);
    this.targetDesignator.classList.toggle('locked', radar.lockCueConfirmed);
  }

  updateGunAimCue(player, camera, combat, dt) {
    const target = combat.radar.target;
    if (!this.gunAimCue || !target || target.dead || combat.radar.targetDomain !== 'air') {
      if (this.gunAimCue) this.gunAimCue.hidden = true;
      this.gunAimTarget = null;
      this.hasGunAimPoint = false;
      return;
    }

    this.gunAimOffset.copy(target.mesh.position).sub(player.position);
    this.gunAimVelocity.copy(target.velocity ?? new THREE.Vector3()).sub(combat.playerVelocity);
    const flightTime = estimateInterceptTime(this.gunAimOffset, this.gunAimVelocity, GUN_PROJECTILE_SPEED);
    if (flightTime <= 0 || flightTime > GUN_PROJECTILE_LIFETIME) {
      this.gunAimCue.hidden = true;
      this.gunAimTarget = null;
      this.hasGunAimPoint = false;
      return;
    }

    // The cue marks the direction to hold from the aircraft, accounting for
    // target motion and the aircraft's inherited velocity in the gun rounds.
    this.gunAimPoint.copy(player.position)
      .addScaledVector(this.gunAimOffset, 1)
      .addScaledVector(this.gunAimVelocity, flightTime);
    if (this.gunAimTarget !== target || !this.hasGunAimPoint) {
      this.smoothedGunAimPoint.copy(this.gunAimPoint);
      this.gunAimTarget = target;
      this.hasGunAimPoint = true;
    } else {
      this.smoothedGunAimPoint.lerp(this.gunAimPoint, 1 - Math.exp(-14 * dt));
    }

    const onScreen = this.placeWorldMarker(this.gunAimCue, this.smoothedGunAimPoint, camera);
    this.gunAimCue.hidden = !onScreen;
  }

  placeWorldMarker(element, position, camera) {
    if (!element) return false;
    camera.updateMatrixWorld();
    const projected = position.clone().project(camera);
    camera.getWorldDirection(this.cameraForward);
    const behind = position.clone().sub(camera.position).dot(this.cameraForward) <= 0;
    const marginX = Math.min(72, innerWidth * 0.18);
    const marginY = Math.min(80, innerHeight * 0.16);
    const maxX = 1 - marginX * 2 / innerWidth;
    const maxY = 1 - marginY * 2 / innerHeight;
    const onScreen = !behind && projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= maxX && Math.abs(projected.y) <= maxY;
    let x = behind ? -projected.x : projected.x;
    let y = behind ? -projected.y : projected.y;

    if (!onScreen) {
      if (Math.hypot(x, y) < 0.001) y = behind ? -1 : 1;
      const scale = Math.min(maxX / Math.max(Math.abs(x), 0.001), maxY / Math.max(Math.abs(y), 0.001));
      x *= scale;
      y *= scale;
      element.style.setProperty('--target-bearing', `${Math.atan2(-y, x)}rad`);
    } else {
      element.style.removeProperty('--target-bearing');
    }
    element.classList.toggle('offscreen', !onScreen);
    element.hidden = false;
    element.style.left = `${(x * 0.5 + 0.5) * innerWidth}px`;
    element.style.top = `${(-y * 0.5 + 0.5) * innerHeight}px`;
    return onScreen;
  }
}
