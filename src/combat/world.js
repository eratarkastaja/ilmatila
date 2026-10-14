import * as THREE from 'three';
import { AirBattle } from './air-battle.js';
import { EncounterDirector } from './encounter-director.js';
import { GroundBattle } from './ground-battle.js';
import { CombatInput } from './input.js';
import { CombatRadar } from './radar.js';
import { ProjectileSystem } from './projectile-system.js';
import { CollisionSystem } from './collision-system.js';
import { CountermeasureSystem } from './countermeasure-system.js';
import { MissionSystem } from './mission-system.js';
import { MISSION_PHASE, MissionFlowSystem } from './mission-flow.js';
import { MISSION_OUTCOME } from './mission-objective.js';
import { WeaponSystem } from './weapon-system.js';
import { FuelSystem } from './fuel-system.js';
import { CombatFeedback } from './combat-feedback.js';
import { RadioSystem } from './radio-system.js';
import { ScoreSystem } from './score-system.js';
import { DestructionSystem } from './destruction-system.js';
import { applyAirframeCondition } from './airframe-condition.js';
import { getBoundaryApproach } from './boundary-warning.js';
import { getDifficultyPreset } from './difficulty.js';
import { createSeededRandom, DEFAULT_RANDOM_SEED } from './random.js';
import { calculateDebriefGrade } from '../mission/debrief-grade.js';
import { MissionOptionalObjectives, scaleMissileReserveObjectives } from '../mission/optional-objectives.js';
import { resolveMissionVariant } from '../mission/mission-variants.js';
import { addTransientGlow, CombatEffects, disposeCombatEffectResources } from '../effects/combat-effects.js';
import { CombatHud } from '../ui/combat-hud.js';
import { renderOptionalObjectives } from '../ui/optional-objectives.js';
import { formatNumber, formatPercent, t } from '../ui/i18n.js';
import { AIR_SPAWN_LAYOUT_SEED_XOR } from './air-combat-utils.js';
import { getWeatherTimeOfDay, isNightTime, resolveWeather } from './weather.js';
import { getKitWeight } from '../campaign/campaign-kit.js';

export { disposeCombatEffectResources };

const forward=new THREE.Vector3(0,0,1);
const headingDirection=new THREE.Vector3();
const HUD_UPDATE_INTERVAL=1/15;
const LOW_FUEL_PRESSURE_FRACTION=.2;

const contactIntent = units => {
  let hasStrike = false;
  let hasFlank = false;
  let hasSweep = false;
  let hasAttackHelicopter = false;
  let hasNonCombatant = false;
  for (const unit of units ?? []) {
    if (unit.combatant === false) hasNonCombatant = true;
    if (unit.kind === 'attack-helicopter') hasAttackHelicopter = true;
    if (unit.missionRole === 'strike') hasStrike = true;
    else if (unit.missionRole === 'flank') hasFlank = true;
    else if (unit.missionRole === 'sweep') hasSweep = true;
  }
  if (hasNonCombatant && !hasStrike && !hasFlank && !hasSweep && !hasAttackHelicopter) return 'radio.intent.probe';
  if (hasAttackHelicopter && !hasStrike && !hasFlank && !hasSweep) return 'radio.intent.groundAttack';
  if (hasStrike && (hasFlank || hasSweep)) return 'radio.intent.mixed';
  if (hasStrike) return 'radio.intent.strike';
  if (hasFlank) return 'radio.intent.flank';
  if (hasSweep) return 'radio.intent.intercept';
  return 'radio.intent.unknown';
};

