import * as THREE from 'three';
import { AirBattle } from './air-battle.js';
import { GroundBattle } from './ground-battle.js';
import { CombatInput } from './input.js';
import { CombatRadar } from './radar.js';
import { MISSILE_PROFILES } from './projectiles.js';
import { ProjectileSystem } from './projectile-system.js';
import { CollisionSystem } from './collision-system.js';
import { CountermeasureSystem } from './countermeasure-system.js';
import { MissionSystem } from './mission-system.js';
import { MISSION_PHASE, MissionFlowSystem } from './mission-flow.js';
import { MISSION_OUTCOME } from './mission-objective.js';
import { WeaponSystem } from './weapon-system.js';
import { CombatFeedback } from './combat-feedback.js';
import { RadioSystem } from './radio-system.js';
import { ScoreSystem } from './score-system.js';
import { DestructionSystem } from './destruction-system.js';
import { applyAirframeCondition } from './airframe-condition.js';
import { getBoundaryApproach } from './boundary-warning.js';
import { getDifficultyPreset } from './difficulty.js';
import { addTransientGlow, CombatEffects, disposeCombatEffectResources } from '../effects/combat-effects.js';
import { formatNumber, formatPercent, t } from '../ui/i18n.js';

export { disposeCombatEffectResources };

const forward=new THREE.Vector3(0,0,1);
const headingDirection=new THREE.Vector3();

