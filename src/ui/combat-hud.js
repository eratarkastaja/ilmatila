import { getPlayerMissileProfile } from '../combat/projectiles.js';
import { formatNumber, t } from './i18n.js';
import { formatTimeOfDay } from '../combat/weather.js';

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

function optionalResultParams(params = {}) {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [
    key,
    key === 'target' ? (value ? t(value) : t('mission.optionalObjective.target.generic')) : value,
  ]));
}

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
    this.fuelGauge = document.querySelector('#fuel-gauge');
    this.fuelValue = document.querySelector('#fuel-value');
    this.fuelFill = document.querySelector('#fuel-fill');
    this.wingmanOrder = document.querySelector('#wingman-order');
    this.wingmanOrderDetail = document.querySelector('#wingman-order-detail');
    this.wingmanRescue = document.querySelector('#wingman-rescue-warning');
    this.wingmanRescueTitle = document.querySelector('#wingman-rescue-title');
    this.wingmanRescueDetail = document.querySelector('#wingman-rescue-detail');
    this.supportForce = document.querySelector('#support-force-status');
    this.supportForceValue = document.querySelector('#support-force-value');
    this.supportForceFill = document.querySelector('#support-force-fill');
    this.supportForceUnits = document.querySelector('#support-force-units');
    this.protectedAsset = document.querySelector('#protected-asset-status');
    this.protectedAssetValue = document.querySelector('#protected-asset-value');
    this.protectedAssetFill = document.querySelector('#protected-asset-fill');
    this.protectedAssetDistance = document.querySelector('#protected-asset-distance');
    this.contactApproach = document.querySelector('#contact-approach-readout');
    this.contactApproachText = document.querySelector('#contact-approach-text');
    this.radarWarning = document.querySelector('#radar-warning');
    this.radarWarningLabel = document.querySelector('#radar-warning-label');
    this.threatWarning = document.querySelector('#threat-warning');
    this.threatWarningLabel = document.querySelector('#threat-warning-label');
    this.threatWarningDetail = document.querySelector('#threat-warning-detail');
    this.boundaryWarning = document.querySelector('#boundary-warning');
    this.boundaryWarningText = document.querySelector('#boundary-warning-text');
    this.boundaryWarningDistance = document.querySelector('#boundary-warning-distance');
    this.radarTime = document.querySelector('#radar-time');
    this.radarRange = document.querySelector('.radar-footer > span');
    this.campaignSupport = document.querySelector('#campaign-support-status');
    this.campaignSupportLabel = document.querySelector('#campaign-support-label');
    this.campaignSupportDetail = document.querySelector('#campaign-support-detail');
    this.campaignSupportAction = document.querySelector('#campaign-support-action');
    this.nightVisionStatus = document.querySelector('#night-vision-status');
    this.optionalObjectivesHud = document.querySelector('#mission-optional-objectives-hud');
    this.optionalObjectivesList = document.querySelector('#mission-optional-objective-hud-list');
    this.optionalObjectivesSignature = '';
  }

  renderOptionalObjectives(objectives = []) {
    const rows = Array.isArray(objectives) ? objectives : [];
    setHiddenIfChanged(this.optionalObjectivesHud, rows.length === 0);
    if (!this.optionalObjectivesList) return;
    const signature = rows.map(row => `${row.id}:${row.status}:${row.detailKey}:${JSON.stringify(row.params ?? {})}`).join('|');
    if (signature === this.optionalObjectivesSignature) return;
    this.optionalObjectivesSignature = signature;
    this.optionalObjectivesList.replaceChildren();
    for (const row of rows) {
      const item = document.createElement('li');
      item.dataset.status = row.status ?? 'pending';
      const title = document.createElement('strong');
      title.textContent = t(row.titleKey ?? `mission.optionalObjective.${row.type}.title`);
      const detail = document.createElement('span');
      detail.textContent = t(
        row.detailKey ?? 'mission.optionalObjective.result.pending',
        optionalResultParams(row.params),
      );
      item.append(title, detail);
      this.optionalObjectivesList.append(item);
    }
  }

  update(state) {
    if (this.radarTime && state.environment) setTextIfChanged(this.radarTime, formatTimeOfDay(state.environment.timeOfDay));
    if (this.radarRange && state.radar?.sensorRange) {
      setTextIfChanged(this.radarRange, t('hud.radarRangeValue', {
        range: Math.round(state.radar.sensorRange / 1000),
      }));
    }
    const support = state.support;
    setHiddenIfChanged(this.campaignSupport, !support?.id);
    if (support?.id) {
      const key = support.awacs ? 'awacs' : support.ito90 ? 'ito90' : support.sergei ? 'sergei' : 'mlrs';
      setTextIfChanged(this.campaignSupportLabel, t(`hud.campaignSupport.${key}.label`));
      if (support.awacs) {
        setTextIfChanged(this.campaignSupportDetail, t('hud.campaignSupport.awacs.detail', {
          radar: Math.round(support.radarRange / 1000),
          missile: Math.round(support.airMissileRange / 1000),
        }));
        setTextIfChanged(this.campaignSupportAction, '');
      } else if (support.ito90) {
        setTextIfChanged(this.campaignSupportDetail, t('hud.campaignSupport.ito90.detail'));
        setTextIfChanged(this.campaignSupportAction, '');
      } else if (support.sergei) {
        setTextIfChanged(this.campaignSupportDetail, t('hud.campaignSupport.sergei.detail'));
        setTextIfChanged(this.campaignSupportAction, '');
      } else {
        setTextIfChanged(this.campaignSupportDetail, t('hud.campaignSupport.mlrs.detail', {
          used: support.mlrsSalvosUsed,
          total: support.mlrsSalvosTotal,
        }));
        setTextIfChanged(this.campaignSupportAction, support.mlrsPending
          ? t('hud.campaignSupport.mlrs.pending')
          : support.mlrsReady ? t('hud.campaignSupport.mlrs.action') : t('hud.campaignSupport.mlrs.empty'));
      }
    }
    setHiddenIfChanged(this.nightVisionStatus, !state.environment?.nightVision);
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
    if(state.wingmanStatus){
      setTextIfChanged(this.wingmanOrderDetail,t('combat.wingmanStatusDetail',state.wingmanStatus));
    }
    const rescue=state.wingmanRescue;
    setHiddenIfChanged(this.wingmanRescue, state.session.destroyed || !rescue?.wingman);
    if(rescue?.wingman){
      const callsign=t(`radio.callsign.${rescue.wingman.radioId}`);
      const attacker=rescue.attacker?.label??t('mission.optionalTarget.generic');
      const seconds=Math.ceil(rescue.remaining);
      setTextIfChanged(this.wingmanRescueTitle,t('hud.wingmanRescue.title',{callsign}));
      const detailKey=rescue.missileInbound
        ? seconds>0?'hud.wingmanRescue.inbound':'hud.wingmanRescue.inboundActive'
        : 'hud.wingmanRescue.lock';
      setTextIfChanged(this.wingmanRescueDetail,t(detailKey,{attacker,seconds}));
      if(this.wingmanRescue?.dataset){
        const stateName=rescue.missileInbound?'inbound':'lock';
        if(this.wingmanRescue.dataset.state!==stateName)this.wingmanRescue.dataset.state=stateName;
      }
    }
    const supportForce=state.supportForce;
    setHiddenIfChanged(this.supportForce,!supportForce?.active);
    if(supportForce?.active){
      const percent=Math.max(0,Math.min(100,Math.round(supportForce.fraction*100)));
      const level=percent>60?'green':percent>30?'yellow':'red';
      setTextIfChanged(this.supportForceValue,`${percent}%`);
      setTextIfChanged(this.supportForceUnits,t('hud.supportForce.units',{
        alive:supportForce.unitsAlive,total:supportForce.unitsTotal,
      }));
      if(this.supportForce?.dataset&&this.supportForce.dataset.level!==level)this.supportForce.dataset.level=level;
      const scale=`scaleX(${percent/100})`;
      if(this.supportForceFill?.style&&this.supportForceFill.style.transform!==scale){
        this.supportForceFill.style.transform=scale;
      }
      const ariaValue=String(percent);
      if(this.supportForce?.getAttribute?.('aria-valuenow')!==ariaValue){
        this.supportForce.setAttribute?.('aria-valuenow',ariaValue);
      }
    }
    const protectedAsset=state.mission?.protectedAsset;
    setHiddenIfChanged(this.protectedAsset,!protectedAsset?.active);
    if(protectedAsset?.active){
      const threatPercent=Math.max(0,Math.min(100,Math.round(protectedAsset.fraction*100)));
      const level=threatPercent>=70?'red':threatPercent>=35?'yellow':'green';
      setTextIfChanged(this.protectedAssetValue,`${threatPercent}%`);
      const distance=protectedAsset.distance;
      const distanceText=Number.isFinite(distance)
        ? `${formatNumber(distance/1000,{minimumFractionDigits:1,maximumFractionDigits:1})} KM`
        : t('hud.protectedAsset.standby');
      setTextIfChanged(this.protectedAssetDistance,distanceText);
      if(this.protectedAsset?.dataset&&this.protectedAsset.dataset.level!==level)this.protectedAsset.dataset.level=level;
      const scale=`scaleX(${threatPercent/100})`;
      if(this.protectedAssetFill?.style&&this.protectedAssetFill.style.transform!==scale){
        this.protectedAssetFill.style.transform=scale;
      }
      const ariaValue=String(threatPercent);
      if(this.protectedAsset?.getAttribute?.('aria-valuenow')!==ariaValue){
        this.protectedAsset.setAttribute?.('aria-valuenow',ariaValue);
      }
    }
    const contactApproach=state.threats.contactApproach;
    setHiddenIfChanged(this.contactApproach,state.session.destroyed||!contactApproach?.active);
    if(contactApproach?.active){
      const distance=Number.isFinite(contactApproach.distance)
        ? `${formatNumber(contactApproach.distance/1000,{minimumFractionDigits:1,maximumFractionDigits:1})} KM`
        : '—';
      const key=contactApproach.phase==='committing'
        ? 'hud.contactApproach.committing'
        : 'hud.contactApproach.approach';
      setTextIfChanged(this.contactApproachText,t(key,{count:contactApproach.count,distance}));
      setClassIfChanged(this.contactApproach,'committing',contactApproach.phase==='committing');
    }
    setHiddenIfChanged(this.fuelGauge, state.fuel.unlimited);
    if (!state.fuel.unlimited && this.fuelGauge) {
      const percent = Math.max(0, Math.min(100, Math.round(state.fuel.fraction * 100)));
      const level = percent > 50 ? 'green' : percent > 20 ? 'yellow' : 'red';
      setTextIfChanged(this.fuelValue, `${percent}%`);
      if (this.fuelGauge.dataset.level !== level) this.fuelGauge.dataset.level = level;
      const scale = `scaleX(${percent / 100})`;
      if (this.fuelFill?.style.transform !== scale) this.fuelFill.style.transform = scale;
      const ariaValue = String(percent);
      if (this.fuelGauge.getAttribute?.('aria-valuenow') !== ariaValue) {
        this.fuelGauge.setAttribute?.('aria-valuenow', ariaValue);
      }
    }

    const { radar, threats, weapons, mission } = state;
    this.renderOptionalObjectives(mission?.optionalObjectives);
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

    const profile = radar.mode === 'ground'
      ? getPlayerMissileProfile('ground', weapons.groundMissileType)
      : getPlayerMissileProfile('air', weapons.airMissileType);
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