export class CombatWorld {
  constructor(scene, player, terrain, fx, aircraftAsset = null, mission = {}, audio = null, onMissionEnd = () => {}, difficultyId = 'standard', inputTarget = null, seed = DEFAULT_RANDOM_SEED) {
    this.scene=scene; this.player=player; this.destroyed=false; this.missionAborted=false;
    this.fx=fx; this.audio=audio;
    this.combatHud=new CombatHud();
    this.onMissionEnd=onMissionEnd;
    this.hudUpdateElapsed=HUD_UPDATE_INTERVAL;
    this.boundaryApproach=null;
    this.boundaryCritical=false;
    this.difficulty=getDifficultyPreset(difficultyId);
    this.seed = Number(seed) >>> 0;
    this.random = createSeededRandom(this.seed);
    this.spawnRandom = createSeededRandom((this.seed ^ AIR_SPAWN_LAYOUT_SEED_XOR) >>> 0);
    this.telemetry=null;
    const missionResolution=resolveMissionVariant(mission,this.seed);
    this.missionVariant=missionResolution.variant;
    this.encounters=missionResolution.encounters;
    const missionConfig={hostiles:4,wingmen:2,groundBattle:true,groundPairs:6,groundTrucks:12,...missionResolution.mission};
    this.weather = resolveWeather(missionConfig.weather);
    const campaignStores=missionConfig.campaignStores ?? {};
    this.fuelSystem=new FuelSystem({
      ...this.difficulty.player.fuel,
      ...(Number.isFinite(campaignStores.fuelMinutes) ? { enduranceMinutes: campaignStores.fuelMinutes } : {}),
      ...(missionConfig.campaignKit ? { payloadMassKg: getKitWeight(missionConfig.campaignKit) } : {}),
    });
    const loadoutScale=missionConfig.campaignLoadoutScale ?? 1;
    const scaleLoadout=value=>Number.isFinite(value)?Math.max(0,Math.floor(value*loadoutScale)):value;
    const effectiveWeapons={
      ...this.difficulty.player.weapons,
      airMissiles:scaleLoadout(Number.isFinite(campaignStores.airMissiles)
        ? campaignStores.airMissiles
        : this.difficulty.player.weapons.airMissiles),
      groundMissiles:scaleLoadout(Number.isFinite(campaignStores.groundMissiles)
        ? campaignStores.groundMissiles
        : this.difficulty.player.weapons.groundMissiles),
      airMissileType: campaignStores.airMissileType ?? 'amraam',
      groundMissileType: campaignStores.groundMissileType ?? 'maverick',
      gunRounds:scaleLoadout(campaignStores.gunRounds !== undefined
        ? campaignStores.gunRounds
        : this.difficulty.player.weapons.gunRounds),
    };
    missionConfig.optionalObjectives=scaleMissileReserveObjectives(
      missionConfig.optionalObjectives,
      effectiveWeapons,
      getDifficultyPreset('standard').player.weapons,
    );
    this.input = new CombatInput(window, inputTarget);
    this.scoreSystem=new ScoreSystem();
    this.damageTaken=0;
    this.feedback = new CombatFeedback({
      hud: document.querySelector('#flight-hud'),
      message: document.querySelector('#combat-feedback'),
      hitMarker: document.querySelector('#gun-hit-feedback'),
      hullFill: document.querySelector('#hull-fill'),
      hullValue: document.querySelector('#hull-value'),
      countermeasureRows: {
        flare: document.querySelector('.flare-row'),
        chaff: document.querySelector('.chaff-row'),
      },
      maxHull:Math.round(this.difficulty?.player?.hull*(missionConfig.campaignAirframeHealthScale ?? 1)),
    });
    this.radio = new RadioSystem({
      node:document.querySelector('#radio-call'),
      audio,
    });
    this.radio.emit('mission.departure');
    if (missionConfig.campaignRadioBriefingKey) {
      this.radio.emit('campaign.chapterBriefing', {
        params: { messageKey: missionConfig.campaignRadioBriefingKey },
        scope: missionConfig.campaignChapterId,
      });
    }
    this.combatEffects=new CombatEffects({scene,player,fx,audio});
    this.destructionSystem=new DestructionSystem({
      scene,
      fx,
      score:this.scoreSystem,
      effects:this.combatEffects,
      feedback:this.feedback,
      reportWingmanRadio:(event,wingman,details)=>this.reportWingmanRadio(event,wingman,details),
    });
    this.missileLaunchTimer=0;
    this.missileLaunchSource=null;
    this.missileLaunchSeeker=null;
    this.missileLaunchAlertCooldown=0;
    this.initialContactReported=false;
    this.initialContactIdentificationReported=false;
    this.nightVisionEnabled=false;
    this.terrain=terrain; this.playerHeading=0; this.previousPlayerPosition=player.position.clone();
    this.objectiveAnchor=player.position.clone();
    this._fallbackBoundaryBounds=terrain.operationBounds??{
      minX:-terrain.worldSize*.5,maxX:terrain.worldSize*.5,
      minZ:-terrain.worldSize*.5,maxZ:terrain.worldSize*.5,
    };
    this._boundaryApproachScratch={clearance:0};
    this.remainingMissionState={airRemaining:0,groundRemaining:0};
    this.incomingAircraftMissiles=[];
    this.playerVelocity=new THREE.Vector3();
    this.airBattle = new AirBattle({
      scene, player, aircraftAsset, mission: missionConfig, terrain, audio, fx,
      playerVelocity: this.playerVelocity,
      getPlayerHeading: () => this.getPlayerHeading(),
      deployHostileCountermeasures: enemy => this.countermeasureSystem.deployHostile(enemy),
      addHostileProjectile: shot => this.projectileSystem.addHostileProjectile(shot),
      addPlayerProjectile: shot => this.projectileSystem.addPlayerProjectile(shot),
      onMissileLaunch: (enemy, missile, seeker, target) => this.onMissileLaunch(enemy, missile, seeker, target),
      onWingmanRadio: (event, wingman, details) => this.reportWingmanRadio(event, wingman, details),
      onPopUpThreat: (stage, units) => this.reportPopUpThreat(stage, units),
      onOperationalEvent: (event, unit) => this.reportOperationalEvent(event, unit),
      canStartHostileMissileAttack: (enemy, target) => this.canStartHostileMissileAttack(enemy, target),
      weather: this.weather,
      difficulty:this.difficulty,
      random:this.random,
      spawnRandom:this.spawnRandom,
    });
    this.groundBattle = new GroundBattle({
      scene, player, playerVelocity: this.playerVelocity, terrain, mission: missionConfig,
      audio, fx, difficulty:this.difficulty, enemies:this.airBattle.enemies,
      addProjectile: shot => this.projectileSystem.addHostileProjectile(shot),
      addFriendlyProjectile: shot => this.projectileSystem.addPlayerProjectile(shot),
      random: this.random,
    });
    this.airBattle.setGroundUnits(this.groundBattle.redUnits);
    this.airBattle.setFriendlyGroundUnits(this.groundBattle.friends);
    this.encounterContext={
      primaryGroupRemaining:0,
      primaryGroundRemaining:0,
      reinforcementLogisticsRemaining:0,
      objectiveActive:false,
      playerCombatCapable:false,
    };
    this.radioPressureReported=false;
    this.encounterDirector=new EncounterDirector(this.encounters,{
      onWarning:event=>{
        const response=event.response??{};
        const bearing=THREE.MathUtils.euclideanModulo(response.bearingDegrees??0,360);
        const range=response.spawnDistance??missionConfig.hostileSpawnDistance??0;
        this.radio.emit(event.warningEvent,{scope:event.id,params:{
          minimum:String(event.delayRangeSeconds.min),
          maximum:String(event.delayRangeSeconds.max),
          bearing:String(Math.round(bearing)%360).padStart(3,'0'),
          range:formatNumber(range/1000,{minimumFractionDigits:1,maximumFractionDigits:1}),
        }});
      },
      onExecute:event=>this.airBattle.spawnEncounter(event),
    });
    this.baseObjectiveAirTotal=missionConfig.hostiles + (missionConfig.hostileHelicopters ?? 0);
    const objectiveTotals={
      air:this.baseObjectiveAirTotal + this.encounterDirector.getPlannedHostileCount(),
      ground:this.redUnits.filter(unit=>unit.armed!==false).length,
    };
    this.collisionSystem = new CollisionSystem({
      player, terrain, colliders: this.groundBattle.colliders, enemies: this.enemies, allies: this.allies,
      redUnits: this.redUnits, lastCollisionPosition: player.position.clone(),
      onPlayerDestroyed: (reason, params) => this.destroyPlayer(reason, params),
      onPlayerBoundaryAbort: () => this.abortMission(),
    });
    this.projectileSystem = new ProjectileSystem({
      scene, player,
      collision: this.collisionSystem, audio,
      incomingDamageMultiplier:this.difficulty?.player?.incomingDamage,
      weather: this.weather,
      hostileMissileTurnRate:this.difficulty?.fighter?.missile?.projectile?.turnRate,
      hostileMissileDamage:this.difficulty?.fighter?.missile?.projectile?.damage,
      hostileMissileProximityRadius:this.difficulty?.fighter?.missile?.projectile?.proximityRadius,
      random:this.random,
      onPlayerDestroyed: (reason, params) => this.destroyPlayer(reason, params),
      playerVelocity: this.playerVelocity,
      onPlayerDamaged: (amount, reason) => this.damagePlayer(amount, reason),
      onPlayerHit: (target, details) => {
        this.scoreSystem.recordGunHit();
        this.feedback.gunHit(details.destroyed);
        this.audio?.playGunHit();
      },
      onPlayerMissileHit: () => this.scoreSystem.recordPlayerMissileHit(),
      onFriendlyAircraftHit: (wingman, damage, sourceUnit) => this.airBattle.damageWingman(wingman, damage, sourceUnit),
      onJetDestroyed: (enemy, credited, details) => this.destructionSystem.destroyAircraft(enemy, credited, details),
      onUnitDestroyed: (unit, credited, details) => this.destructionSystem.destroyGroundUnit(unit, credited, details),
      addSpark: position => this.combatEffects.addSpark(position),
      addWaterImpact: position => this.fx?.addWaterImpact(position),
      addExplosion: (position, intensity) => this.combatEffects.addExplosion(position, intensity),
    });
    this.airBattle.setHostileProjectiles(this.hostiles);
    this.countermeasureSystem = new CountermeasureSystem({
      scene, player, playerVelocity: this.playerVelocity, fx, audio,
      playerShots: this.projectileSystem.playerShots, hostileShots: this.projectileSystem.hostiles,
      hostileAircraft: this.airBattle.enemies,
      addTransientGlow,
      initialCount:scaleLoadout(campaignStores.flares ?? this.difficulty?.player?.countermeasures),
      initialChaff:scaleLoadout(campaignStores.chaff ?? this.difficulty?.player?.chaff?.count),
      chaffConfig:this.difficulty?.player?.chaff,
      random:this.random,
      onInventoryChange: () => this.updateHud(),
    });
    this.projectileSystem.setDecoys(this.countermeasureSystem.decoys);
    this.radar = new CombatRadar(player, audio, this.weather, missionConfig.campaignRadarRangeScale ?? 1, effectiveWeapons);
    this.weaponSystem = new WeaponSystem({
      player, scene, fx, audio, radar: this.radar, playerVelocity: this.playerVelocity, weather: this.weather,
      addProjectile: shot => this.projectileSystem.addPlayerProjectile(shot),
      loadout:effectiveWeapons,
      canFireWeapons:()=>missionConfig.rulesOfEngagement!=='weaponsHold',
      onWeaponsHoldViolation:()=>this.radio.emit('mission.weaponsHold',{scope:missionConfig.campaignAttemptId??missionConfig.id}),
      random: this.random,
    });
    this.lastObservedMissilesFired=this.weaponSystem.missilesFired;
    this.status=document.querySelector('.status'); this.deathScreen=document.querySelector('#death-screen'); this.deathReason=document.querySelector('#death-reason');
    this.statusText=this.status?.querySelector('[data-i18n]');
    const objectiveTitle=document.querySelector('#mission-objective-title');
    const objectiveProgress=document.querySelector('#mission-objective-progress');
    const missionCompleteNotice=document.querySelector('#mission-complete');
    const missionCompleteDetail=document.querySelector('#mission-complete-detail');
    const debriefDialog=document.querySelector('#mission-debrief');
    const objectiveSetbacks = missionConfig.objective?.setback;
    const objectiveSetbackConditions = Array.isArray(objectiveSetbacks)
      ? objectiveSetbacks
      : objectiveSetbacks ? [objectiveSetbacks] : [];
    const tracksFriendlyStrength = missionConfig.objective?.type === 'forceDefense'
      || objectiveSetbackConditions.some(condition => condition?.type === 'friendlyStrength');
    this.missionSystem = new MissionSystem({
      mission: missionConfig,
      objective: missionConfig.objective??{type:'clearAir'},
      totals: objectiveTotals,
      deferCompletion:true,
      initiallyActive:false,
      getRemaining: state => {
        state.airRemaining=this.airBattle.hostilesSpawned
          ? 0
          : missionConfig.hostiles+(missionConfig.hostileHelicopters??0);
        state.pendingAirRemaining=this.encounterDirector.getPendingHostileCount();
        state.airRemaining += state.pendingAirRemaining;
        state.groundRemaining=0;
        if(this.airBattle.hostilesSpawned){
          for(const enemy of this.enemies)if(!enemy.dead)state.airRemaining++;
        }
        for(const unit of this.redUnits)if(!unit.dead&&unit.armed!==false)state.groundRemaining++;
        state.identifiedCount=0;
        state.contactCount=0;
        state.escortElapsed=0;
        state.priorityTargetsRemaining=0;
        state.protectedAssetLost=false;
      state.protectedAssetThreat=0;
      state.protectedAssetDistance=Infinity;
        state.friendlyStrengthFraction=1;
        if(missionConfig.objective?.type==='airPolicing'){
          this.airBattle.getOperationalState(state);
        }else if(missionConfig.objective?.type==='assetDefense'){
          const targetIndex=missionConfig.objective.target?.index??0;
          const target=this.enemies[targetIndex];
          state.priorityTargetsRemaining=!this.airBattle.hostilesSpawned||Boolean(target&&!target.dead)?1:0;
          if(target&&!target.dead){
            const dx=target.mesh.position.x-this.objectiveAnchor.x;
            const dz=target.mesh.position.z-this.objectiveAnchor.z;
            const radius=missionConfig.objective.zoneRadius??7200;
            state.protectedAssetLost=dx*dx+dz*dz<=radius*radius;
            state.protectedAssetDistance=Math.hypot(dx,dz);
            const warningRange=Math.max(radius*3,18000);
            state.protectedAssetThreat=THREE.MathUtils.clamp(
              (warningRange-state.protectedAssetDistance) / Math.max(1,warningRange-radius),
              0,
              1,
            );
          }
        }else if(missionConfig.objective?.type==='logisticsStrike'){
          state.priorityTargetsRemaining=this.redUnits.some(unit => (
            unit.role==='logistics' && unit.reinforcementSource && !unit.dead
          )) ? 1 : 0;
        }else if(missionConfig.objective?.type==='strikeDefense'){
          if(!this.airBattle.hostilesSpawned){
            state.priorityTargetsRemaining=(missionConfig.hostileRoles??[])
              .filter(role=>role==='strike').length;
          }else{
            state.priorityTargetsRemaining=this.enemies.filter(enemy=>enemy.missionRole==='strike'&&!enemy.dead).length;
          }
        }
        if(tracksFriendlyStrength){
          let health=0;
          let maximum=0;
          for(const unit of this.friends){
            if(unit.role!=='defender')continue;
            const maxHp=Math.max(0,unit.maxHp??unit.hp??0);
            maximum+=maxHp;
            if(!unit.dead&&unit.hp>0)health+=Math.min(unit.hp,maxHp);
          }
          state.friendlyStrengthFraction=maximum>0?health/maximum:0;
        }
        return state;
      },
      nodes: {
        objectiveTitle,
        objectiveProgress,
        notice: missionCompleteNotice,
        detail: missionCompleteDetail,
        status: this.status,
        statusText: this.statusText,
      },
    });
    this.debriefNodes={
      dialog:debriefDialog,
      title:document.querySelector('#debrief-title'),
      mission:document.querySelector('#debrief-mission'),
      variant:document.querySelector('#debrief-variant'),
      difficulty:document.querySelector('#debrief-difficulty'),
      outcome:document.querySelector('#debrief-outcome'),
      duration:document.querySelector('#debrief-duration'),
      kills:document.querySelector('#debrief-kills'),
      airKills:document.querySelector('#debrief-air-kills'),
      groundKills:document.querySelector('#debrief-ground-kills'),
      gunRounds:document.querySelector('#debrief-gun-rounds'),
      missiles:document.querySelector('#debrief-missiles'),
      missileHits:document.querySelector('#debrief-missile-hits'),
      wingmen:document.querySelector('#debrief-wingmen'),
      score:document.querySelector('#debrief-score'),
      accuracy:document.querySelector('#debrief-accuracy'),
      damage:document.querySelector('#debrief-damage'),
      objectives:document.querySelector('#debrief-objectives'),
      optionalObjectives:document.querySelector('#debrief-optional-objective-list'),
      turningPoint:document.querySelector('#debrief-turning-point'),
      threatBreach:document.querySelector('#debrief-threat-breach'),
      gradeMark:document.querySelector('#debrief-grade-mark'),
      gradeScore:document.querySelector('#debrief-grade-score'),
      gradeCriteria:{
        mission:document.querySelector('#debrief-grade-mission'),
        survival:document.querySelector('#debrief-grade-survival'),
        wingmen:document.querySelector('#debrief-grade-wingmen'),
        accuracy:document.querySelector('#debrief-grade-accuracy'),
        damage:document.querySelector('#debrief-grade-damage'),
        efficiency:document.querySelector('#debrief-grade-efficiency'),
      },
    };
    this.debriefData=null;
    this.debriefEvents=[];
    this.debriefThreats=[];
    this.debriefTurningPoint=null;
    this.debriefOptionalStatuses=new Map();
    this.debriefObjectiveReported=false;
    this.missionFlow=new MissionFlowSystem({
      mission:missionConfig,
      player,
      terrain,
      nodes:{
        phaseTitle:document.querySelector('#mission-phase-title'),
        phaseDetail:document.querySelector('#mission-phase-detail'),
        routeReadout:document.querySelector('#mission-route-readout'),
        routeLabel:document.querySelector('#mission-route-label'),
        routeRange:document.querySelector('#mission-route-range'),
        routeAltitude:document.querySelector('#mission-route-altitude'),
        waypointCue:document.querySelector('#mission-waypoint-cue'),
      },
      getObjectiveWaypoint:()=>this.groundBattle?.battleCenter??null,
      onIngress:()=>{
        this.airBattle.spawnHostiles();
        this.groundBattle.setAirDefenseActive(true);
        this.radio.emit('mission.controlIngress',{scope:'ingress'});
        for(const wingman of this.airBattle.allies){
          if(!wingman.dead)this.radio.emit('wingman.ingress',{wingmanId:wingman.radioId,scope:'ingress'});
        }
      },
      onObjectiveActive:()=>this.missionSystem.activate(),
      onObjectiveComplete:outcome=>{
        if(outcome===MISSION_OUTCOME.SETBACK){
          this.missionSystem.notifyObjectiveSetback();
          this.radio.emit('mission.setbackRtb');
        }else{
          this.missionSystem.notifyObjectiveAchieved();
          this.radio.emit('mission.objectiveComplete');
        }
      },
      onRtb:()=>this.missionSystem.returnToBase(),
      onPhaseChange:(previous,phase)=>this.reportMissionPhase(previous,phase),
      onEnd:(outcome,elapsed)=>this.finishMission(outcome,elapsed),
    });
    this.airBattle.setWingmanReturnPoint(this.missionFlow.home);
    this.optionalObjectiveTracker=new MissionOptionalObjectives(missionConfig.optionalObjectives??[]);
    this.protectedSiteLossReported=false;
    this.optionalObjectiveState={
      outcome:MISSION_OUTCOME.ACTIVE,
      elapsed:0,
      damageTaken:0,
      wingmenReturned:0,
      wingmenTotal:this.airBattle.allies.length,
      missilesRemaining:0,
      airHostiles:this.enemies,
      groundHostiles:this.redUnits,
      friendlyGround:this.friends,
      extractionCenter:this.missionFlow.home,
    };
    this._radarContactSets={
      airFriendly:this.allies,airHostile:this.enemies,
      groundFriendly:this.friends,groundHostile:this.redUnits,
    };
    this._weaponInput={gunFiring:false,missileRequested:false};
    this._airPlayerThreat={lockedTarget:null,incomingMissiles:this.incomingAircraftMissiles};
    this._missionFlowState={
      detectedHostiles:0,playerEngaged:false,hostileEngaged:false,
      targetDestroyed:false,objectiveSatisfied:false,objectiveOutcome:MISSION_OUTCOME.COMPLETE,destroyed:false,
    };
    /** Stable, borrowed-data read model for the UI; simulation systems remain the source of truth. */
    this.hudState={
      session:{destroyed:false,gunFiring:false},
      player:{position:this.player.position,velocity:this.playerVelocity},
      units:{air:this.enemies,ground:this.redUnits},
      radar:{
        mode:this.radar.mode,target:null,targetDomain:'air',targetLastKnownPosition:this.radar.targetLastKnownPosition,
        hasLastKnownPosition:false,targetInSensorRange:false,inLockEnvelope:false,
        lockCueConfirmed:false,lockCueTarget:false,lock:0,
      },
      weapons:{
        missiles:this.weaponSystem.missiles,
        airMissileType:this.weaponSystem.airMissileType,
        groundMissileType:this.weaponSystem.groundMissileType,
        gunAmmoRemaining:this.weaponSystem.gunAmmoRemaining,
        cooldown:0,
        feedbackKey:null,
        feedbackTimer:0,
      },
      fuel:{unlimited:this.fuelSystem.unlimited,fraction:this.fuelSystem.fraction},
      countermeasures:{flares:0,chaff:0},
      environment:{timeOfDay:this.weather.timeOfDay,night:false,nightVision:false},
      wingmanOrder:this.airBattle.wingmanOrder,
      wingmanStatus:{alive:0,total:this.allies.length},
      wingmanRescue:{wingman:null,attacker:null,remaining:0,missileInbound:false},
      supportForce:{active:false,fraction:1,unitsAlive:0,unitsTotal:0},
      score:0,
      mission:{phase:null,waypoint:null,boundaryApproach:null,boundaryCritical:false,protectedAsset:{active:false,fraction:0,distance:Infinity}},
      threats:{
        radarWarningState:null,missile:null,missileEta:Infinity,missileDistance:Infinity,
        launchVisible:false,launchSourcePosition:null,launchSeeker:null,
        contactApproach:{active:false,phase:'approach',count:0,distance:Infinity},
      },
    };
    this.refreshHudState();
    this.combatHud.update(this.hudState);
    this.restartButton = document.querySelector('#restart');
    this.onRestart = () => location.reload();
    this.restartButton?.addEventListener('click', this.onRestart);
    this.onLanguageChange = () => {
      this.radar.renderMode();
      this.feedback.refreshLanguage();
      this.radio.refreshLanguage();
      this.updateHud();
      this.missionSystem.renderObjective();
      this.missionSystem.renderComplete();
      this.missionFlow.render();
      if(this.debriefData)this.renderDebrief();
      if(this.statusText&&!this.destroyed){
        const statusKey=this.missionSystem.missionComplete?'mission.statusComplete':this.missionFlow.phase===MISSION_PHASE.RTB?'mission.statusRtb':'hud.ready';
        this.statusText.textContent=t(statusKey);
      }
      if(this.deathReason&&this.destroyed)this.deathReason.textContent=t(this.deathReasonKey,this.deathReasonParams);
      if(this.status&&this.destroyed){
        const statusKey=this.missionAborted?'combat.missionAborted':'combat.destroyed';
        this.status.replaceChildren(document.createElement('i'),document.createTextNode(` ${t(statusKey)}`));
      }
    };
    document.addEventListener('ilmatila:languagechange', this.onLanguageChange);
  }
  get enemies(){return this.airBattle?.enemies??[];}
  get allies(){return this.airBattle?.allies??[];}
  get friends(){return this.groundBattle?.friends??[];}
  get redUnits(){return this.groundBattle?.redUnits??[];}
  get playerShots(){return this.projectileSystem?.playerShots??[];}
  get hostiles(){return this.projectileSystem?.hostiles??[];}
  get score(){return this.scoreSystem.score;}
  get airKills(){return this.scoreSystem.airKills;}
  get groundKills(){return this.scoreSystem.groundKills;}
  get gunHits(){return this.scoreSystem.gunHits;}