export class CombatWorld {
  constructor(scene, player, terrain, fx, aircraftAsset = null, mission = {}, audio = null, onMissionEnd = () => {}, difficultyId = 'standard', inputTarget = null) {
    this.scene=scene; this.player=player; this.destroyed=false; this.missionAborted=false;
    this.fx=fx; this.audio=audio;
    this.onMissionEnd=onMissionEnd;
    this.difficulty=getDifficultyPreset(difficultyId);
    const missionConfig={hostiles:4,wingmen:2,groundBattle:true,groundPairs:6,groundTrucks:12,...mission};
    this.input = new CombatInput(window, inputTarget);
    this.scoreSystem=new ScoreSystem();
    this.damageTaken=0;
    this.feedback = new CombatFeedback({
      hud: document.querySelector('#flight-hud'),
      message: document.querySelector('#combat-feedback'),
      hitMarker: document.querySelector('#gun-hit-feedback'),
      hullFill: document.querySelector('#hull-fill'),
      hullValue: document.querySelector('#hull-value'),
      countermeasureRow: document.querySelector('.countermeasure-row'),
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
    this.missileLaunchAlertCooldown=0;
    this.terrain=terrain; this.playerHeading=0; this.previousPlayerPosition=player.position.clone();
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
      onMissileLaunch: enemy => this.onMissileLaunch(enemy),
      onWingmanRadio: (event, wingman, details) => this.reportWingmanRadio(event, wingman, details),
      difficulty:this.difficulty,
    });
    this.groundBattle = new GroundBattle({
      scene, player, playerVelocity: this.playerVelocity, terrain, mission: missionConfig,
      audio, fx, difficulty:this.difficulty, enemies:this.airBattle.enemies,
      addProjectile: shot => this.projectileSystem.addHostileProjectile(shot),
      addFriendlyProjectile: shot => this.projectileSystem.addPlayerProjectile(shot),
    });
    this.airBattle.setGroundUnits(this.groundBattle.redUnits);
    this.airBattle.setFriendlyGroundUnits(this.groundBattle.friends);
    const objectiveTotals={
      air:missionConfig.hostiles + (missionConfig.hostileHelicopters ?? 0),
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
      onPlayerDestroyed: (reason, params) => this.destroyPlayer(reason, params),
      playerVelocity: this.playerVelocity,
      onPlayerDamaged: (amount, reason) => this.damagePlayer(amount, reason),
      onPlayerHit: (target, details) => {
        this.scoreSystem.recordGunHit();
        this.feedback.gunHit(details.destroyed);
        this.audio?.playGunHit();
      },
      onFriendlyAircraftHit: (wingman, damage, sourceUnit) => this.airBattle.damageWingman(wingman, damage, sourceUnit),
      onJetDestroyed: (enemy, credited, details) => this.destructionSystem.destroyAircraft(enemy, credited, details),
      onUnitDestroyed: (unit, credited, details) => this.destructionSystem.destroyGroundUnit(unit, credited, details),
      addSpark: position => this.combatEffects.addSpark(position),
      addWaterImpact: position => this.fx?.addWaterImpact(position),
      addExplosion: (position, intensity) => this.combatEffects.addExplosion(position, intensity),
    });
    this.countermeasureSystem = new CountermeasureSystem({
      scene, player, playerVelocity: this.playerVelocity, fx, audio,
      playerShots: this.projectileSystem.playerShots, hostileShots: this.projectileSystem.hostiles,
      addTransientGlow,
      initialCount:this.difficulty?.player?.countermeasures,
      onInventoryChange: () => this.updateHud(),
    });
    this.projectileSystem.setDecoys(this.countermeasureSystem.decoys);
    this.radar = new CombatRadar(player, audio);
    this.weaponSystem = new WeaponSystem({
      player, scene, fx, audio, radar: this.radar, playerVelocity: this.playerVelocity,
      addProjectile: shot => this.projectileSystem.addPlayerProjectile(shot),
    });
    this.lastObservedMissilesFired=this.weaponSystem.missilesFired;
    this.weapon=document.querySelector('#weapon'); this.ammo=document.querySelector('#ammo'); this.missileType=document.querySelector('#missile-type'); this.missileCount=document.querySelector('#missile-count'); this.scoreEl=document.querySelector('#score');
    this.countermeasureCount=document.querySelector('#countermeasure-count'); this.threatWarning=document.querySelector('#threat-warning');
    this.threatWarningLabel=document.querySelector('#threat-warning-label');
    this.threatWarningDetail=document.querySelector('#threat-warning-detail');
    this.wingmanOrderNode=document.querySelector('#wingman-order');
    this.boundaryWarning=document.querySelector('#boundary-warning');
    this.boundaryWarningText=document.querySelector('#boundary-warning-text');
    this.boundaryWarningDistance=document.querySelector('#boundary-warning-distance');
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
        state.airRemaining=this.airBattle.hostilesSpawned?0:missionConfig.hostiles+(missionConfig.hostileHelicopters??0);
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
      difficulty:document.querySelector('#debrief-difficulty'),
      outcome:document.querySelector('#debrief-outcome'),
      duration:document.querySelector('#debrief-duration'),
      airKills:document.querySelector('#debrief-air-kills'),
      groundKills:document.querySelector('#debrief-ground-kills'),
      gunRounds:document.querySelector('#debrief-gun-rounds'),
      missiles:document.querySelector('#debrief-missiles'),
      score:document.querySelector('#debrief-score'),
      accuracy:document.querySelector('#debrief-accuracy'),
      damage:document.querySelector('#debrief-damage'),
      objectives:document.querySelector('#debrief-objectives'),
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
  getPlayerHeading(){
    const direction=headingDirection.copy(forward).applyQuaternion(this.player.quaternion);
    if(direction.x*direction.x+direction.z*direction.z>1e-4)this.playerHeading=Math.atan2(direction.x,direction.z);
    return this.playerHeading;
  }
  update(dt){
    this.frameDelta=dt;
    this.missileLaunchTimer=Math.max(0,this.missileLaunchTimer-dt);
    this.missileLaunchAlertCooldown=Math.max(0,this.missileLaunchAlertCooldown-dt);
    if(this.missileLaunchTimer<=0)this.missileLaunchSource=null;
    this.countermeasureSystem.tick(dt);
    if(dt>0){this.playerVelocity.copy(this.player.position).sub(this.previousPlayerPosition).multiplyScalar(1/dt);this.previousPlayerPosition.copy(this.player.position);}
    const justPressed = this.input.consumeJustPressed();
    const radarModeRequested=justPressed.has('KeyR');
    const targetCycleDirection=justPressed.has('KeyY')?-1:justPressed.has('KeyT')?1:0;
    const missileRequested=justPressed.has('KeyM')||justPressed.has('MouseSecondary');
    const countermeasureRequested=justPressed.has('KeyF');
    const wingmanOrder=justPressed.has('Digit1')?'attack':justPressed.has('Digit2')?'defend':justPressed.has('Digit3')?'regroup':justPressed.has('Digit4')?'disengage':null;
    if(radarModeRequested)this.radar.toggleMode();
    if(countermeasureRequested){
      const deployed=this.countermeasureSystem.deployPlayer();
      this.feedback.countermeasures(deployed,this.countermeasureSystem.lastPlayerDeployment,this.countermeasureSystem.countermeasures);
    }
    if(wingmanOrder&&this.airBattle.issueWingmanOrder(wingmanOrder)){
      this.audio?.playWingmanOrder(wingmanOrder);
      this.feedback.notify(`combat.wingmanOrder.${wingmanOrder}`,1.65,'friendly');
      this.radio.acknowledgeWingmanCommand(wingmanOrder,this.airBattle.allies,true);
    }
    const gunFiring=(this.input.pressed.has('Space')||this.input.pressed.has('MousePrimary'))&&!this.destroyed;
    this.radar.updateContacts(dt, this.getPlayerHeading(), {
      airFriendly: this.allies, airHostile: this.enemies,
      groundFriendly: this.friends, groundHostile: this.redUnits,
    });
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
    this.weaponSystem.update(dt,{gunFiring,missileRequested});
    const missileLaunched=this.weaponSystem.missilesFired>this.lastObservedMissilesFired;
    this.lastObservedMissilesFired=this.weaponSystem.missilesFired;
    this.incomingAircraftMissiles.length=0;
    for(const shot of this.projectileSystem.playerShots){
      if(shot.homing&&shot.targetDomain==='air')this.incomingAircraftMissiles.push(shot);
    }
    this.airBattle.update(dt, {
      lockedTarget: this.radar.targetDomain === 'air' && this.radar.lockCueConfirmed ? this.radar.target : null,
      incomingMissiles: this.incomingAircraftMissiles,
    });
    this.groundBattle.update(dt);
    this.countermeasureSystem.update(dt);
    this.projectileSystem.update(dt);
    this.combatEffects.update(dt);
    this.radio.update(dt);
    this.missionSystem.update(dt,this.destroyed);
    if(this.missionSystem.objectiveSatisfied)this.scoreSystem.awardObjectiveCompletion();
    let detectedHostiles=0;
    for(const track of this.radar.tracks.values())if(track.team==='hostile')detectedHostiles++;
    let hostileEngaged=false;
    for(const enemy of this.enemies){
      if(!enemy.dead&&(enemy.phase==='inbound'||enemy.phase==='extend'||enemy.missilesFired>0)){hostileEngaged=true;break;}
    }
    let targetDestroyed=false;
    for(const enemy of this.enemies)if(enemy.dead){targetDestroyed=true;break;}
    if(!targetDestroyed)for(const unit of this.redUnits)if(unit.dead){targetDestroyed=true;break;}
    this.missionFlow.update(dt,{
      detectedHostiles,
      playerEngaged:gunFiring||missileLaunched,
      hostileEngaged,
      targetDestroyed,
      objectiveSatisfied:this.missionSystem.objectiveSatisfied,
      destroyed:this.destroyed,
    });
    this.updateHud();
    this.feedback.update(dt);
  }
  checkPlayerCollision(dt=this.frameDelta??0){
    if(this.destroyed)return true;
    return this.collisionSystem.checkPlayerCollision(dt);
  }
  destroyPlayer(reasonKey,params={}){
    if(this.destroyed)return;
    if(this.feedback.hull>0){
      this.damageTaken+=this.feedback.hull;
      this.feedback.damage(this.feedback.hull);
    }
    this.destroyed=true;
    this.missionSystem.markPlayerDestroyed();
    if(this.boundaryWarning)this.boundaryWarning.hidden=true;
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
  }

