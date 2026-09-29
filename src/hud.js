import * as THREE from 'three';
import { formatNumber, t } from './i18n.js';

const wrapHeading = degrees => THREE.MathUtils.euclideanModulo(degrees, 360);

export class TacticalHud {
  constructor() {
    this.headingTicks = document.querySelector('#heading-ticks');
    this.headingMarks = [];
    this.targetDesignator = document.querySelector('#target-designator');
    this.targetCode = this.targetDesignator?.querySelector('#target-code');
    this.verticalSpeed = document.querySelector('#vertical-speed');
    this.lastLabeledHeading = null;

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

  update(controls, player, camera, combat, verticalSpeedMps) {
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

    const target = combat.target;
    if (!target || target.dead) {
      if (this.targetDesignator) this.targetDesignator.hidden = true;
      return;
    }
    const targetPosition = target.mesh.position.clone();
    if (combat.targetDomain === 'ground') targetPosition.y += (target.mesh.userData.vehicleSpec?.totalHeight ?? 2.5) * 0.5;
    const visible = this.placeWorldMarker(this.targetDesignator, targetPosition, camera);
    if (visible) {
      const range = targetPosition.distanceTo(player.position);
      const rangeText = range >= 1000
        ? `${formatNumber(range / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KM`
        : `${formatNumber(Math.round(range))} M`;
      const groundTarget = combat.targetDomain === 'ground';
      const targetType = t(groundTarget ? 'combat.targetGround' : 'combat.targetAir');
      const platform = target.mesh.userData.platformName ?? target.label;
      if (this.targetCode) this.targetCode.textContent = platform ? `${targetType} · ${platform}` : targetType;
      const label = this.targetDesignator.querySelector('small');
      const lockText = combat.lock > 0.96
        ? t('combat.locked')
        : t('combat.locking', { percent: Math.round(combat.lock * 100) });
      if (label) label.textContent = `${lockText} · ${rangeText}`;
      this.targetDesignator.classList.toggle('ground-target', groundTarget);
      this.targetDesignator.classList.toggle('locked', combat.lock > 0.96);
    }
  }

  placeWorldMarker(element, position, camera) {
    if (!element) return false;
    camera.updateMatrixWorld();
    const projected = position.project(camera);
    const visible = projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) < 1.12 && Math.abs(projected.y) < 1.12;
    element.hidden = !visible;
    if (visible) {
      element.style.left = `${(projected.x * 0.5 + 0.5) * innerWidth}px`;
      element.style.top = `${(-projected.y * 0.5 + 0.5) * innerHeight}px`;
    }
    return visible;
  }
}
