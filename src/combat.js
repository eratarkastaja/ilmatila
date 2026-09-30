import * as THREE from 'three';
import { AirBattle } from './combat/air-battle.js';
import { GroundBattle } from './combat/ground-battle.js';
import { CombatInput } from './combat/input.js';
import { CombatRadar } from './combat/radar.js';
import { MISSILE_PROFILES } from './combat/projectiles.js';
import { ProjectileSystem } from './combat/projectile-system.js';
import { CollisionSystem } from './combat/collision-system.js';
import { CountermeasureSystem } from './combat/countermeasure-system.js';
import { MissionSystem } from './combat/mission-system.js';
import { MISSION_PHASE, MissionFlowSystem } from './combat/mission-flow.js';
import { MISSION_OUTCOME } from './combat/mission-objective.js';
import { WeaponSystem } from './combat/weapon-system.js';
import { CombatFeedback } from './combat/combat-feedback.js';
import { applyAirframeCondition } from './combat/airframe-condition.js';
import { getDifficultyPreset } from './combat/difficulty.js';
import { disposeAircraftVisual } from './plane.js';
import { disposeGroundVehicleVisual } from './vehicles.js';
import { formatNumber, formatPercent, t } from './i18n.js';

const effectSphereGeo=new THREE.SphereGeometry(1,14,10);
const shockwaveGeo=new THREE.RingGeometry(.94,1,48);
const glowTexture=createGlowTexture();
const glowMaterial=new THREE.SpriteMaterial({
  map:glowTexture,color:'#ffffff',transparent:true,opacity:1,
  blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,
});
const explosionShellMaterial=new THREE.MeshBasicMaterial({
  color:'#ff5a22',transparent:true,opacity:.9,blending:THREE.AdditiveBlending,
  depthWrite:false,toneMapped:false,
});
const shockwaveMaterial=new THREE.MeshBasicMaterial({
  color:'#ffd28c',transparent:true,opacity:.82,blending:THREE.AdditiveBlending,
  side:THREE.DoubleSide,depthWrite:false,toneMapped:false,
});
const emberColor=new THREE.Color('#ffb441');
const hotEmberColor=new THREE.Color('#fff0a8');
const smokeColor=new THREE.Color('#82776f');
const forward=new THREE.Vector3(0,0,1);
const headingDirection=new THREE.Vector3();
const effectVelocity=new THREE.Vector3();
const explosionDirection=new THREE.Vector3();
let effectResourcesDisposed=false;

function createGlowTexture(){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const context=canvas.getContext('2d');
  const gradient=context.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'rgba(255,255,245,1)');
  gradient.addColorStop(.12,'rgba(255,244,190,.98)');
  gradient.addColorStop(.3,'rgba(255,157,61,.72)');
  gradient.addColorStop(.62,'rgba(255,94,22,.2)');
  gradient.addColorStop(1,'rgba(255,64,8,0)');
  context.fillStyle=gradient;context.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

export function disposeCombatEffectResources(){
  if(effectResourcesDisposed)return;
  effectResourcesDisposed=true;
  glowTexture.dispose();glowMaterial.dispose();effectSphereGeo.dispose();shockwaveGeo.dispose();
  explosionShellMaterial.dispose();shockwaveMaterial.dispose();
}

function addTransientGlow(parent,color,size,opacity=1,blending=THREE.AdditiveBlending){
  const material=glowMaterial.clone();material.color.set(color);material.opacity=opacity;material.blending=blending;material.userData.transient=true;
  const sprite=new THREE.Sprite(material);sprite.scale.setScalar(size);parent.add(sprite);return sprite;
}

function disposeTransientMaterials(object){
  object.traverse(child=>{if(child.material?.userData?.transient)child.material.dispose();});
}