  abortMission(){
    if(this.destroyed)return;
    this.destroyed=true;
    this.missionAborted=true;
    if(this.boundaryWarning)this.boundaryWarning.hidden=true;
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
  }

  damagePlayer(amount,reasonKey){
    if(this.destroyed)return;
    const hullBefore=this.feedback.hull;
    this.feedback.damage(amount);
    this.damageTaken+=hullBefore-this.feedback.hull;
    const previousHealthRatio=this.player.userData.airframeHealthRatio??1;
    const healthRatio=applyAirframeCondition(this.player,this.feedback.hull,this.feedback.maxHull);
    if(previousHealthRatio>=.3&&healthRatio<.3)this.feedback.notify('combat.flightControlsDegraded',2.2,'damage');
    this.audio?.playAirframeDamage(amount);
    if(this.feedback.hull<=0)this.destroyPlayer(reasonKey);
  }

  onMissileLaunch(enemy){
    this.missileLaunchSource=enemy;
    this.missileLaunchTimer=Math.max(this.missileLaunchTimer,2.2);
    if(this.missileLaunchAlertCooldown<=0){
      this.audio?.playMissileLaunchWarning();
      this.feedback.notify('combat.missileLaunchDetected',2.1,'warning');
      this.missileLaunchAlertCooldown=2.8;
    }
    const reporter=this.airBattle.closestWingmanTo(enemy.mesh.position);
    if(reporter)this.radio.emit('wingman.missileInbound',{wingmanId:reporter.radioId,scope:'player'});
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
      missileInbound:'wingman.missileInbound',
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
      difficulty:this.difficulty?.id,
      score:this.score,
      airKills:this.airKills,
      groundKills:this.groundKills,
      gunRounds,
      gunHits:this.gunHits,
      accuracy:gunRounds>0?this.gunHits/gunRounds:0,
      missilesFired:this.weaponSystem.missilesFired,
      damageTaken:this.damageTaken,
      objectivesCompleted:this.missionSystem.objectiveSatisfied?1:0,
      objectiveCount:1,
      missionTime:Math.max(0,elapsed),
    };
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
    const outcomeText=t(successful?'mission.debrief.complete':aborted?'mission.debrief.aborted':'mission.debrief.failed');
    const lossCause=!successful&&!aborted&&this.deathReasonKey?` · ${t(this.deathReasonKey,this.deathReasonParams)}`:'';
    if(this.debriefNodes.outcome)this.debriefNodes.outcome.textContent=`${outcomeText}${lossCause}`;
    const seconds=Math.max(0,Math.floor(elapsed));
    if(this.debriefNodes.duration)this.debriefNodes.duration.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
    if(this.debriefNodes.airKills)this.debriefNodes.airKills.textContent=formatNumber(this.airKills);
    if(this.debriefNodes.groundKills)this.debriefNodes.groundKills.textContent=formatNumber(this.groundKills);
    if(this.debriefNodes.gunRounds)this.debriefNodes.gunRounds.textContent=formatNumber(this.debriefData.gunRounds);
    if(this.debriefNodes.missiles)this.debriefNodes.missiles.textContent=formatNumber(this.debriefData.missilesFired);
    if(this.debriefNodes.score)this.debriefNodes.score.textContent=formatNumber(this.debriefData.score);
    if(this.debriefNodes.accuracy)this.debriefNodes.accuracy.textContent=this.debriefData.gunRounds>0?formatPercent(this.debriefData.accuracy):'—';
    if(this.debriefNodes.damage)this.debriefNodes.damage.textContent=formatNumber(Math.round(this.debriefData.damageTaken));
    if(this.debriefNodes.objectives)this.debriefNodes.objectives.textContent=`${this.debriefData.objectivesCompleted} / ${this.debriefData.objectiveCount}`;
  }
  clearInput(){
    this.input.clear();
    this.weaponSystem.stopGun();
  }
  dispose(){
    this.clearInput();
    this.input.dispose();
    document.removeEventListener('ilmatila:languagechange', this.onLanguageChange);
    this.restartButton?.removeEventListener('click', this.onRestart);
    this.missionSystem.dispose();
    this.projectileSystem.dispose();
    this.feedback.dispose();
    this.radio.dispose();
    this.airBattle.dispose();
    this.groundBattle.dispose();
    this.combatEffects.dispose();
    this.countermeasureSystem.dispose();
    this.radar.dispose();
    const designator=document.querySelector('#target-designator');
    if(designator){designator.hidden=true;designator.classList.remove('ground-target','locked');}
    if(this.threatWarning)this.threatWarning.hidden=true;
    const missileCue=document.querySelector('#missile-approach-cue');
    if(missileCue)missileCue.hidden=true;
    if(this.status){this.status.classList.remove('destroyed','complete');this.status.replaceChildren(document.createElement('i'),document.createTextNode(` ${t('hud.ready')}`));}
  }
  updateHud(){
    if(this.weapon)this.weapon.textContent=this.input.pressed.has('Space')?t('combat.firing'):t('hud.readyShort');
    if(this.countermeasureCount)this.countermeasureCount.textContent=String(this.countermeasureSystem.countermeasures).padStart(2,'0');
    if(this.wingmanOrderNode)this.wingmanOrderNode.textContent=t(`combat.wingmanStatus.${this.airBattle.wingmanOrder}`);
    const threat=this.projectileSystem.missileThreat;
    const launchVisible=this.missileLaunchTimer>0&&this.missileLaunchSource&&!this.missileLaunchSource.dead;
    if(this.threatWarning){
      this.threatWarning.hidden=this.destroyed||(!threat&&!launchVisible);
      this.threatWarning.classList.toggle('critical',Boolean(threat&&this.projectileSystem.missileThreatEta<4.5));
      if(!this.threatWarning.hidden){
        const warningKey=threat?(this.projectileSystem.missileThreatEta<=8.5?'hud.missileInbound':'hud.missileLaunchDetected'):'hud.missileLaunchDetected';
        const label=t(warningKey);
        if(this.threatWarningLabel&&this.threatWarningLabel.textContent!==label)this.threatWarningLabel.textContent=label;
        let detail='';
        if(threat){
          const distance=this.projectileSystem.missileThreatDistance;
          const range=distance>=1000?`${formatNumber(distance/1000,{minimumFractionDigits:1,maximumFractionDigits:1})} KM`:`${formatNumber(Math.round(distance))} M`;
          detail=t('hud.missileThreatDetail',{range,seconds:Math.max(1,Math.ceil(this.projectileSystem.missileThreatEta))});
        }else if(launchVisible){
          const distance=this.missileLaunchSource.mesh.position.distanceTo(this.player.position);
          detail=t('hud.launchSourceDetail',{range:`${formatNumber(distance/1000,{minimumFractionDigits:1,maximumFractionDigits:1})} KM`});
        }
        if(this.threatWarningDetail&&this.threatWarningDetail.textContent!==detail)this.threatWarningDetail.textContent=detail;
      }
    }
    if(this.boundaryWarning){
      const halfSize=this.terrain.worldSize*.5;
      const bounds=this.terrain.operationBounds??{minX:-halfSize,maxX:halfSize,minZ:-halfSize,maxZ:halfSize};
      const rectangularClearance=Math.max(0,Math.min(
        this.player.position.x-bounds.minX,
        bounds.maxX-this.player.position.x,
        this.player.position.z-bounds.minZ,
        bounds.maxZ-this.player.position.z,
      ));
      const clearance=this.terrain.getBoundaryClearance?.(this.player.position.x,this.player.position.z)
        ?? rectangularClearance;
      const approach=this.terrain.getBoundaryApproach
        ? this.terrain.getBoundaryApproach(this.player.position,this.playerVelocity)
        : getBoundaryApproach(this.player.position,this.playerVelocity,bounds);
      const critical=Boolean(approach&&approach.clearance<=1_500);
      this.boundaryWarning.hidden=this.destroyed||!approach;
      this.boundaryWarning.classList.toggle('critical',critical);
      const boundaryLine=this.terrain.boundaryLine;
      if(boundaryLine){
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
      if(!this.boundaryWarning.hidden&&this.boundaryWarningText){
        const warningText=t(critical?'hud.boundaryCritical':'hud.boundaryWarning');
        if(this.boundaryWarningText.textContent!==warningText)this.boundaryWarningText.textContent=warningText;
        if(this.boundaryWarningDistance){
          const distanceText=`${formatNumber(approach.clearance/1000,{minimumFractionDigits:1,maximumFractionDigits:1})} KM`;
          if(this.boundaryWarningDistance.textContent!==distanceText)this.boundaryWarningDistance.textContent=distanceText;
        }
      }
    }
    if(this.ammo){
      let seeker;
      if(this.weaponSystem.missileFeedbackTimer>0&&this.weaponSystem.missileFeedbackKey)seeker=t(this.weaponSystem.missileFeedbackKey);
      else if(this.weaponSystem.missiles[this.radar.mode]<=0)seeker=t('combat.noMissiles');
      else if(this.weaponSystem.cooldown>0)seeker=t('combat.cooling',{seconds:formatNumber(this.weaponSystem.cooldown,{minimumFractionDigits:1,maximumFractionDigits:1})});
      else if(this.radar.target&&!this.radar.targetInSensorRange)seeker=t('combat.sensorContactLost');
      else if(this.radar.target&&!this.radar.inLockEnvelope)seeker=t('combat.outOfRange');
      else if(this.radar.target&&this.radar.lockCueConfirmed)seeker=t('combat.locked');
      else if(this.radar.target&&this.radar.lockCueTarget)seeker=t('combat.locking',{percent:Math.round(this.radar.lock*100)});
      else if(this.radar.target)seeker=t('combat.aimAtSelected');
      else seeker=t(this.radar.mode==='ground'?'combat.searchGround':'combat.searchAir');
      this.ammo.textContent=seeker;
      const acquiring=Boolean(this.radar.target&&this.radar.inLockEnvelope&&this.radar.lockCueTarget&&!this.radar.lockCueConfirmed);
      const locked=Boolean(this.radar.target&&this.radar.lockCueConfirmed);
      this.ammo.classList.toggle('acquiring',acquiring);
      this.ammo.classList.toggle('locked',locked);
      this.ammo.classList.toggle('out-of-range',Boolean(this.radar.target&&!this.radar.inLockEnvelope));
      this.ammo.classList.toggle('sensor-lost',Boolean(this.radar.target&&!this.radar.targetInSensorRange));
      this.ammo.classList.toggle('ground-target',this.radar.targetDomain==='ground');
    }
    if(this.missileType){
      const profile=this.radar.mode==='ground'?MISSILE_PROFILES.playerGround:MISSILE_PROFILES.playerAir;
      if(this.missileType.textContent!==profile.designation)this.missileType.textContent=profile.designation;
    }
    if(this.missileCount)this.missileCount.textContent=String(this.weaponSystem.missiles[this.radar.mode]).padStart(2,'0');
    if(this.scoreEl)this.scoreEl.textContent=String(this.score).padStart(5,'0');
  }
}
