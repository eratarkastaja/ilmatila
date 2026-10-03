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

export { disposeCombatEffectResources };

const forward=new THREE.Vector3(0,0,1);
const headingDirection=new THREE.Vector3();
const HUD_UPDATE_INTERVAL=1/15;
const LOW_FUEL_PRESSURE_FRACTION=.2;

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
    this.fuelSystem=new FuelSystem(this.difficulty.player.fuel);
    this.seed = Number(seed) >>> 0;
    this.random = createSeededRandom(this.seed);
    this.telemetry=null;
    const missionResolution=resolveMissionVariant(mission,this.seed);
    this.missionVariant=missionResolution.variant;
    this.encounters=missionResolution.encounters;
    const missionConfig={hostiles:4,wingmen:2,groundBattle:true,groundPairs:6,groundTrucks:12,...missionResolution.mission};
    missionConfig.optionalObjectives=scaleMissileReserveObjectives(
      missionConfig.optionalObjectives,
      this.difficulty.player.weapons,
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
      maxHull:this.difficulty?.player?.hull,
    });
    this.radio = new RadioSystem({
      node:document.querySelector('#radio-call'),
      audio,
    });
    this.radio.emit('mission.departure');
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
    this.terrain=terrain; this.playerHeading=0; this.previousPlayerPosition=player.position.clone();
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
      canStartHostileMissileAttack: (enemy, target) => this.canStartHostileMissileAttack(enemy, target),
      difficulty:this.difficulty,
      random:this.random,
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
    this.encounterDirector=new EncounterDirector(this.encounters,{
      onWarning:event=>this.radio.emit(event.warningEvent,{scope:event.id,params:{
        minimum:String(event.delayRangeSeconds.min),maximum:String(event.delayRangeSeconds.max),
      }}),
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
      initialCount:this.difficulty?.player?.countermeasures,
      chaffConfig:this.difficulty?.player?.chaff,
      random:this.random,
      onInventoryChange: () => this.updateHud(),
    });
    this.projectileSystem.setDecoys(this.countermeasureSystem.decoys);
    this.radar = new CombatRadar(player, audio);
    this.weaponSystem = new WeaponSystem({
      player, scene, fx, audio, radar: this.radar, playerVelocity: this.playerVelocity,
      addProjectile: shot => this.projectileSystem.addPlayerProjectile(shot),
      loadout:this.difficulty?.player?.weapons,
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
        state.airRemaining += this.encounterDirector.getPendingHostileCount();
        state.groundRemaining=0;
        if(this.airBattle.hostilesSpawned){
          for(const enemy of this.enemies)if(!enemy.dead)state.airRemaining++;
        }
        for(const unit of this.redUnits)if(!unit.dead&&unit.armed!==false)state.groundRemaining++;
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
      onIngress:()=>{
        this.airBattle.spawnHostiles();
        this.groundBattle.setAirDefenseActive(true);
        const reporter=this.airBattle.allies.find(wingman=>!wingman.dead);
        if(reporter)this.radio.emit('wingman.ingress',{wingmanId:reporter.radioId,scope:'ingress'});
      },
      onObjectiveActive:()=>this.missionSystem.activate(),
      onObjectiveComplete:()=>{
        this.missionSystem.notifyObjectiveAchieved();
        this.radio.emit('mission.objectiveComplete');
      },
      onRtb:()=>this.missionSystem.returnToBase(),
      onPhaseChange:(_previous,phase)=>this.reportMissionPhase(phase),
      onEnd:(outcome,elapsed)=>this.finishMission(outcome,elapsed),
    });
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
      targetDestroyed:false,objectiveSatisfied:false,destroyed:false,
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
      weapons:{missiles:this.weaponSystem.missiles,gunAmmoRemaining:this.weaponSystem.gunAmmoRemaining,cooldown:0,feedbackKey:null,feedbackTimer:0},
      fuel:{unlimited:this.fuelSystem.unlimited,fraction:this.fuelSystem.fraction},
      countermeasures:{flares:0,chaff:0},
      wingmanOrder:this.airBattle.wingmanOrder,
      wingmanRescue:{wingman:null,attacker:null,remaining:0,missileInbound:false},
      supportForce:{active:false,fraction:1,unitsAlive:0,unitsTotal:0},
      score:0,
      mission:{waypoint:null,boundaryApproach:null,boundaryCritical:false},
      threats:{
        radarWarningState:null,missile:null,missileEta:Infinity,missileDistance:Infinity,
        launchVisible:false,launchSourcePosition:null,launchSeeker:null,
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
    state.mission.waypoint=this.missionFlow.waypoint;
    state.mission.boundaryApproach=this.boundaryApproach;
    state.mission.boundaryCritical=this.boundaryCritical;
    state.threats.radarWarningState=this.getPlayerRadarWarningState();
    state.threats.missile=this.projectileSystem.missileThreat;
    state.threats.missileEta=this.projectileSystem.missileThreatEta;
    state.threats.missileDistance=this.projectileSystem.missileThreatDistance;
    state.threats.launchVisible=Boolean(
      this.missileLaunchTimer>0&&this.missileLaunchSource&&!this.missileLaunchSource.dead,
    );
    state.threats.launchSourcePosition=this.missileLaunchSource?.mesh?.position??null;
    state.threats.launchSeeker=this.missileLaunchSeeker;
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
    const wingmanOrder=justPressed.has('Digit1')?'attack':justPressed.has('Digit2')?'defend':justPressed.has('Digit3')?'regroup':justPressed.has('Digit4')?'disengage':null;
    if(radarModeRequested)this.radar.toggleMode();
    if(flareRequested){
      const deployed=this.countermeasureSystem.deployFlare();
      this.feedback.countermeasures('flare',deployed,this.countermeasureSystem.lastPlayerDeployment,this.countermeasureSystem.flares);
    }
    if(chaffRequested){
      const deployed=this.countermeasureSystem.deployChaff();
      this.feedback.countermeasures('chaff',deployed,this.countermeasureSystem.lastChaffDeployment,this.countermeasureSystem.chaff);
    }
    if(wingmanOrder&&this.airBattle.issueWingmanOrder(wingmanOrder)){
      this.audio?.playWingmanOrder(wingmanOrder);
      this.feedback.notify(`combat.wingmanOrder.${wingmanOrder}`,1.65,'friendly');
      this.radio.acknowledgeWingmanCommand(wingmanOrder,this.airBattle.allies,true);
    }
    const gunFiring=(this.input.pressed.has('Space')||this.input.pressed.has('MousePrimary'))&&!this.destroyed;
    this.radar.updateContacts(dt,this.getPlayerHeading(),this._radarContactSets);
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
    encounterContext.objectiveActive=this.missionSystem.objectiveActive;
    encounterContext.playerCombatCapable=!this.destroyed&&this.feedback.hull>this.feedback.maxHull*.25;
    encounterContext.complicationActive=this.isTacticalComplicationActive();
    this.encounterDirector.update(dt,encounterContext);
    this.missionSystem.totals.air=this.baseObjectiveAirTotal+this.encounterDirector.getPlannedHostileCount();
    this.combatEffects.update(dt);
    this.radio.update(dt);
    this.refreshOptionalObjectiveState();
    const optionalResults=this.optionalObjectiveTracker.update(this.optionalObjectiveState);
    if(!this.protectedSiteLossReported&&optionalResults.some(result=>
      result.type==='interceptBeforeZone'
      &&result.status==='failed'
      &&result.detailKey==='mission.optionalObjective.result.zoneReached')){
      this.protectedSiteLossReported=true;
      this.radio.emit('mission.protectedSiteLost',{scope:'protected-installation'});
    }
    this.missionSystem.update(dt,this.destroyed);
    if(this.missionSystem.objectiveSatisfied)this.scoreSystem.awardObjectiveCompletion();
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

  reportPopUpThreat(stage, units){
    const position=units?.find(unit=>!unit.dead)?.mesh?.position;
    if(!position)return;
    const dx=position.x-this.player.position.x;
    const dz=position.z-this.player.position.z;
    const bearing=THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(Math.atan2(dx,dz)),360);
    const range=Math.hypot(dx,position.y-this.player.position.y,dz);
    const event=this.mission.id==='support'
      ?stage==='newContact'?'support.contactAwaitingOrders':'support.fightersIdentified'
      :stage==='newContact'?'threat.newContact':'threat.contactIdentified';
    this.radio.emit(event,{
      scope:'scheduled-reinforcement',
      params:{
        bearing:String(Math.round(bearing)%360).padStart(3,'0'),
        range:formatNumber(range/1000,{minimumFractionDigits:1,maximumFractionDigits:1}),
      },
    });
  }

  reportMissionPhase(phase){
    const keys={
      [MISSION_PHASE.CONTACT]:'mission.contact',
      [MISSION_PHASE.ENGAGEMENT]:'mission.engagement',
      [MISSION_PHASE.OBJECTIVE]:'mission.objective',
      [MISSION_PHASE.RTB]:'mission.rtb',
    };
    const event=keys[phase];
    if(!event)return;
    if(phase===MISSION_PHASE.OBJECTIVE&&this.missionSystem.objectiveSatisfied)return;
    this.radio.emit(event);
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
    this.missionSystem.finish(outcome);
    this.missionEnded=true;
    if(outcome===MISSION_OUTCOME.COMPLETE)this.scoreSystem.awardMissionCompletion();
    this.deathScreen&&(this.deathScreen.hidden=true);
    const objectiveNotice=document.querySelector('#mission-complete');
    if(objectiveNotice){objectiveNotice.hidden=true;objectiveNotice.classList.remove('visible');}
    const gunRounds=this.weaponSystem.gunRoundCount;
    this.debriefData={
      outcome,
      elapsed,
      missionId:this.missionSystem.mission.id,
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
    const aborted=outcome===MISSION_OUTCOME.ABORTED;
    const text=(node,key)=>{if(node)node.textContent=t(key);};
    text(this.debriefNodes.title,successful?'mission.debrief.completeTitle':aborted?'mission.debrief.abortedTitle':'mission.debrief.failedTitle');
    text(this.debriefNodes.mission,`mission.${this.missionSystem.mission.id}.title`);
    text(this.debriefNodes.difficulty,`difficulty.${this.debriefData.difficulty}`);
    if(this.debriefNodes.variant){
      this.debriefNodes.variant.hidden=!this.debriefData.variantLabelKey;
      this.debriefNodes.variant.textContent=this.debriefData.variantLabelKey
        ?t('mission.debrief.variant',{name:t(this.debriefData.variantLabelKey)})
        :'';
    }
    const outcomeText=t(successful?'mission.debrief.complete':aborted?'mission.debrief.aborted':'mission.debrief.failed');
    const lossCause=!successful&&!aborted&&this.deathReasonKey?` · ${t(this.deathReasonKey,this.deathReasonParams)}`:'';
    if(this.debriefNodes.outcome)this.debriefNodes.outcome.textContent=`${outcomeText}${lossCause}`;
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