function createExplosionEffect(position,intensity){
  const group=new THREE.Group();group.position.copy(position);
  const core=addTransientGlow(group,'#fff1bd',30*intensity,1);
  const fireball=new THREE.Mesh(effectSphereGeo,explosionShellMaterial.clone());
  fireball.material.userData.transient=true;group.add(fireball);
  const smoke=addTransientGlow(group,'#73665f',26*intensity,.38,THREE.NormalBlending);smoke.position.y=4*intensity;
  const ring=new THREE.Mesh(shockwaveGeo,shockwaveMaterial.clone());
  ring.material.userData.transient=true;
  const effect={
    mesh:group,kind:'explosion',life:1.45,maxLife:1.45,intensity,core,fireball,smoke,ring,
    innerColor:new THREE.Color('#fff0ab'),outerColor:new THREE.Color('#a72d18'),
  };
  group.add(ring);
  return effect;
}
export class CombatWorld {
  constructor(scene, player, terrain, fx, aircraftAsset = null, mission = {}, audio = null, onMissionEnd = () => {}, difficultyId = 'standard', inputTarget = null) {
    this.scene=scene; this.player=player; this.effects=[]; this.destroyed=false; this.missionAborted=false;
    this.fx=fx; this.audio=audio;
    this.onMissionEnd=onMissionEnd;
    this.difficulty=getDifficultyPreset(difficultyId);
    const missionConfig={hostiles:4,wingmen:2,groundBattle:true,groundPairs:6,groundTrucks:12,...mission};
    this.input = new CombatInput(window, inputTarget);
    this.score=0;
    this.airKills=0;
    this.groundKills=0;
    this.gunHits=0;
    this.damageTaken=0;
    this.objectiveScoreAwarded=false;
    this.feedback = new CombatFeedback({
      hud: document.querySelector('#flight-hud'),
      message: document.querySelector('#combat-feedback'),
      hitMarker: document.querySelector('#gun-hit-feedback'),
      hullFill: document.querySelector('#hull-fill'),
      hullValue: document.querySelector('#hull-value'),
      countermeasureRow: document.querySelector('.countermeasure-row'),
      maxHull:this.difficulty.playerHull,
    });
    this.missileLaunchTimer=0;
    this.missileLaunchSource=null;
    this.terrain=terrain; this.playerHeading=0; this.previousPlayerPosition=player.position.clone();
    this.remainingMissionState={airRemaining:0,groundRemaining:0};
    this.incomingAircraftMissiles=[];
    this.sparkPool=[];
    this.explosionPool=[];
    this.playerVelocity=new THREE.Vector3();
    this.airBattle = new AirBattle({
      scene, player, aircraftAsset, mission: missionConfig, terrain, audio, fx,
      playerVelocity: this.playerVelocity,
      getPlayerHeading: () => this.getPlayerHeading(),
      deployHostileCountermeasures: (enemy, seeker) => this.countermeasureSystem.deployHostile(enemy, seeker),
      addHostileProjectile: shot => this.projectileSystem.addHostileProjectile(shot),
      addPlayerProjectile: shot => this.projectileSystem.addPlayerProjectile(shot),
      onMissileLaunch: enemy => this.onMissileLaunch(enemy),
      difficulty:this.difficulty,
    });
    this.groundBattle = new GroundBattle({ scene, player, playerVelocity: this.playerVelocity, terrain, mission: missionConfig, audio, fx, addProjectile: shot => this.projectileSystem.addHostileProjectile(shot) });
    const objectiveTotals={
      air:missionConfig.hostiles,
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
      incomingDamageMultiplier:this.difficulty.incomingDamage,
      hostileMissileTurnRate:this.difficulty.hostileMissileTurnRate,
      onPlayerDestroyed: (reason, params) => this.destroyPlayer(reason, params),
      playerVelocity: this.playerVelocity,
      onPlayerDamaged: (amount, reason) => this.damagePlayer(amount, reason),
      onPlayerHit: (target, details) => {
        this.gunHits++;
        this.feedback.gunHit(details.destroyed);
        this.audio?.playGunHit();
      },
      onJetDestroyed: (enemy, credited) => this.killJet(enemy, credited),
      onUnitDestroyed: (unit, credited) => this.destroyUnit(unit, credited),
      addSpark: position => this.addSpark(position),
      addWaterImpact: position => this.fx?.addWaterImpact(position),
      addExplosion: (position, intensity) => this.addExplosion(position, intensity),
    });
    this.countermeasureSystem = new CountermeasureSystem({
      scene, player, playerVelocity: this.playerVelocity, fx, audio,
      playerShots: this.projectileSystem.playerShots, hostileShots: this.projectileSystem.hostiles,
      addTransientGlow,
      initialCount:this.difficulty.countermeasures,
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
        state.airRemaining=this.airBattle.hostilesSpawned?0:missionConfig.hostiles;
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
        waypointCue:document.querySelector('#mission-waypoint-cue'),
      },
      onIngress:()=>this.airBattle.spawnHostiles(),
      onObjectiveActive:()=>this.missionSystem.activate(),
      onObjectiveComplete:()=>this.missionSystem.notifyObjectiveAchieved(),
      onRtb:()=>this.missionSystem.returnToBase(),
      onEnd:(outcome,elapsed)=>this.finishMission(outcome,elapsed),
    });
    this.restartButton = document.querySelector('#restart');
    this.onRestart = () => location.reload();
    this.restartButton?.addEventListener('click', this.onRestart);
    this.onLanguageChange = () => {
      this.radar.renderMode();
      this.feedback.refreshLanguage();
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
  getPlayerHeading(){
    const direction=headingDirection.copy(forward).applyQuaternion(this.player.quaternion);
    if(direction.x*direction.x+direction.z*direction.z>1e-4)this.playerHeading=Math.atan2(direction.x,direction.z);
    return this.playerHeading;
  }
  update(dt){
    this.frameDelta=dt;
    this.missileLaunchTimer=Math.max(0,this.missileLaunchTimer-dt);
    if(this.missileLaunchTimer<=0)this.missileLaunchSource=null;
    this.countermeasureSystem.tick(dt);
    if(dt>0){this.playerVelocity.copy(this.player.position).sub(this.previousPlayerPosition).multiplyScalar(1/dt);this.previousPlayerPosition.copy(this.player.position);}
    const justPressed = this.input.consumeJustPressed();
    const radarModeRequested=justPressed.has('KeyR');
    const targetCycleRequested=justPressed.has('KeyT');
    const missileRequested=justPressed.has('KeyM')||justPressed.has('MouseSecondary');
    const countermeasureRequested=justPressed.has('KeyC');
    const wingmanOrder=justPressed.has('Digit1')?'attack':justPressed.has('Digit2')?'defend':justPressed.has('Digit3')?'regroup':null;
    if(radarModeRequested)this.radar.toggleMode();
    if(countermeasureRequested){
      const deployed=this.countermeasureSystem.deployPlayer();
      this.feedback.countermeasures(deployed,this.countermeasureSystem.lastPlayerDeployment,this.countermeasureSystem.countermeasures);
    }
    if(wingmanOrder&&this.airBattle.issueWingmanOrder(wingmanOrder)){
      this.audio?.playWingmanOrder(wingmanOrder);
      this.feedback.notify(`combat.wingmanOrder.${wingmanOrder}`,1.65,'friendly');
    }
    const gunFiring=(this.input.pressed.has('Space')||this.input.pressed.has('MousePrimary'))&&!this.destroyed;
    this.radar.updateContacts(dt, this.getPlayerHeading(), {
      airFriendly: this.allies, airHostile: this.enemies,
      groundFriendly: this.friends, groundHostile: this.redUnits,
    });
    if(targetCycleRequested){
      if(this.radar.cycleTarget(this.enemies,this.redUnits)){
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
    this.updateEffects(dt);
    this.missionSystem.update(dt,this.destroyed);
    if(this.missionSystem.objectiveSatisfied&&!this.objectiveScoreAwarded){
      this.objectiveScoreAwarded=true;
      this.score+=750;
    }
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
    this.addExplosion(this.player.position,1.35);
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
    this.missileLaunchTimer=2.8;
    this.audio?.playMissileLaunchWarning();
    this.feedback.notify('combat.missileLaunchDetected',1.8,'warning');
  }

  finishMission(outcome,elapsed){
    if(this.missionEnded)return;
    this.missionSystem.finish(outcome);
    this.missionEnded=true;
    if(outcome===MISSION_OUTCOME.COMPLETE)this.score+=500;
    this.deathScreen&&(this.deathScreen.hidden=true);
    const objectiveNotice=document.querySelector('#mission-complete');
    if(objectiveNotice){objectiveNotice.hidden=true;objectiveNotice.classList.remove('visible');}
    const gunRounds=this.weaponSystem.gunRoundCount;
    this.debriefData={
      outcome,
      elapsed,
      missionId:this.missionSystem.mission.id,
      difficulty:this.difficulty.id,
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
    this.airBattle.dispose();
    this.groundBattle.dispose();
    for(const effect of this.effects){this.scene.remove(effect.mesh);disposeTransientMaterials(effect.mesh);}
    for(const effect of this.explosionPool)disposeTransientMaterials(effect.mesh);
    for(const spark of this.sparkPool){this.scene.remove(spark);spark.material.dispose();}
    this.countermeasureSystem.dispose();
    this.radar.dispose();
    this.effects.length=0;
    this.sparkPool.length=0;
    this.explosionPool.length=0;
    const designator=document.querySelector('#target-designator');
    if(designator){designator.hidden=true;designator.classList.remove('ground-target','locked');}
    if(this.threatWarning)this.threatWarning.hidden=true;
    const missileCue=document.querySelector('#missile-approach-cue');
    if(missileCue)missileCue.hidden=true;
    if(this.status){this.status.classList.remove('destroyed','complete');this.status.replaceChildren(document.createElement('i'),document.createTextNode(` ${t('hud.ready')}`));}
  }
  killJet(e,credited=true){e.dead=true;this.scene.remove(e.mesh);this.fx?.forgetAircraft(e.mesh);disposeAircraftVisual(e.mesh);this.airKills++;if(credited)this.score+=500;this.addExplosion(e.mesh.position,1.12);this.feedback.notify(credited?'combat.enemyAircraftDestroyed':'combat.enemyAircraftLost',1.8,credited?'success':'info');}
  destroyUnit(u,credited=true){u.dead=true;this.scene.remove(u.mesh);disposeGroundVehicleVisual(u.mesh);if(u.team==='red'){this.groundKills++;if(credited)this.score+=100;}this.addExplosion(u.mesh.position,.82);if(u.team==='red'&&credited)this.feedback.notify('combat.enemyGroundDestroyed',1.65,'success');}
  addSpark(pos){
    for(let i=0;i<7;i++){
      effectVelocity.set((Math.random()-.5)*48,(Math.random()-.25)*54,(Math.random()-.5)*48);
      this.fx?.emitParticle(pos,effectVelocity,i<3?hotEmberColor:emberColor,.28+Math.random()*.3,2+Math.random()*1.5,.98,1);
    }
    const sprite=this.sparkPool.pop()??addTransientGlow(this.scene,'#fff0ae',5,.95);
    sprite.material.color.set('#fff0ae');sprite.material.opacity=.95;sprite.scale.setScalar(5);sprite.position.copy(pos);this.scene.add(sprite);
    this.effects.push({mesh:sprite,kind:'spark',material:sprite.material,life:.2,maxLife:.2});
  }
  addExplosion(pos,intensity=1){
    const distance=pos.distanceTo(this.player.position);
    this.audio?.playExplosion(distance,intensity>1.05);
    const effect=this.explosionPool.pop()??createExplosionEffect(pos,intensity);
    effect.mesh.position.copy(pos);effect.mesh.visible=true;effect.intensity=intensity;
    effect.life=1.65;effect.maxLife=1.65;
    effect.core.scale.setScalar(36*intensity);effect.core.material.opacity=1;
    effect.fireball.scale.setScalar(9*intensity);effect.fireball.material.opacity=.94;effect.fireball.material.color.set('#fff0ab');
    effect.smoke.position.y=4*intensity;effect.smoke.scale.setScalar(26*intensity);effect.smoke.material.opacity=.42;
    effect.ring.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);effect.ring.scale.setScalar(10*intensity);effect.ring.material.opacity=.86;
    effect.innerColor.set('#fff0ab');effect.outerColor.set('#a72d18');
    this.scene.add(effect.mesh);
    this.effects.push(effect);

    for(let i=0;i<26;i++){
      const direction=explosionDirection.set(Math.random()-.5,Math.random()-.35,Math.random()-.5).normalize();
      if(i<17){
        direction.multiplyScalar((24+Math.random()*78)*intensity);direction.y+=8+Math.random()*22;
        const color=i<6?hotEmberColor:emberColor;
        this.fx?.emitParticle(pos,direction,color,.48+Math.random()*.58,2.2+Math.random()*2.2,.96,1);
      }else{
        direction.multiplyScalar(5+Math.random()*16);direction.y+=12+Math.random()*17;
        this.fx?.emitParticle(pos,direction,smokeColor,1.05+Math.random()*.55,1.35+Math.random()*1.1,.42,.08);
      }
    }
  }
  updateEffects(dt){
    for(let i=this.effects.length-1;i>=0;i--){
      const effect=this.effects[i];effect.life-=dt;
      if(effect.life<=0){
        this.scene.remove(effect.mesh);
        if(effect.kind==='spark'&&this.sparkPool.length<24){effect.material.opacity=0;this.sparkPool.push(effect.mesh);}
        else if(effect.kind==='explosion'&&this.explosionPool.length<32){effect.mesh.visible=false;this.explosionPool.push(effect);}
        else disposeTransientMaterials(effect.mesh);
        this.effects.splice(i,1);continue;
      }
      const progress=1-effect.life/effect.maxLife;
      if(effect.kind==='spark'){
        effect.material.opacity=(1-progress)**1.7;
        effect.mesh.scale.setScalar(5+progress*9);
      }else{
        const intensity=effect.intensity;
        effect.core.material.opacity=1-THREE.MathUtils.smoothstep(progress,.02,.3);
        effect.core.scale.setScalar(intensity*(34+progress*25));
        effect.fireball.scale.setScalar(intensity*(9+progress*54));
        effect.fireball.material.opacity=.88*(1-THREE.MathUtils.smoothstep(progress,.08,.78));
        effect.fireball.material.color.copy(effect.innerColor).lerp(effect.outerColor,progress);
        effect.smoke.material.opacity=.42*THREE.MathUtils.smoothstep(progress,.02,.24)*(1-progress*.7);
        effect.smoke.position.y=intensity*(4+progress*30);
        effect.smoke.scale.setScalar(intensity*(24+progress*78));
        effect.ring.material.opacity=.76*(1-THREE.MathUtils.smoothstep(progress,.24,1));
        effect.ring.scale.setScalar(intensity*(10+progress*96));
        effect.ring.rotation.z+=dt*.75;
      }
    }
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
      const clearance=Math.max(0,Math.min(halfSize-Math.abs(this.player.position.x),halfSize-Math.abs(this.player.position.z)));
      const critical=clearance<=1_500;
      this.boundaryWarning.hidden=this.destroyed||clearance>8_000;
      this.boundaryWarning.classList.toggle('critical',critical);
      const boundaryLine=this.terrain.boundaryLine;
      if(boundaryLine){
        const lineVisible=!this.destroyed&&clearance<=14_000;
        boundaryLine.visible=lineVisible;
        boundaryLine.material.opacity=lineVisible
          ? .12+.7*(1-THREE.MathUtils.smoothstep(clearance,2_500,14_000))
          : 0;
        boundaryLine.material.color.setHex(critical?0xff5148:0xff8056);
      }
      if(!this.boundaryWarning.hidden&&this.boundaryWarningText){
        const warningText=t(critical?'hud.boundaryCritical':'hud.boundaryWarning');
        if(this.boundaryWarningText.textContent!==warningText)this.boundaryWarningText.textContent=warningText;
        if(this.boundaryWarningDistance){
          const distanceText=`${formatNumber(clearance/1000,{minimumFractionDigits:1,maximumFractionDigits:1})} KM`;
          if(this.boundaryWarningDistance.textContent!==distanceText)this.boundaryWarningDistance.textContent=distanceText;
        }
      }
    }
    if(this.ammo){
      let seeker;
      if(this.weaponSystem.missileFeedbackTimer>0&&this.weaponSystem.missileFeedbackKey)seeker=t(this.weaponSystem.missileFeedbackKey);
      else if(this.weaponSystem.missiles[this.radar.mode]<=0)seeker=t('combat.noMissiles');
      else if(this.weaponSystem.cooldown>0)seeker=t('combat.cooling',{seconds:formatNumber(this.weaponSystem.cooldown,{minimumFractionDigits:1,maximumFractionDigits:1})});
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
