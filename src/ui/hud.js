import * as THREE from 'three';
import { F35_GUN_MUZZLE_OFFSET } from '../aircraft/plane-models.js';
import {
  estimateInterceptTime,
  GUN_PROJECTILE_GRAVITY,
  GUN_PROJECTILE_LIFETIME,
  GUN_PROJECTILE_SPEED,
} from '../combat/ballistics.js';
import { formatNumber, t } from './i18n.js';

const wrapHeading = degrees => THREE.MathUtils.euclideanModulo(degrees, 360);
const stationaryVelocity = new THREE.Vector3();
const MISSILE_CUE_FADE_SECONDS = 0.7;
const HUD_DETAIL_INTERVAL = 1 / 15;
const setTextIfChanged = (node, value) => {
  if (node && node.textContent !== value) node.textContent = value;
};
const setHiddenIfChanged = (node, hidden) => {
  if (node && node.hidden !== hidden) node.hidden = hidden;
};
const setClassIfChanged = (node, className, enabled) => {
  if (node && node.classList.contains(className) !== Boolean(enabled)) {
    node.classList.toggle(className, Boolean(enabled));
  }
};
const setStylePropertyIfChanged = (node, property, value) => {
  if (node && node.style.getPropertyValue(property) !== value) node.style.setProperty(property, value);
};