  setTelemetry(telemetry) {
    this.telemetry=telemetry;
    this.projectileSystem.setTelemetry(telemetry);
    this.countermeasureSystem.setTelemetry(telemetry);
  }
  getPlayerHeading(){
    const direction=headingDirection.copy(forward).applyQuaternion(this.player.quaternion);
    if(direction.x*direction.x+direction.z*direction.z>1e-4)this.playerHeading=Math.atan2(direction.x,direction.z);
    return this.playerHeading;
  }
  hasActiveHostileMissileCommitment(excludeEnemy=null){
    for(const enemy of this.enemies){
      if(enemy===excludeEnemy||enemy.dead)continue;
      if(enemy.missileLockRemaining!=null&&(!enemy.missileLockTarget||!enemy.missileLockTarget.dead))return true;
      if(enemy.airMissileLockRemaining!=null)return true;
    }
    for(const shot of this.hostiles){
      if(shot.missile&&shot.life>0&&shot.target&&!shot.target.dead)return true;
    }
    for(const ally of this.allies)if(!ally.dead&&ally.rescueHighlight)return true;
    return false;
  }
  hasNonMissileComplication(){
    if(!this.fuelSystem.unlimited&&this.fuelSystem.fraction<=LOW_FUEL_PRESSURE_FRACTION)return true;
    for(const unit of this.redUnits)if(!unit.dead&&unit.aaPlayerTracking)return true;
    return false;
  }
  canStartHostileMissileAttack(enemy,target){
    if(enemy.airMissileLockRemaining!=null
      ||(enemy.missileLockRemaining!=null&&enemy.missileLockTarget===target))return true;
    if(this.encounterDirector?.hasActiveWarning())return false;
    return !this.hasActiveHostileMissileCommitment(enemy)&&!this.hasNonMissileComplication();
  }
  isTacticalComplicationActive(){
    return this.hasActiveHostileMissileCommitment()||this.hasNonMissileComplication();
  }
  refreshHudState(){
    const state=this.hudState;
    if(!state)return;
    state.session.destroyed=this.destroyed;
    const timeOfDay=getWeatherTimeOfDay(this.weather,this.missionFlow?.elapsed??0);
    state.environment.timeOfDay=timeOfDay;
    state.environment.night=isNightTime(timeOfDay);
    state.environment.nightVision=this.nightVisionEnabled;
    state.session.gunFiring=this.input.pressed.has('Space');
    state.radar.mode=this.radar.mode;
    state.radar.target=this.radar.target;
    state.radar.targetDomain=this.radar.targetDomain;
    state.radar.hasLastKnownPosition=this.radar.hasLastKnownPosition;
    state.radar.targetInSensorRange=this.radar.targetInSensorRange;
    state.radar.inLockEnvelope=this.radar.inLockEnvelope;
    state.radar.lockCueConfirmed=this.radar.lockCueConfirmed;
    state.radar.lockCueTarget=this.radar.lockCueTarget;
    state.radar.lock=this.radar.lock;
    state.weapons.cooldown=this.weaponSystem.cooldown;
    state.weapons.gunAmmoRemaining=this.weaponSystem.gunAmmoRemaining;
    state.fuel.unlimited=this.fuelSystem.unlimited;
    state.fuel.fraction=this.fuelSystem.fraction;
    state.weapons.feedbackKey=this.weaponSystem.missileFeedbackKey;
    state.weapons.feedbackTimer=this.weaponSystem.missileFeedbackTimer;
    state.countermeasures.flares=this.countermeasureSystem.flares;
    state.countermeasures.chaff=this.countermeasureSystem.chaff;
    state.wingmanOrder=this.airBattle.wingmanOrder;
    state.wingmanStatus.alive=this.allies.reduce((count,ally)=>count+(!ally.dead?1:0),0);
    state.wingmanStatus.total=this.allies.length;
    const rescue=state.wingmanRescue;
    rescue.wingman=null;
    rescue.attacker=null;
    rescue.remaining=0;
    rescue.missileInbound=false;
    for(const ally of this.allies){
      if(ally.dead||!ally.rescueHighlight)continue;
      rescue.wingman=ally;
      rescue.attacker=ally.rescueAttacker;
      rescue.remaining=ally.rescueTimer??0;
      rescue.missileInbound=Boolean(ally.rescueMissile);
      break;
    }
    const supportForce=state.supportForce;
    let defenderHealth=0;
    let defenderMaxHealth=0;
    let defendersAlive=0;
    let defendersTotal=0;
    for(const unit of this.friends){
      if(unit.role!=='defender')continue;
      defendersTotal++;
      const maxHp=Math.max(0,unit.maxHp??unit.hp??0);
      defenderMaxHealth+=maxHp;
      if(!unit.dead&&unit.hp>0){
        defendersAlive++;
        defenderHealth+=Math.min(unit.hp,maxHp);
      }
    }
    supportForce.active=this.missionSystem.mission.id==='support'&&defendersTotal>0&&defenderMaxHealth>0;
    supportForce.fraction=defenderMaxHealth>0?Math.max(0,Math.min(1,defenderHealth/defenderMaxHealth)):0;
    supportForce.unitsAlive=defendersAlive;
    supportForce.unitsTotal=defendersTotal;
    state.score=this.score;
    state.mission.phase=this.missionFlow?.phase??null;
    state.mission.waypoint=this.missionFlow.waypoint;
    state.mission.boundaryApproach=this.boundaryApproach;
    state.mission.boundaryCritical=this.boundaryCritical;
    const protectedAsset=state.mission.protectedAsset;
    const protectedAssetState=this.missionSystem?.remaining??{};
    protectedAsset.active=this.missionSystem?.mission?.objective?.type==='assetDefense';
    protectedAsset.fraction=protectedAssetState.protectedAssetThreat??0;
    protectedAsset.distance=protectedAssetState.protectedAssetDistance??Infinity;
    state.threats.radarWarningState=this.getPlayerRadarWarningState();
    state.threats.missile=this.projectileSystem.missileThreat;
    state.threats.missileEta=this.projectileSystem.missileThreatEta;
    state.threats.missileDistance=this.projectileSystem.missileThreatDistance;
    state.threats.launchVisible=Boolean(
      this.missileLaunchTimer>0&&this.missileLaunchSource&&!this.missileLaunchSource.dead,
    );
    state.threats.launchSourcePosition=this.missileLaunchSource?.mesh?.position??null;
    state.threats.launchSeeker=this.missileLaunchSeeker;
    const contactApproach=state.threats.contactApproach;
    let approachingCount=0;
    let nearestApproachDistance=Infinity;
    let committing=false;
    for(const enemy of this.enemies){
      if(enemy.dead||enemy.identified===false||(enemy.phase!=='staging'&&enemy.phase!=='inbound'))continue;
      approachingCount++;
      if(enemy.phase==='inbound')committing=true;
      nearestApproachDistance=Math.min(nearestApproachDistance,enemy.mesh.position.distanceTo(this.player.position));
    }
    contactApproach.active=!this.destroyed
      &&this.missionFlow.phase===MISSION_PHASE.CONTACT
      &&approachingCount>0;
    contactApproach.phase=committing?'committing':'approach';
    contactApproach.count=approachingCount;
    contactApproach.distance=nearestApproachDistance;
  }
  update(dt){
    this.frameDelta=dt;
    this.missileLaunchTimer=Math.max(0,this.missileLaunchTimer-dt);
    this.missileLaunchAlertCooldown=Math.max(0,this.missileLaunchAlertCooldown-dt);
    if(this.missileLaunchTimer<=0){this.missileLaunchSource=null;this.missileLaunchSeeker=null;}
    this.countermeasureSystem.tick(dt);
    if(dt>0){this.playerVelocity.copy(this.player.position).sub(this.previousPlayerPosition).multiplyScalar(1/dt);this.previousPlayerPosition.copy(this.player.position);}
    const justPressed = this.input.consumeJustPressed();
    const radarModeRequested=justPressed.has('KeyR');
    const targetCycleDirection=justPressed.has('KeyY')?-1:justPressed.has('KeyT')?1:0;
    const missileRequested=justPressed.has('KeyM')||justPressed.has('MouseSecondary');
    const flareRequested=justPressed.has('KeyF');
    const chaffRequested=justPressed.has('KeyC');
    const nightVisionRequested=justPressed.has('KeyN');
    const wingmanOrder=justPressed.has('Digit1')?'attack':justPressed.has('Digit2')?'defend':justPressed.has('Digit3')?'regroup':justPressed.has('Digit4')?'rtb':null;
    if(radarModeRequested)this.radar.toggleMode();
    if(flareRequested){
      const deployed=this.countermeasureSystem.deployFlare();
      this.feedback.countermeasures('flare',deployed,this.countermeasureSystem.lastPlayerDeployment,this.countermeasureSystem.flares);
    }
    if(chaffRequested){
      const deployed=this.countermeasureSystem.deployChaff();
      this.feedback.countermeasures('chaff',deployed,this.countermeasureSystem.lastChaffDeployment,this.countermeasureSystem.chaff);
    }
    if(nightVisionRequested){
      const timeOfDay=getWeatherTimeOfDay(this.weather,this.missionFlow?.elapsed??0);
      if(isNightTime(timeOfDay)){
        this.nightVisionEnabled=!this.nightVisionEnabled;
        this.feedback.notify(
          this.nightVisionEnabled?'combat.nightVisionEnabled':'combat.nightVisionDisabled',
          1.2,
          'friendly',
        );
      }else{
        this.nightVisionEnabled=false;
        this.feedback.notify('combat.nightVisionUnavailable',1.4,'info');
      }
    }
    if(wingmanOrder&&this.airBattle.issueWingmanOrder(wingmanOrder)){
      this.audio?.playWingmanOrder(wingmanOrder);
      this.feedback.notify(`combat.wingmanOrder.${wingmanOrder}`,1.65,'friendly');
      this.radio.acknowledgeWingmanCommand(wingmanOrder,this.airBattle.allies,true);
    }
    const gunFiring=(this.input.pressed.has('Space')||this.input.pressed.has('MousePrimary'))&&!this.destroyed;
    this.radar.updateContacts(dt,this.getPlayerHeading(),this._radarContactSets);
    this.reportInitialContactAssessment();
    if(targetCycleDirection){
      if(this.radar.cycleTarget(this.enemies,this.redUnits,targetCycleDirection)){
        this.weaponSystem.clearFeedback();
      }else{
        this.weaponSystem.showFeedback('combat.noRadarTargets',1.5);
      }
    }
    const previouslyLocked=this.radar.lockCueConfirmed;
    const previouslyAcquiring=this.radar.lockCueTarget;
    this.radar.updateLock(dt, this.enemies, this.redUnits);
    if(!previouslyLocked&&this.radar.lockCueConfirmed)this.feedback.notify('combat.lockConfirmed',1.25,'friendly');
    else if(previouslyLocked&&!this.radar.lockCueConfirmed)this.feedback.notify('combat.lockLost',1.05,'warning');
    else if(!previouslyAcquiring&&this.radar.lockCueTarget)this.feedback.notify('combat.lockAcquiring',1.05,'info');
    this._weaponInput.gunFiring=gunFiring;
    this._weaponInput.missileRequested=missileRequested;
    this.weaponSystem.update(dt,this._weaponInput);
    const missileLaunched=this.weaponSystem.missilesFired>this.lastObservedMissilesFired;
    this.lastObservedMissilesFired=this.weaponSystem.missilesFired;
    this.incomingAircraftMissiles.length=0;
    for(const shot of this.projectileSystem.playerShots){
      if(shot.homing&&shot.targetDomain==='air')this.incomingAircraftMissiles.push(shot);
    }
    this._airPlayerThreat.lockedTarget=this.radar.targetDomain==='air'&&this.radar.lockCueConfirmed?this.radar.target:null;
    this.airBattle.update(dt,this._airPlayerThreat);
    this.groundBattle.update(dt);
    this.countermeasureSystem.update(dt);
    this.projectileSystem.update(dt);
    const encounterContext=this.encounterContext;
    encounterContext.primaryGroupRemaining=0;
    encounterContext.primaryGroundRemaining=0;
    encounterContext.reinforcementLogisticsRemaining=0;
    for(const enemy of this.enemies){
      if(!enemy.dead&&enemy.encounterGroupId==='primary')encounterContext.primaryGroupRemaining++;
    }
    for(const unit of this.redUnits){
      if(!unit.dead&&unit.armed!==false)encounterContext.primaryGroundRemaining++;
      if(!unit.dead&&unit.reinforcementSource)encounterContext.reinforcementLogisticsRemaining++;
    }
    if(!this.radioPressureReported
      &&this.missionSystem.mission.objective?.type!=='airPolicing'
      &&this.baseObjectiveAirTotal>1
      &&encounterContext.primaryGroupRemaining>0
      &&encounterContext.primaryGroupRemaining<=Math.ceil(this.baseObjectiveAirTotal*.5)){
      this.radioPressureReported=true;
      this.radio.emit('mission.controlPressure',{
        scope:'air-pressure',
        params:{remaining:String(encounterContext.primaryGroupRemaining)},
      });
    }
    encounterContext.objectiveActive=this.missionSystem.objectiveActive;
    encounterContext.playerCombatCapable=!this.destroyed&&this.feedback.hull>this.feedback.maxHull*.25;
    encounterContext.complicationActive=this.isTacticalComplicationActive();
    this.encounterDirector.update(dt,encounterContext);
    this.missionSystem.totals.air=this.baseObjectiveAirTotal+this.encounterDirector.getPlannedHostileCount();
    this.combatEffects.update(dt);
    this.radio.update(dt);
    this.refreshOptionalObjectiveState();
    const optionalResults=this.optionalObjectiveTracker.update(this.optionalObjectiveState);
    this.recordOptionalObjectiveChanges(optionalResults);
    if(!this.protectedSiteLossReported&&optionalResults.some(result=>
      result.type==='interceptBeforeZone'
      &&result.status==='failed'
      &&result.detailKey==='mission.optionalObjective.result.zoneReached')){
      this.protectedSiteLossReported=true;
      this.radio.emit('mission.protectedSiteLost',{scope:'protected-installation'});
    }
    this.missionSystem.update(dt,this.destroyed);
    if(this.missionSystem.objectiveSatisfied&&!this.debriefObjectiveReported){
      this.debriefObjectiveReported=true;
      this.recordTurningPoint({
        key:this.missionSystem.objectiveResult===MISSION_OUTCOME.SETBACK
          ?'mission.debrief.turningPoint.objectiveSetback'
          :'mission.debrief.turningPoint.objectiveComplete',
        phase:MISSION_PHASE.OBJECTIVE,
        priority:80,
      });
    }
    if(this.missionSystem.objectiveSatisfied
      &&this.missionSystem.objectiveResult===MISSION_OUTCOME.COMPLETE)this.scoreSystem.awardObjectiveCompletion();
    let detectedHostiles=0;
    for(const track of this.radar.tracks.values())if(track.team==='hostile')detectedHostiles++;
    let hostileEngaged=false;
    for(const enemy of this.enemies){
      if(!enemy.dead&&enemy.identified!==false&&(enemy.phase==='inbound'||enemy.phase==='extend'||enemy.missilesFired>0)){hostileEngaged=true;break;}
    }
    let targetDestroyed=false;
    for(const enemy of this.enemies)if(enemy.dead){targetDestroyed=true;break;}
    if(!targetDestroyed)for(const unit of this.redUnits)if(unit.dead){targetDestroyed=true;break;}
    const missionFlowState=this._missionFlowState;
    missionFlowState.detectedHostiles=detectedHostiles;
    missionFlowState.playerEngaged=gunFiring||missileLaunched;
    missionFlowState.hostileEngaged=hostileEngaged;
    missionFlowState.targetDestroyed=targetDestroyed;
    missionFlowState.objectiveSatisfied=this.missionSystem.objectiveSatisfied;
    missionFlowState.objectiveOutcome=this.missionSystem.objectiveResult;
    missionFlowState.destroyed=this.destroyed;
    this.missionFlow.update(dt,missionFlowState);
    this.updateBoundaryVisual();
    this.refreshHudState();
    this.hudUpdateElapsed+=dt;
    if(this.hudUpdateElapsed>=HUD_UPDATE_INTERVAL){
      this.hudUpdateElapsed%=HUD_UPDATE_INTERVAL;
      this.combatHud.update(this.hudState);
    }
    this.feedback.update(dt);
  }
  checkPlayerCollision(dt=this.frameDelta??0){
    if(this.destroyed)return true;
    return this.collisionSystem.checkPlayerCollision(dt);
  }
  destroyPlayer(reasonKey,params={}){
    if(this.destroyed)return;
    if(this.feedback.hull>0){
      const remainingHull=this.feedback.hull;
      this.damageTaken+=remainingHull;
      this.telemetry?.recordPlayerDamage(reasonKey,remainingHull);
      this.feedback.damage(this.feedback.hull);
    }
    this.destroyed=true;
    this.recordThreatBreach('mission.debrief.threat.aircraft',{reason:{key:reasonKey,params}},110);
    this.recordTurningPoint({
      key:'mission.debrief.turningPoint.aircraftLost',
      phase:this.missionFlow?.phase??MISSION_PHASE.ENGAGEMENT,
      priority:120,
      params:{reason:{key:reasonKey,params}},
    });
    this.hudState.session.destroyed=true;
    this.combatHud.hideRadarAndBoundaryWarnings();
    this.missionSystem.markPlayerDestroyed();
    this.weaponSystem.stopGun();
    this.audio?.playCollision();
    this.audio?.stopEngine();
    this.projectileSystem.stopMissileAudio();
    this.deathReasonKey=reasonKey;this.deathReasonParams=params;
    this.deathReason&&(this.deathReason.textContent=t(reasonKey,params));
    if(this.deathScreen)this.deathScreen.hidden=false;
    if(this.status){this.status.classList.remove('complete');this.status.classList.add('destroyed');this.status.replaceChildren(document.createElement('i'),document.createTextNode(` ${t('combat.destroyed')}`));}
    this.combatEffects.addExplosion(this.player.position,1.35);
    this.missionFlow.fail();
    this.refreshHudState();
  }

