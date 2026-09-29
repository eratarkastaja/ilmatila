import * as THREE from 'three';
import { t } from './i18n.js';

/** Decorative mission-theater radar used by the start menu. */
export class MenuRadar {
  constructor({ reducedMotion = false } = {}) {
    this.sweep = document.querySelector('.grid-sweep');
    this.readout = document.querySelector('.radar-readout');
    this.scanSeconds = reducedMotion ? 24 : 9;
    this.angle = 0;
    this.elapsed = 0;
    this.visibleCount = -1;
    this.contacts = [...document.querySelectorAll('.grid-contact')].map(element => {
      const bearing = Number(element.dataset.bearing);
      const range = Number(element.dataset.range);
      const radius = range * 46;
      const radians = THREE.MathUtils.degToRad(bearing);
      element.style.left = `${50 + Math.sin(radians) * radius}%`;
      element.style.top = `${50 - Math.cos(radians) * radius}%`;
      return { element, bearing, visibleUntil: -1 };
    });

    this.onLanguageChange = () => {
      this.visibleCount = -1;
      this.updateReadout(this.contacts.filter(contact => contact.visibleUntil > this.elapsed).length);
    };
    document.addEventListener('ilmatila:languagechange', this.onLanguageChange);
    this.updateReadout(0);
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
  }
}
