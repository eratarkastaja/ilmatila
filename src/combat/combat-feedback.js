import { t } from '../ui/i18n.js';

const TONE_PRIORITY = { info: 1, friendly: 2, success: 3, warning: 4, damage: 5 };

/** Owns short cockpit acknowledgements, hit cues and aircraft damage indication. */
export class CombatFeedback {
  constructor({ hud, message, hitMarker, hullFill, hullValue, countermeasureRow, maxHull = 100 } = {}) {
    this.hud = hud;
    this.message = message;
    this.hitMarker = hitMarker;
    this.hullFill = hullFill;
    this.hullValue = hullValue;
    this.countermeasureRow = countermeasureRow;
    this.messageTimer = 0;
    this.messageKey = null;
    this.messageParams = {};
    this.messageTone = 'info';
    this.hitTimer = 0;
    this.damageTimer = 0;
    this.countermeasureTimer = 0;
    this.damageToastCooldown = 0;
    this.maxHull = maxHull;
    this.hull = maxHull;
    this.renderHull();
  }

  notify(key, duration = 1.6, tone = 'info', params = {}) {
    if (this.messageTimer > 0 && (TONE_PRIORITY[tone] ?? 0) < (TONE_PRIORITY[this.messageTone] ?? 0)) return;
    this.messageKey = key;
    this.messageParams = params;
    this.messageTone = tone;
    this.messageTimer = duration;
    if (this.message) {
      this.message.hidden = false;
      this.message.dataset.tone = tone;
      const text = this.message.querySelector('b');
      if (text) text.textContent = t(key, params);
    }
  }

  gunHit(destroyed = false) {
    this.hitTimer = destroyed ? .48 : .2;
    this.hitMarker?.classList.toggle('kill', destroyed);
    if (this.hitMarker) this.hitMarker.hidden = false;
  }

  damage(amount) {
    this.hull = Math.max(0, this.hull - amount);
    this.renderHull();
    this.damageTimer = Math.max(this.damageTimer, amount >= 30 ? .72 : .38);
    this.hud?.classList.toggle('damage-critical', this.hull / this.maxHull <= .35);
    if (this.damageToastCooldown <= 0) {
      this.notify(amount >= 30 ? 'combat.damageHeavy' : 'combat.damageTaken', 1.15, 'damage');
      this.damageToastCooldown = .8;
    }
  }

  countermeasures(deployed, status, remaining) {
    this.countermeasureRow?.classList.remove('dispensed');
    if (deployed) {
      this.countermeasureRow?.classList.add('dispensed');
      this.countermeasureTimer = .42;
      this.notify('combat.countermeasuresDispensed', 1.25, 'friendly', { remaining });
    } else {
      const key = status === 'empty' ? 'combat.countermeasuresEmpty' : 'combat.countermeasuresRearming';
      this.notify(key, 1.35, 'warning');
    }
  }

  update(dt) {
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.damageTimer = Math.max(0, this.damageTimer - dt);
    this.countermeasureTimer = Math.max(0, this.countermeasureTimer - dt);
    this.damageToastCooldown = Math.max(0, this.damageToastCooldown - dt);
    if (this.message) this.message.hidden = this.messageTimer <= 0;
    if (this.hitMarker) this.hitMarker.hidden = this.hitTimer <= 0;
    this.hud?.classList.toggle('damage-hit', this.damageTimer > 0);
    if (this.countermeasureTimer <= 0) this.countermeasureRow?.classList.remove('dispensed');
  }

  refreshLanguage() {
    if (!this.message || !this.messageKey || this.messageTimer <= 0) return;
    const text = this.message.querySelector('b');
    if (text) text.textContent = t(this.messageKey, this.messageParams);
  }

  renderHull() {
    const percent = Math.round(100 * this.hull / this.maxHull);
    if (this.hullValue) this.hullValue.textContent = `${String(percent).padStart(3, '0')}%`;
    if (this.hullFill) {
      this.hullFill.style.transform = `scaleX(${percent / 100})`;
      this.hullFill.classList.toggle('critical', percent <= 35);
    }
  }

  dispose() {
    if (this.message) this.message.hidden = true;
    if (this.hitMarker) {
      this.hitMarker.hidden = true;
      this.hitMarker.classList.remove('kill');
    }
    this.hud?.classList.remove('damage-hit', 'damage-critical');
    this.countermeasureRow?.classList.remove('dispensed');
  }
}