  abortMission(){
    if(this.destroyed)return;
    this.destroyed=true;
    this.missionAborted=true;
    this.hudState.session.destroyed=true;
    this.combatHud.hideRadarAndBoundaryWarnings();
    if(this.terrain.boundaryLine)this.terrain.boundaryLine.visible=false;
    this.weaponSystem.stopGun();
    this.audio?.stopEngine();
    this.projectileSystem.stopMissileAudio();
    if(this.status){
      this.status.classList.remove('complete');
      this.status.classList.add('destroyed');
      this.status.replaceChildren(document.createElement('i'),document.createTextNode(` ${t('combat.missionAborted')}`));
    }
    this.missionSystem.finish(MISSION_OUTCOME.ABORTED);
    this.missionFlow.abort();
    this.refreshHudState();
  }

  damagePlayer(amount,reasonKey){
    if(this.destroyed)return;
    const hullBefore=this.feedback.hull;
    this.feedback.damage(amount);
    const appliedDamage=hullBefore-this.feedback.hull;
    this.damageTaken+=appliedDamage;
    this.telemetry?.recordPlayerDamage(reasonKey,appliedDamage);
    const previousHealthRatio=this.player.userData.airframeHealthRatio??1;
    const healthRatio=applyAirframeCondition(this.player,this.feedback.hull,this.feedback.maxHull);
    if(previousHealthRatio>=.3&&healthRatio<.3)this.feedback.notify('combat.flightControlsDegraded',2.2,'damage');
    this.audio?.playAirframeDamage(amount);
    if(this.feedback.hull<=0)this.destroyPlayer(reasonKey);
  }