export class TacticalHud {
  constructor() {
    this.headingTicks = document.querySelector('#heading-ticks');
    this.headingMarks = [];
    this.targetDesignator = document.querySelector('#target-designator');
    this.targetCode = this.targetDesignator?.querySelector('#target-code');
    this.targetLabel = this.targetDesignator?.querySelector('small');
    this.selectedTrackPanel = document.querySelector('#selected-track-panel');
    this.selectedTrackState = document.querySelector('#selected-track-state');
    this.selectedTrackName = document.querySelector('#selected-track-name');
    this.selectedTrackType = document.querySelector('#selected-track-type');
    this.selectedTrackRange = document.querySelector('#selected-track-range');
    this.targetWorldPosition = new THREE.Vector3();
    this.missileApproachCue = document.querySelector('#missile-approach-cue');
    this.missileCueActive = false;
    this.missileCueFadeRemaining = 0;
    this.gunAimCue = document.querySelector('#gun-aim-cue');
    this.missionWaypointCue = document.querySelector('#mission-waypoint-cue');
    this.verticalSpeed = document.querySelector('#vertical-speed');
    this.lastLabeledHeading = null;
    this.detailUpdateElapsed = HUD_DETAIL_INTERVAL;
    this.lastDetailsTarget = null;
    this.cameraForward = new THREE.Vector3();
    this.gunMuzzlePosition = new THREE.Vector3();
    this.gunMuzzleOffset = new THREE.Vector3();
    this.gunAimOffset = new THREE.Vector3();
    this.gunAimVelocity = new THREE.Vector3();
    this.gunAimPoint = new THREE.Vector3();
    this.smoothedGunAimPoint = new THREE.Vector3();
    this.markerProjected = new THREE.Vector3();
    this.markerOffset = new THREE.Vector3();
    this.missileMarkerPosition = new THREE.Vector3();
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

  update(controls, player, camera, state, verticalSpeedMps, dt = 0) {
    this.detailUpdateElapsed += dt;
    const updateDetails = this.detailUpdateElapsed >= HUD_DETAIL_INTERVAL;
    if (updateDetails) this.detailUpdateElapsed %= HUD_DETAIL_INTERVAL;
    const heading = wrapHeading(THREE.MathUtils.radToDeg(controls.heading));
    const baseHeading = Math.floor(heading / 5) * 5;
    const fraction = (heading - baseHeading) / 5;
    const labelHeading = baseHeading;
    for (const mark of this.headingMarks) {
      const step = Number(mark.dataset.step);
      const left = `calc(50% + ${(step - fraction) * 12}px)`;
      if (mark.style.left !== left) mark.style.left = left;
      if (mark.firstElementChild && labelHeading !== this.lastLabeledHeading) {
        setTextIfChanged(mark.firstElementChild, String(wrapHeading(baseHeading + step * 5)).padStart(3, '0'));
      }
    }
    this.lastLabeledHeading = labelHeading;

    if (this.verticalSpeed && updateDetails) {
      const feetPerMinute = Math.round(verticalSpeedMps * 196.8504 / 100) * 100;
      const sign = feetPerMinute >= 0 ? '+' : '';
      setTextIfChanged(this.verticalSpeed, `${sign}${String(feetPerMinute).padStart(4, '0')}`);
    }

    this.updateGunAimCue(player, camera, state, dt);
    const waypoint = state.mission.waypoint;
    if (this.missionWaypointCue && waypoint) {
      this.placeWorldMarker(this.missionWaypointCue, waypoint, camera);
    } else if (this.missionWaypointCue) {
      setHiddenIfChanged(this.missionWaypointCue, true);
    }

    const missileThreat = state.threats.missile;
    const launchSourcePosition = state.threats.launchVisible ? state.threats.launchSourcePosition : null;
    const threatPosition = missileThreat?.mesh?.position ?? launchSourcePosition;
    if (this.missileApproachCue) {
      if (threatPosition && !state.session.destroyed) {
        this.placeWorldMarker(this.missileApproachCue, this.missileMarkerPosition.copy(threatPosition), camera);
        const eta = state.threats.missileEta;
        setClassIfChanged(this.missileApproachCue, 'urgent', Boolean(missileThreat && eta < 5.4));
        setClassIfChanged(this.missileApproachCue, 'launch-detected', !missileThreat);
        setClassIfChanged(this.missileApproachCue, 'visible', true);
        this.missileCueActive = true;
        this.missileCueFadeRemaining = 0;
      } else {
        if (this.missileCueActive) {
          this.missileCueActive = false;
          this.missileCueFadeRemaining = MISSILE_CUE_FADE_SECONDS;
          setClassIfChanged(this.missileApproachCue, 'visible', false);
          setClassIfChanged(this.missileApproachCue, 'urgent', false);
          setClassIfChanged(this.missileApproachCue, 'launch-detected', false);
        }
        if (this.missileCueFadeRemaining > 0) {
          this.missileCueFadeRemaining = Math.max(0, this.missileCueFadeRemaining - dt);
        }
        if (this.missileCueFadeRemaining === 0) setHiddenIfChanged(this.missileApproachCue, true);
      }
    }

    const radar = state.radar;
    const target = radar.target;
    if (!target || target.dead) {
      setHiddenIfChanged(this.targetDesignator, true);
      setHiddenIfChanged(this.selectedTrackPanel, true);
      this.lastDetailsTarget = null;
      return;
    }
    const refreshDetails = updateDetails || this.lastDetailsTarget !== target;
    this.lastDetailsTarget = target;
    const lastKnownBearing = !radar.targetInSensorRange && radar.hasLastKnownPosition;
    const targetPosition = this.targetWorldPosition.copy(
      lastKnownBearing ? radar.targetLastKnownPosition : target.mesh.position,
    );
    if (radar.targetDomain === 'ground') targetPosition.y += (target.mesh.userData.vehicleSpec?.totalHeight ?? 2.5) * 0.5;
    this.placeWorldMarker(this.targetDesignator, targetPosition, camera);
    const groundTarget = radar.targetDomain === 'ground';
    const trackState = !radar.targetInSensorRange
      ? 'hud.trackBearingOnly'
      : !radar.inLockEnvelope
        ? 'hud.trackOutOfEnvelope'
        : radar.lockCueConfirmed
          ? 'hud.trackLocked'
          : radar.lockCueTarget
            ? 'hud.trackAcquiring'
            : 'hud.trackSelected';
    if (this.selectedTrackPanel) {
      setHiddenIfChanged(this.selectedTrackPanel, false);
      setClassIfChanged(this.selectedTrackPanel, 'locked', radar.lockCueConfirmed);
      setClassIfChanged(this.selectedTrackPanel, 'acquiring', radar.lockCueTarget && !radar.lockCueConfirmed);
      setClassIfChanged(this.selectedTrackPanel, 'out-of-range', !radar.inLockEnvelope);
      setClassIfChanged(this.selectedTrackPanel, 'sensor-lost', !radar.targetInSensorRange);
      if (refreshDetails) {
        setStylePropertyIfChanged(this.selectedTrackPanel, '--track-progress', String(THREE.MathUtils.clamp(radar.lock, 0, 1)));
      }
    }
    if (this.selectedTrackState) {
      const text = t(trackState);
      setTextIfChanged(this.selectedTrackState, text);
    }
    setClassIfChanged(this.targetDesignator, 'ground-target', groundTarget);
    setClassIfChanged(this.targetDesignator, 'out-of-range', !radar.inLockEnvelope);
    setClassIfChanged(this.targetDesignator, 'sensor-lost', !radar.targetInSensorRange);
    setClassIfChanged(this.targetDesignator, 'acquiring', radar.lockCueTarget && !radar.lockCueConfirmed);
    setClassIfChanged(this.targetDesignator, 'locked', radar.lockCueConfirmed);
    if (refreshDetails) {
      const range = targetPosition.distanceTo(player.position);
      const rangeText = range >= 1000
        ? `${formatNumber(range / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KM`
        : `${formatNumber(Math.round(range))} M`;
      const targetType = t(groundTarget ? 'combat.targetGround' : 'combat.targetAir');
      const platform = target.mesh.userData.platformName ?? target.label;
      const hostiles = (groundTarget ? state.units.ground : state.units.air)
        .filter(unit => !unit.dead);
      const targetIndex = hostiles.indexOf(target);
      const targetNumber = targetIndex >= 0
        ? t('combat.targetNumber', { number: targetIndex + 1, total: hostiles.length })
        : targetType;
      setTextIfChanged(this.targetCode, platform ? `${targetNumber} · ${platform}` : targetNumber);
      setTextIfChanged(this.selectedTrackName, platform || targetNumber);
      setTextIfChanged(this.selectedTrackType, `${targetNumber} · ${targetType}`);
      setTextIfChanged(this.selectedTrackRange, rangeText);
      const lockText = !radar.targetInSensorRange
        ? t('combat.sensorContactLost')
        : !radar.inLockEnvelope
          ? t('combat.outOfRange')
          : radar.lockCueConfirmed
            ? t('combat.locked')
            : radar.lockCueTarget
              ? t('combat.locking', { percent: Math.round(radar.lock * 100) })
              : t('combat.aimAtSelected');
      setTextIfChanged(this.targetLabel, `${lockText} · ${rangeText}`);
      setStylePropertyIfChanged(this.targetDesignator, '--lock-progress', `${THREE.MathUtils.clamp(radar.lock, 0, 1) * 100}%`);
    }
  }

  updateGunAimCue(player, camera, state, dt) {
    const target = state.radar.target;
    const targetDomain = state.radar.targetDomain;
    const groundTarget = targetDomain === 'ground';
    if (!this.gunAimCue || !target || target.dead || (targetDomain !== 'air' && targetDomain !== 'ground')) {
      setHiddenIfChanged(this.gunAimCue, true);
      setClassIfChanged(this.gunAimCue, 'ground-aim', false);
      this.gunAimTarget = null;
      this.hasGunAimPoint = false;
      return;
    }

    this.gunMuzzlePosition.copy(player.position).add(
      this.gunMuzzleOffset.set(
        F35_GUN_MUZZLE_OFFSET.x,
        F35_GUN_MUZZLE_OFFSET.y,
        F35_GUN_MUZZLE_OFFSET.z,
      ).applyQuaternion(player.quaternion),
    );
    this.gunAimPoint.copy(target.mesh.position);
    if (groundTarget) this.gunAimPoint.y += (target.mesh.userData.vehicleSpec?.totalHeight ?? 2.5) * 0.55;
    this.gunAimOffset.copy(this.gunAimPoint).sub(this.gunMuzzlePosition);
    this.gunAimVelocity.copy(target.velocity ?? stationaryVelocity).sub(state.player.velocity);
    const flightTime = estimateInterceptTime(this.gunAimOffset, this.gunAimVelocity, GUN_PROJECTILE_SPEED);
    if (flightTime <= 0 || flightTime > GUN_PROJECTILE_LIFETIME) {
      setHiddenIfChanged(this.gunAimCue, true);
      setClassIfChanged(this.gunAimCue, 'ground-aim', false);
      this.gunAimTarget = null;
      this.hasGunAimPoint = false;
      return;
    }

    // The cue marks the direction to hold from the aircraft, accounting for
    // target motion and the aircraft's inherited velocity in the gun rounds.
    this.gunAimPoint.copy(this.gunMuzzlePosition)
      .addScaledVector(this.gunAimOffset, 1)
      .addScaledVector(this.gunAimVelocity, flightTime);
    this.gunAimPoint.y += 0.5 * GUN_PROJECTILE_GRAVITY * flightTime * flightTime;
    if (this.gunAimTarget !== target || !this.hasGunAimPoint) {
      this.smoothedGunAimPoint.copy(this.gunAimPoint);
      this.gunAimTarget = target;
      this.hasGunAimPoint = true;
    } else {
      this.smoothedGunAimPoint.lerp(this.gunAimPoint, 1 - Math.exp(-14 * dt));
    }

    const onScreen = this.placeWorldMarker(this.gunAimCue, this.smoothedGunAimPoint, camera);
    setHiddenIfChanged(this.gunAimCue, !onScreen);
    setClassIfChanged(this.gunAimCue, 'ground-aim', groundTarget);
  }

  placeWorldMarker(element, position, camera) {
    if (!element) return false;
    camera.updateMatrixWorld();
    const projected = this.markerProjected.copy(position).project(camera);
    camera.getWorldDirection(this.cameraForward);
    const behind = this.markerOffset.subVectors(position, camera.position).dot(this.cameraForward) <= 0;
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
      setStylePropertyIfChanged(element, '--target-bearing', `${Math.atan2(-y, x)}rad`);
    } else if (element.style.getPropertyValue('--target-bearing')) {
      element.style.removeProperty('--target-bearing');
    }
    setClassIfChanged(element, 'offscreen', !onScreen);
    setHiddenIfChanged(element, false);
    const left = `${(x * 0.5 + 0.5) * innerWidth}px`;
    const top = `${(-y * 0.5 + 0.5) * innerHeight}px`;
    if (element.style.left !== left) element.style.left = left;
    if (element.style.top !== top) element.style.top = top;
    return onScreen;
  }
}
