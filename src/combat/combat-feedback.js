import { t } from '../ui/i18n.js';

const TONE_PRIORITY = { info: 1, friendly: 2, success: 3, warning: 4, damage: 5 };
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

/** Owns short cockpit acknowledgements, hit cues and aircraft damage indication. */
export class CombatFeedback {
  constructor({ hud, message, hitMarker, hullFill, hullValue, countermeasureRows = {}, maxHull = 100 } = {}) {
    this.hud = hud;
    this.message = message;
    this.hitMarker = hitMarker;
    this.hullFill = hullFill;
    this.hullValue = hullValue;
    this.countermeasureRows = countermeasureRows;
    this.activeCountermeasureRow = null;
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
      setHiddenIfChanged(this.message, false);
      if (this.message.dataset.tone !== tone) this.message.dataset.tone = tone;
      const text = this.message.querySelector('b');
      setTextIfChanged(text, t(key, params));
    }
  }

  gunHit(destroyed = false) {
    this.hitTimer = destroyed ? .48 : .2;
    setClassIfChanged(this.hitMarker, 'kill', destroyed);
    setHiddenIfChanged(this.hitMarker, false);
  }

  damage(amount) {
    this.hull = Math.max(0, this.hull - amount);
    this.renderHull();
    this.damageTimer = Math.max(this.damageTimer, amount >= 30 ? .72 : .38);
    setClassIfChanged(this.hud, 'damage-critical', this.hull / this.maxHull <= .35);
    if (this.damageToastCooldown <= 0) {
      this.notify(amount >= 30 ? 'combat.damageHeavy' : 'combat.damageTaken', 1.15, 'damage');
      this.damageToastCooldown = .8;
    }
  }

  countermeasures(kind, deployed, status, remaining) {
    this.activeCountermeasureRow?.classList.remove('dispensed');
    this.activeCountermeasureRow = this.countermeasureRows[kind] ?? null;
    if (deployed) {
      this.activeCountermeasureRow?.classList.add('dispensed');
      this.countermeasureTimer = .42;
      this.notify(`combat.${kind}Dispensed`, 1.25, 'friendly', { remaining });
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
    setHiddenIfChanged(this.message, this.messageTimer <= 0);
    setHiddenIfChanged(this.hitMarker, this.hitTimer <= 0);
    setClassIfChanged(this.hud, 'damage-hit', this.damageTimer > 0);
    if (this.countermeasureTimer <= 0) {
      this.activeCountermeasureRow?.classList.remove('dispensed');
      this.activeCountermeasureRow = null;
    }
  }

  refreshLanguage() {
    if (!this.message || !this.messageKey || this.messageTimer <= 0) return;
    const text = this.message.querySelector('b');
    setTextIfChanged(text, t(this.messageKey, this.messageParams));
  }

  renderHull() {
    const percent = Math.round(100 * this.hull / this.maxHull);
    setTextIfChanged(this.hullValue, `${String(percent).padStart(3, '0')}%`);
    if (this.hullFill) {
      const transform = `scaleX(${percent / 100})`;
      if (this.hullFill.style.transform !== transform) this.hullFill.style.transform = transform;
      setClassIfChanged(this.hullFill, 'critical', percent <= 35);
    }
  }

  dispose() {
    if (this.message) this.message.hidden = true;
    if (this.hitMarker) {
      this.hitMarker.hidden = true;
      this.hitMarker.classList.remove('kill');
    }
    this.hud?.classList.remove('damage-hit', 'damage-critical');
    for (const row of Object.values(this.countermeasureRows)) row?.classList.remove('dispensed');
    this.activeCountermeasureRow = null;
  }
}