  onMissileLaunch(enemy, missile, seeker, target=this.player){
    if(target!==this.player){
      this.airBattle.reportWingmanMissileInbound(enemy,target,missile);
      return;
    }
    this.missileLaunchSource=enemy;
    this.missileLaunchSeeker=seeker??null;
    this.missileLaunchTimer=Math.max(this.missileLaunchTimer,2.2);
    if(this.missileLaunchAlertCooldown<=0){
      this.audio?.playMissileLaunchWarning();
      const launchKey=seeker==='radar'
        ? 'combat.radarMissileLaunchDetected'
        : seeker==='ir'?'combat.irMissileLaunchDetected':'combat.missileLaunchDetected';
      this.feedback.notify(launchKey,2.1,'warning');
      this.missileLaunchAlertCooldown=2.8;
    }
    const reporter=this.airBattle.closestWingmanTo(enemy.mesh.position);
    if(reporter)this.radio.emit('wingman.missileInbound',{wingmanId:reporter.radioId,scope:'player'});
  }

  reportPopUpThreat(stage, units, scope='scheduled-reinforcement'){
    const position=units?.find(unit=>!unit.dead)?.mesh?.position;
    if(!position)return;
    const dx=position.x-this.player.position.x;
    const dz=position.z-this.player.position.z;
    const bearing=THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(Math.atan2(dx,dz)),360);
    const range=Math.hypot(dx,position.y-this.player.position.y,dz);
    const event=this.missionSystem.mission.id==='support'
      ?stage==='newContact'?'support.contactAwaitingOrders':'support.fightersIdentified'
      :stage==='newContact'?'threat.newContact':'threat.contactIdentified';
    this.radio.emit(event,{
      scope,
      params:{
        bearing:String(Math.round(bearing)%360).padStart(3,'0'),
        range:formatNumber(range/1000,{minimumFractionDigits:1,maximumFractionDigits:1}),
        intent:{key:contactIntent(units)},
      },
    });
  }

  reportInitialContactAssessment(){
    if(this.initialContactIdentificationReported)return;
    const contacts=this.enemies.filter(unit=>
      !unit.dead
      &&unit.encounterGroupId==='primary'
      &&unit.mesh?.position
      &&this.radar.tracks.has(unit.mesh),
    );
    if(!contacts.length)return;
    if(!this.initialContactReported){
      this.initialContactReported=true;
      this.reportPopUpThreat('newContact',contacts,'initial-contact');
    }
    const identified=contacts.filter(unit=>{
      if(unit.combatant===false)return false;
      const track=this.radar.tracks.get(unit.mesh);
      return track?.team==='hostile'&&!track.uncertain;
    });
    if(!identified.length)return;
    this.initialContactIdentificationReported=true;
    this.reportPopUpThreat('identified',identified,'initial-contact-identified');
  }

  reportOperationalEvent(event,unit){
    if(!unit)return;
    if(event==='airPolicing.identified'){
      this.radio.emit('mission.airPolicingIdentified',{
        scope:String(unit.mesh.id),
        params:{aircraft:unit.label??'aircraft'},
      });
      return;
    }
    if(event==='hostileApproach'){
      const position=unit.mesh?.position;
      if(!position)return;
      const dx=position.x-this.player.position.x;
      const dz=position.z-this.player.position.z;
      const bearing=THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(Math.atan2(dx,dz)),360);
      const range=Math.hypot(dx,position.y-this.player.position.y,dz);
      this.radio.emit('threat.contactCommit',{
        scope:String(unit.encounterGroupId??'primary'),
        params:{
          bearing:String(Math.round(bearing)%360).padStart(3,'0'),
          range:formatNumber(range/1000,{minimumFractionDigits:1,maximumFractionDigits:1}),
          intent:{key:contactIntent([unit])},
        },
      });
    }
  }

  recordDebriefEvent(event){
    if(!event)return;
    this.debriefEvents.push({
      ...event,
      elapsed:Math.max(0,Number(this.missionFlow?.elapsed??0)),
    });
  }

  recordTurningPoint(event){
    if(!event)return;
    const candidate={
      ...event,
      phase:event.phase??this.missionFlow?.phase??MISSION_PHASE.ENGAGEMENT,
      elapsed:Math.max(0,Number(this.missionFlow?.elapsed??0)),
    };
    if(!this.debriefTurningPoint||candidate.priority>(this.debriefTurningPoint.priority??0)){
      this.debriefTurningPoint=candidate;
    }
    this.recordDebriefEvent(candidate);
  }

  recordThreatBreach(key,params={},priority=100){
    const phase=this.missionFlow?.phase??MISSION_PHASE.ENGAGEMENT;
    const threat={key,params,phase,elapsed:Math.max(0,Number(this.missionFlow?.elapsed??0))};
    if(!this.debriefThreats.some(item=>item.key===key&&item.phase===phase)){
      this.debriefThreats.push(threat);
    }
    this.recordTurningPoint({
      key:'mission.debrief.turningPoint.threatBreakthrough',
      phase,
      priority,
      params:{threat:{key,params}},
    });
  }

  recordOptionalObjectiveChanges(results=[]){
    for(const result of results){
      if(!result?.id)continue;
      const previous=this.debriefOptionalStatuses.get(result.id);
      if(previous===result.status)continue;
      this.debriefOptionalStatuses.set(result.id,result.status);
      if(result.status==='failed'){
        if(result.type==='interceptBeforeZone'&&result.detailKey==='mission.optionalObjective.result.zoneReached'){
          this.recordThreatBreach('mission.debrief.threat.installation',{target:result.params?.target
            ?{key:result.params.target}
            :undefined});
        }else if(result.type==='protectFriendlyGroundUnit'){
          this.recordThreatBreach('mission.debrief.threat.friendlyLine');
        }
      }
    }
  }

  reportMissionPhase(previous,phase){
    const keys={
      [MISSION_PHASE.CONTACT]:'mission.contact',
      [MISSION_PHASE.ENGAGEMENT]:'mission.engagement',
      [MISSION_PHASE.OBJECTIVE]:'mission.objective',
      [MISSION_PHASE.RTB]:'mission.rtb',
    };
    const event=keys[phase];
    if(!event)return;
    this.recordDebriefEvent({key:`mission.debrief.phase.${phase}`,phase,previous});
    if(phase===MISSION_PHASE.ENGAGEMENT&&!this.debriefTurningPoint){
      this.recordTurningPoint({key:'mission.debrief.turningPoint.engagement',phase,priority:10});
    }
    if(phase===MISSION_PHASE.OBJECTIVE&&this.missionSystem.objectiveSatisfied)return;
    this.radio.emit(event);
    const controlEvents={
      [MISSION_PHASE.CONTACT]:'mission.controlContact',
      [MISSION_PHASE.ENGAGEMENT]:'mission.controlEngagement',
      [MISSION_PHASE.OBJECTIVE]:'mission.controlObjective',
      [MISSION_PHASE.RTB]:'mission.controlRtb',
    };
    const controlEvent=controlEvents[phase];
    if(controlEvent)this.radio.emit(controlEvent,{scope:`phase:${phase}`});
    if(phase===MISSION_PHASE.RTB){
      const accepted=this.airBattle.issueWingmanOrder('rtb');
      this.radio.acknowledgeWingmanCommand('rtb',this.airBattle.allies,accepted);
    }
  }

  reportWingmanRadio(event,wingman,details={}){
    const eventNames={
      formation:'wingman.formation',
      contact:'wingman.contact',
      six:'wingman.six',
      missileLock:'wingman.missileLock',
      missileInbound:'wingman.missileInbound',
      rescueMissileInbound:'wingman.rescueMissileInbound',
      hit:'wingman.hit',
      lost:'wingman.lost',
      targetDestroyed:'wingman.targetDestroyed',
      rifle:'wingman.rifle',
    };
    const eventName=eventNames[event];
    if(!eventName)return;
    if(event==='lost')this.combatEffects.addExplosion(wingman.mesh.position,.82);
    this.radio.emit(eventName,{
      wingmanId:wingman.radioId,
      params:details.params,
      scope:details.scope??'',
      priority:event==='six'?4:undefined,
    });
  }

  finishMission(outcome,elapsed){
    if(this.missionEnded)return;
    this.refreshOptionalObjectiveState();
    this.optionalObjectiveState.outcome=outcome;
    this.optionalObjectiveState.elapsed=elapsed;
    const optionalObjectiveResults=this.optionalObjectiveTracker.update(this.optionalObjectiveState,true);
    this.recordOptionalObjectiveChanges(optionalObjectiveResults);
    if(outcome===MISSION_OUTCOME.SETBACK
      &&this.missionSystem.mission.objective?.type==='forceDefense'
      &&!this.debriefThreats.some(threat=>threat.key==='mission.debrief.threat.friendlyLine')){
      this.recordThreatBreach('mission.debrief.threat.friendlyLine');
    }
    if(!this.debriefTurningPoint){
      const lastPhase=this.debriefEvents.filter(event=>event.phase&&event.phase!==MISSION_PHASE.DEBRIEF).at(-1)?.phase
        ?? MISSION_PHASE.ENGAGEMENT;
      this.recordTurningPoint({
        key:outcome===MISSION_OUTCOME.COMPLETE
          ?'mission.debrief.turningPoint.extraction'
          :'mission.debrief.turningPoint.missionFailed',
        phase:outcome===MISSION_OUTCOME.COMPLETE?MISSION_PHASE.RTB:lastPhase,
        priority:20,
      });
    }
    this.missionSystem.finish(outcome);
    this.missionEnded=true;
    if(outcome===MISSION_OUTCOME.COMPLETE)this.scoreSystem.awardMissionCompletion();
    this.deathScreen&&(this.deathScreen.hidden=true);
    const objectiveNotice=document.querySelector('#mission-complete');
    if(objectiveNotice){objectiveNotice.hidden=true;objectiveNotice.classList.remove('visible');}
    const gunRounds=this.weaponSystem.gunRoundCount;
    this.debriefData={
      outcome,
      playerRecovered: outcome===MISSION_OUTCOME.SETBACK,
      elapsed,
      missionId:this.missionSystem.mission.id,
      campaignId:this.missionSystem.mission.campaignId ?? null,
      campaignChapterId:this.missionSystem.mission.campaignChapterId ?? null,
      campaignAttemptId:this.missionSystem.mission.campaignAttemptId ?? null,
      displayTitleKey:this.missionSystem.mission.displayTitleKey ?? null,
      variantId:this.missionVariant?.id ?? null,
      variantLabelKey:this.missionVariant?.labelKey ?? null,
      difficulty:this.difficulty?.id,
      score:this.score,
      airKills:this.airKills,
      groundKills:this.groundKills,
      kills:this.airKills + this.groundKills,
      gunRounds,
      gunHits:this.gunHits,
      accuracy:gunRounds>0?this.gunHits/gunRounds:0,
      missilesFired:this.weaponSystem.missilesFired,
      missilesHit:this.scoreSystem.playerMissileHits,
      damageTaken:this.damageTaken,
      playerMaxHull:this.feedback.maxHull,
      wingmenSurvived:this.airBattle.allies.reduce((count,wingman)=>count+Number(!wingman.dead),0),
      wingmenTotal:this.airBattle.allies.length,
      objectivesCompleted:this.missionSystem.objectiveSatisfied?1:0,
      objectiveCount:1,
      missionTime:Math.max(0,elapsed),
      optionalObjectives:optionalObjectiveResults,
      turningPoint:this.debriefTurningPoint,
      threatsPassed:this.debriefThreats,
      remainingStores: {
        airMissiles: this.weaponSystem.missiles.air,
        groundMissiles: this.weaponSystem.missiles.ground,
        gunRounds: this.weaponSystem.gunAmmoRemaining,
        flares: this.countermeasureSystem.flares,
        chaff: this.countermeasureSystem.chaff,
        fuelMinutes: this.fuelSystem.unlimited ? null : this.fuelSystem.remainingSeconds / 60,
      },
    };
    this.debriefData.wingmenReturned=this.debriefData.wingmenSurvived;
    this.debriefData.grade=calculateDebriefGrade(this.debriefData);
    this.renderDebrief();
    this.onMissionEnd(outcome,this.debriefData);
  }

  renderDebrief(){
    if(!this.debriefData)return;
    const {outcome,elapsed}=this.debriefData;
    const successful=outcome===MISSION_OUTCOME.COMPLETE;
    const setback=outcome===MISSION_OUTCOME.SETBACK;
    const aborted=outcome===MISSION_OUTCOME.ABORTED;
    const text=(node,key)=>{if(node)node.textContent=t(key);};
    text(this.debriefNodes.title,successful
      ?'mission.debrief.completeTitle'
      :setback?'mission.debrief.setbackTitle':aborted?'mission.debrief.abortedTitle':'mission.debrief.failedTitle');
    text(this.debriefNodes.mission,this.debriefData.displayTitleKey ?? `mission.${this.missionSystem.mission.id}.title`);
    text(this.debriefNodes.difficulty,`difficulty.${this.debriefData.difficulty}`);
    if(this.debriefNodes.variant){
      this.debriefNodes.variant.hidden=!this.debriefData.variantLabelKey;
      this.debriefNodes.variant.textContent=this.debriefData.variantLabelKey
        ?t('mission.debrief.variant',{name:t(this.debriefData.variantLabelKey)})
        :'';
    }
    const outcomeText=t(successful
      ?'mission.debrief.complete'
      :setback?'mission.debrief.setback':aborted?'mission.debrief.aborted':'mission.debrief.failed');
    const lossCause=!successful&&!aborted&&this.deathReasonKey?` · ${t(this.deathReasonKey,this.deathReasonParams)}`:'';
    if(this.debriefNodes.outcome)this.debriefNodes.outcome.textContent=`${outcomeText}${lossCause}`;
    const turningPoint=this.debriefData.turningPoint;
    const phaseParam=turningPoint?.phase
      ? {key:`mission.phase.${turningPoint.phase}.title`}
      : {key:'mission.phase.engagement.title'};
    if(this.debriefNodes.turningPoint){
      this.debriefNodes.turningPoint.textContent=turningPoint
        ? t(turningPoint.key,{...turningPoint.params,phase:phaseParam})
        : t('mission.debrief.turningPoint.none');
    }
    if(this.debriefNodes.threatBreach){
      const threat=this.debriefData.threatsPassed?.[0];
      this.debriefNodes.threatBreach.textContent=threat
        ? t(threat.key,threat.params)
        : t('mission.debrief.threat.none');
    }
    const seconds=Math.max(0,Math.floor(elapsed));
    if(this.debriefNodes.duration)this.debriefNodes.duration.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
    if(this.debriefNodes.airKills)this.debriefNodes.airKills.textContent=formatNumber(this.airKills);
    if(this.debriefNodes.groundKills)this.debriefNodes.groundKills.textContent=formatNumber(this.groundKills);
    if(this.debriefNodes.kills)this.debriefNodes.kills.textContent=formatNumber(this.debriefData.kills);
    if(this.debriefNodes.gunRounds)this.debriefNodes.gunRounds.textContent=formatNumber(this.debriefData.gunRounds);
    if(this.debriefNodes.missiles)this.debriefNodes.missiles.textContent=formatNumber(this.debriefData.missilesFired);
    if(this.debriefNodes.missileHits)this.debriefNodes.missileHits.textContent=`${formatNumber(this.debriefData.missilesHit)} / ${formatNumber(this.debriefData.missilesFired)}`;
    if(this.debriefNodes.wingmen)this.debriefNodes.wingmen.textContent=`${formatNumber(this.debriefData.wingmenReturned)} / ${formatNumber(this.debriefData.wingmenTotal)}`;
    if(this.debriefNodes.score)this.debriefNodes.score.textContent=formatNumber(this.debriefData.score);
    if(this.debriefNodes.accuracy)this.debriefNodes.accuracy.textContent=this.debriefData.gunRounds>0?formatPercent(this.debriefData.accuracy):'—';
    if(this.debriefNodes.damage)this.debriefNodes.damage.textContent=formatNumber(Math.round(this.debriefData.damageTaken));
    if(this.debriefNodes.objectives)this.debriefNodes.objectives.textContent=`${this.debriefData.objectivesCompleted} / ${this.debriefData.objectiveCount}`;
    renderOptionalObjectives(
      this.debriefNodes.optionalObjectives,
      this.missionSystem.mission.optionalObjectives,
      this.debriefData.optionalObjectives,
    );
    const grade=this.debriefData.grade;
    if(this.debriefNodes.gradeMark)this.debriefNodes.gradeMark.textContent=grade.letter;
    if(this.debriefNodes.gradeScore)this.debriefNodes.gradeScore.textContent=t('mission.debrief.grade.summary',{
      letter:grade.letter,
      percent:formatNumber(grade.percentage),
      earned:formatNumber(grade.earned),
      possible:formatNumber(grade.possible),
    });
    for(const criterion of grade.criteria){
      const node=this.debriefNodes.gradeCriteria[criterion.key];
      if(!node)continue;
      const reasonParams=Object.fromEntries(Object.entries(criterion.params).map(([key,value])=>[
        key,typeof value==='number'?formatNumber(value):value,
      ]));
      const reason=t(criterion.reasonKey,reasonParams);
      node.textContent=criterion.possible>0
        ?t('mission.debrief.grade.points',{
          earned:formatNumber(criterion.earned),
          possible:formatNumber(criterion.possible),
          reason,
        })
        :t('mission.debrief.grade.notScored',{reason});
    }
  }
  refreshOptionalObjectiveState(){
    const state=this.optionalObjectiveState;
    if(!state)return;
    state.outcome=this.missionFlow?.outcome??MISSION_OUTCOME.ACTIVE;
    state.elapsed=this.missionFlow?.elapsed??0;
    state.damageTaken=this.damageTaken;
    state.wingmenTotal=this.airBattle.allies.length;
    state.wingmenReturned=0;
    for(const wingman of this.airBattle.allies)if(!wingman.dead)state.wingmenReturned++;
    state.missilesRemaining=this.weaponSystem.missiles.air+this.weaponSystem.missiles.ground;
  }
  clearInput(){
    this.input.clear();
    this.weaponSystem.stopGun();
  }
  dispose(){
    this.setTelemetry(null);
    this.clearInput();
    this.input.dispose();
    document.removeEventListener('ilmatila:languagechange', this.onLanguageChange);
    this.restartButton?.removeEventListener('click', this.onRestart);
    this.encounterDirector.dispose();
    this.missionSystem.dispose();
    this.projectileSystem.dispose();
    this.feedback.dispose();
    this.radio.dispose();
    this.airBattle.dispose();
    this.groundBattle.dispose();
    this.combatEffects.dispose();
    this.countermeasureSystem.dispose();
    this.radar.dispose();
    this.incomingAircraftMissiles.length=0;
    this.missileLaunchSource=null;
    this.missileLaunchSeeker=null;
    this.missileLaunchTimer=0;
    this.missileLaunchAlertCooldown=0;
    const designator=document.querySelector('#target-designator');
    if(designator){designator.hidden=true;designator.classList.remove('ground-target','locked');}
    this.combatHud.dispose();
    const missileCue=document.querySelector('#missile-approach-cue');
    if(missileCue)missileCue.hidden=true;
    if(this.status){this.status.classList.remove('destroyed','complete');this.status.replaceChildren(document.createElement('i'),document.createTextNode(` ${t('hud.ready')}`));}
  }
  updateHud(){
    this.updateBoundaryVisual();
    this.refreshHudState();
    this.combatHud.update(this.hudState);
  }
  updateBoundaryVisual(){
    const bounds=this.terrain.operationBounds??this._fallbackBoundaryBounds;
    const rectangularClearance=Math.max(0,Math.min(
      this.player.position.x-bounds.minX,
      bounds.maxX-this.player.position.x,
      this.player.position.z-bounds.minZ,
      bounds.maxZ-this.player.position.z,
    ));
    const clearance=this.terrain.getBoundaryClearance?.(this.player.position.x,this.player.position.z)
      ?? rectangularClearance;
    const approach=this.terrain.getBoundaryApproach
      ? this.terrain.getBoundaryApproach(this.player.position,this.playerVelocity,this._boundaryApproachScratch)
      : getBoundaryApproach(this.player.position,this.playerVelocity,bounds,5_000,25,this._boundaryApproachScratch);
    const critical=Boolean(approach&&approach.clearance<=1_500);
    this.boundaryApproach=approach;
    this.boundaryCritical=critical;
    const boundaryLine=this.terrain.boundaryLine;
    if(!boundaryLine)return;
    const lineFade=1-THREE.MathUtils.smoothstep(clearance,8_000,22_000);
    const lineVisible=!this.destroyed&&lineFade>0;
    boundaryLine.visible=lineVisible;
    const state=boundaryLine.userData;
    if(state.coreMaterial)state.coreMaterial.opacity=lineVisible?lineFade*(critical ? .88 : .72):0;
    if(state.glowMaterial)state.glowMaterial.opacity=lineVisible?lineFade*(critical ? .16 : .11):0;
    if(state.hazeMaterial)state.hazeMaterial.opacity=lineVisible?lineFade*(critical ? .055 : .035):0;
    if(state.coreMaterial)state.coreMaterial.color.setHex(critical?0xff514d:0xef4142);
    if(state.glowMaterial)state.glowMaterial.color.setHex(critical?0xf04b4b:0xd9363d);
    if(state.hazeMaterial)state.hazeMaterial.color.setHex(critical?0xee5552:0xc83c43);
  }
  getPlayerRadarWarningState(){
    let searching=false;
    let tracking=false;
    let disrupted=false;
    let groundTracking=false;
    let radarLock=false;
    let infraredLock=false;
    for(const enemy of this.enemies){
      if(enemy.dead||enemy.identified===false)continue;
      if(enemy.kind==='attack-helicopter'){
        if(enemy.airMissileLockRemaining!=null)infraredLock=true;
        continue;
      }
      if(enemy.missileLockRemaining!=null&&(!enemy.missileLockTarget||enemy.missileLockTarget===this.player)){
        if(enemy.missileLockSeeker==='ir')infraredLock=true;
        else radarLock=true;
      }
      if(enemy.radarTrackDisruptionRemaining>0){disrupted=true;continue;}
      if(enemy.phase!=='staging'&&(enemy.engagementTarget===this.player||enemy.burstTarget===this.player))tracking=true;
      if(enemy.phase==='staging'&&enemy.detectedPlayerTimer>0)searching=true;
    }
    for(const unit of this.redUnits){
      if(!unit.dead&&unit.aaPlayerTracking)groundTracking=true;
    }
    if(radarLock)return 'lock';
    if(infraredLock)return 'irLock';
    if(tracking)return 'track';
    if(groundTracking)return 'groundTrack';
    if(disrupted)return 'disrupted';
    if(searching)return 'search';
    return null;
  }
}
