import { MISSILE_PROFILES } from '../combat/projectiles.js';
import { formatNumber, t } from './i18n.js';

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

/** Renders the combat status read model without owning simulation state. */
export class CombatHud {
  constructor() {
    this.weapon = document.querySelector('#weapon');
    this.gunAmmoCount = document.querySelector('#gun-ammo-count');
    this.ammo = document.querySelector('#ammo');
    this.missileType = document.querySelector('#missile-type');
    this.missileCount = document.querySelector('#missile-count');
    this.score = document.querySelector('#score');
    this.flareCount = document.querySelector('#flare-count');
    this.chaffCount = document.querySelector('#chaff-count');
    this.wingmanOrder = document.querySelector('#wingman-order');
    this.radarWarning = document.querySelector('#radar-warning');
    this.radarWarningLabel = document.querySelector('#radar-warning-label');
    this.threatWarning = document.querySelector('#threat-warning');
    this.threatWarningLabel = document.querySelector('#threat-warning-label');
    this.threatWarningDetail = document.querySelector('#threat-warning-detail');
    this.boundaryWarning = document.querySelector('#boundary-warning');
    this.boundaryWarningText = document.querySelector('#boundary-warning-text');
    this.boundaryWarningDistance = document.querySelector('#boundary-warning-distance');
  }

  update(state) {
    const gunEmpty = state.weapons.gunAmmoRemaining === 0;
    setTextIfChanged(this.weapon, gunEmpty
      ? t('combat.noGunAmmo')
      : state.session.gunFiring ? t('combat.firing') : t('hud.readyShort'));
    setTextIfChanged(this.gunAmmoCount, state.weapons.gunAmmoRemaining === null
      ? '∞'
      : formatNumber(state.weapons.gunAmmoRemaining));
    setTextIfChanged(this.flareCount, String(state.countermeasures.flares).padStart(2, '0'));
    setTextIfChanged(this.chaffCount, String(state.countermeasures.chaff).padStart(2, '0'));
    setTextIfChanged(this.wingmanOrder, t(`combat.wingmanStatus.${state.wingmanOrder}`));

    const { radar, threats, weapons, mission } = state;
    if (this.radarWarning) {
      setHiddenIfChanged(this.radarWarning, state.session.destroyed || !threats.radarWarningState);
      if (threats.radarWarningState) {
        if (this.radarWarning.dataset.state !== threats.radarWarningState) {
          this.radarWarning.dataset.state = threats.radarWarningState;
        }
        setTextIfChanged(this.radarWarningLabel, t(`hud.radarWarning.${threats.radarWarningState}`));
      }
    }

    const threat = threats.missile;
    const launchVisible = threats.launchVisible;
    if (this.threatWarning) {
      setHiddenIfChanged(this.threatWarning, state.session.destroyed || (!threat && !launchVisible));
      setClassIfChanged(this.threatWarning, 'critical', Boolean(threat && threats.missileEta < 4.5));
      if (!this.threatWarning.hidden) {
        let warningKey = 'hud.missileLaunchDetected';
        const missileSeeker = threat?.seeker ?? (launchVisible ? threats.launchSeeker : null);
        const warningPhase = threat && threats.missileEta <= 8.5 ? 'Inbound' : 'LaunchDetected';
        if (missileSeeker === 'radar') warningKey = `hud.radarMissile${warningPhase}`;
        else if (missileSeeker === 'ir') warningKey = `hud.irMissile${warningPhase}`;
        else if (threat) warningKey = threats.missileEta <= 8.5 ? 'hud.missileInbound' : 'hud.missileLaunchDetected';
        setTextIfChanged(this.threatWarningLabel, t(warningKey));

        let detail = '';
        if (threat) {
          const distance = threats.missileDistance;
          const range = distance >= 1000
            ? `${formatNumber(distance / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KM`
            : `${formatNumber(Math.round(distance))} M`;
          detail = t('hud.missileThreatDetail', {
            range,
            seconds: Math.max(1, Math.ceil(threats.missileEta)),
          });
        } else if (launchVisible) {
          const distance = threats.launchSourcePosition.distanceTo(state.player.position);
          detail = t('hud.launchSourceDetail', {
            range: `${formatNumber(distance / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KM`,
          });
        }
        setTextIfChanged(this.threatWarningDetail, detail);
      }
    }

    if (this.boundaryWarning) {
      const approach = mission.boundaryApproach;
      const critical = mission.boundaryCritical;
      setHiddenIfChanged(this.boundaryWarning, state.session.destroyed || !approach);
      setClassIfChanged(this.boundaryWarning, 'critical', critical);
      if (!this.boundaryWarning.hidden && this.boundaryWarningText) {
        setTextIfChanged(this.boundaryWarningText, t(critical ? 'hud.boundaryCritical' : 'hud.boundaryWarning'));
        if (this.boundaryWarningDistance) {
          const distanceText = `${formatNumber(approach.clearance / 1000, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })} KM`;
          setTextIfChanged(this.boundaryWarningDistance, distanceText);
        }
      }
    }

    if (this.ammo) {
      let seeker;
      if (weapons.feedbackTimer > 0 && weapons.feedbackKey) seeker = t(weapons.feedbackKey);
      else if (weapons.missiles[radar.mode] <= 0) seeker = t('combat.noMissiles');
      else if (weapons.cooldown > 0) {
        seeker = t('combat.cooling', {
          seconds: formatNumber(weapons.cooldown, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        });
      } else if (radar.target && !radar.targetInSensorRange) seeker = t('combat.sensorContactLost');
      else if (radar.target && !radar.inLockEnvelope) seeker = t('combat.outOfRange');
      else if (radar.target && radar.lockCueConfirmed) seeker = t('combat.locked');
      else if (radar.target && radar.lockCueTarget) seeker = t('combat.locking', { percent: Math.round(radar.lock * 100) });
      else if (radar.target) seeker = t('combat.aimAtSelected');
      else seeker = t(radar.mode === 'ground' ? 'combat.searchGround' : 'combat.searchAir');
      setTextIfChanged(this.ammo, seeker);
      const acquiring = Boolean(radar.target && radar.inLockEnvelope && radar.lockCueTarget && !radar.lockCueConfirmed);
      const locked = Boolean(radar.target && radar.lockCueConfirmed);
      setClassIfChanged(this.ammo, 'acquiring', acquiring);
      setClassIfChanged(this.ammo, 'locked', locked);
      setClassIfChanged(this.ammo, 'out-of-range', Boolean(radar.target && !radar.inLockEnvelope));
      setClassIfChanged(this.ammo, 'sensor-lost', Boolean(radar.target && !radar.targetInSensorRange));
      setClassIfChanged(this.ammo, 'ground-target', radar.targetDomain === 'ground');
    }

    const profile = radar.mode === 'ground' ? MISSILE_PROFILES.playerGround : MISSILE_PROFILES.playerAir;
    setTextIfChanged(this.missileType, profile.designation);
    setTextIfChanged(this.missileCount, String(weapons.missiles[radar.mode]).padStart(2, '0'));
    setTextIfChanged(this.score, String(state.score).padStart(5, '0'));
  }

  hideRadarAndBoundaryWarnings() {
    setHiddenIfChanged(this.radarWarning, true);
    setHiddenIfChanged(this.boundaryWarning, true);
  }

  hideWarnings() {
    this.hideRadarAndBoundaryWarnings();
    setHiddenIfChanged(this.threatWarning, true);
  }

  dispose() {
    this.hideWarnings();
  }
}
