import * as THREE from 'three';
import { AirBattle } from './combat/air-battle.js';
import { GroundBattle } from './combat/ground-battle.js';
import { CombatInput } from './combat/input.js';
import { CombatRadar } from './combat/radar.js';
import { pointSegmentDistanceSquared, traceFighterHit, traceVehicleHit } from './combat/hit-testing.js';
import { createMissile } from './combat/projectiles.js';
import { estimateInterceptTime, GUN_PROJECTILE_LIFETIME, GUN_PROJECTILE_SPEED } from './combat/ballistics.js';
import { formatNumber, t } from './i18n.js';

const flare=new THREE.MeshBasicMaterial({color:'#ffd18a'});
const sphereGeo=new THREE.SphereGeometry(1,7,5);
const effectSphereGeo=new THREE.SphereGeometry(1,14,10);
const shockwaveGeo=new THREE.RingGeometry(.94,1,48);
const gunShotGeo=new THREE.SphereGeometry(.16,6,5);
const flareDecoyGeo=new THREE.SphereGeometry(1,7,5),flareDecoyMaterial=new THREE.MeshBasicMaterial({color:'#ff8c37',toneMapped:false});
const chaffDecoyGeo=new THREE.TetrahedronGeometry(.18,0),chaffDecoyMaterial=new THREE.MeshBasicMaterial({color:'#d9e2d8',transparent:true,opacity:.72,toneMapped:false});
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
const flareParticleColor=new THREE.Color('#ffae42');
const chaffParticleColor=new THREE.Color('#c9d3ce');
const forward=new THREE.Vector3(0,0,1);
const stationaryVelocity=new THREE.Vector3();
const localForward=new THREE.Vector3(0,0,1),localRight=new THREE.Vector3(1,0,0),localUp=new THREE.Vector3(0,1,0);
const MISSILE_TURN_RATE=2.45;
const PLAYER_MISSILE={air:{speed:600,life:28},ground:{speed:400,life:18}};

function turnDirection(current,desired,maxAngle){
  const direction=current.clone().normalize();
  const angle=direction.angleTo(desired);
  if(angle<=maxAngle)return direction.copy(desired);

  const axis=new THREE.Vector3().crossVectors(direction,desired);
  if(axis.lengthSq()<1e-8){
    axis.crossVectors(direction,new THREE.Vector3(0,1,0));
    if(axis.lengthSq()<1e-8)axis.crossVectors(direction,new THREE.Vector3(1,0,0));
  }
  return direction.applyAxisAngle(axis.normalize(),maxAngle).normalize();
}

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

function addTransientGlow(parent,color,size,opacity=1,blending=THREE.AdditiveBlending){
  const material=glowMaterial.clone();material.color.set(color);material.opacity=opacity;material.blending=blending;material.userData.transient=true;
  const sprite=new THREE.Sprite(material);sprite.scale.setScalar(size);parent.add(sprite);return sprite;
}

function disposeTransientMaterials(object){
  object.traverse(child=>{if(child.material?.userData?.transient)child.material.dispose();});
}
export class CombatWorld {
  constructor(scene, player, terrain, fx, aircraftAsset = null, mission = {}, audio = null) {
    this.scene=scene; this.player=player; this.enemies=[]; this.allies=[]; this.hostiles=[]; this.playerShots=[]; this.effects=[]; this.destroyed=false;
    this.fx=fx; this.audio=audio;
    const missionConfig={hostiles:4,wingmen:2,groundBattle:true,groundPairs:6,groundTrucks:12,...mission};
    this.mission=missionConfig;
    this.missionObjective=missionConfig.objective??{type:'clearAir'};
    this.objectiveElapsed=0;
    this.missionComplete=false;
    this.missionNoticeTimer=null;
    this.input = new CombatInput();
    this.missiles=6; this.cooldown=0; this.score=0; this.gunClock=0;
    this.countermeasures=12; this.countermeasureCooldown=0; this.decoys=[]; this.incomingMissile=false;
    this.missileFeedbackKey=null; this.missileFeedbackTimer=0;
    this.terrain=terrain; this.playerHeading=0; this.previousPlayerPosition=player.position.clone(); this.playerVelocity=new THREE.Vector3();
    this.airBattle = new AirBattle({
      scene, player, aircraftAsset, mission: missionConfig, terrain, audio, fx,
      playerVelocity: this.playerVelocity,
      getPlayerHeading: () => this.getPlayerHeading(),
      deployHostileCountermeasures: (enemy, seeker) => this.deployHostileCountermeasures(enemy, seeker),
      addHostileProjectile: shot => this.hostiles.push(shot),
      addPlayerProjectile: shot => this.playerShots.push(shot),
    });
    this.enemies = this.airBattle.enemies;
    this.allies = this.airBattle.allies;
    this.groundBattle = new GroundBattle({ scene, player, terrain, mission: missionConfig, audio, fx, addProjectile: shot => this.hostiles.push(shot) });
    this.friends = this.groundBattle.friends;
    this.redUnits = this.groundBattle.redUnits;
    this.colliders = this.groundBattle.colliders;
    this.objectiveTotals={
      air:this.enemies.length,
      ground:this.redUnits.filter(unit=>unit.armed!==false).length,
    };
    this.radar = new CombatRadar(player, audio);
    this.weapon=document.querySelector('#weapon'); this.ammo=document.querySelector('#ammo'); this.missileCount=document.querySelector('#missile-count'); this.scoreEl=document.querySelector('#score');
    this.countermeasureCount=document.querySelector('#countermeasure-count'); this.threatWarning=document.querySelector('#threat-warning');
    this.status=document.querySelector('.status'); this.deathScreen=document.querySelector('#death-screen'); this.deathReason=document.querySelector('#death-reason');
    this.statusText=this.status?.querySelector('[data-i18n]');
    this.objectiveTitle=document.querySelector('#mission-objective-title');
    this.objectiveProgress=document.querySelector('#mission-objective-progress');
    this.missionCompleteNotice=document.querySelector('#mission-complete');
    this.missionCompleteDetail=document.querySelector('#mission-complete-detail');
    this.renderMissionObjective();
    this.restartButton = document.querySelector('#restart');
    this.onRestart = () => location.reload();
    this.restartButton?.addEventListener('click', this.onRestart);
    this.onLanguageChange = () => {
      this.radar.renderMode();
      this.updateHud();
      this.renderMissionObjective();
      this.renderMissionComplete();
      if(this.statusText&&!this.destroyed)this.statusText.textContent=t(this.missionComplete?'mission.statusComplete':'hud.ready');
      if(this.deathReason&&this.destroyed)this.deathReason.textContent=t(this.deathReasonKey,this.deathReasonParams);
      if(this.status&&this.destroyed)this.status.replaceChildren(document.createElement('i'),document.createTextNode(` ${t('combat.destroyed')}`));
    };
    document.addEventListener('ilmatila:languagechange', this.onLanguageChange);
  }
  getPlayerHeading(){
    const direction=forward.clone().applyQuaternion(this.player.quaternion);
    if(direction.x*direction.x+direction.z*direction.z>1e-4)this.playerHeading=Math.atan2(direction.x,direction.z);
    return this.playerHeading;
  }
  update(dt){
    this.cooldown=Math.max(0,this.cooldown-dt); this.gunClock-=dt; this.countermeasureCooldown=Math.max(0,this.countermeasureCooldown-dt);
    if(dt>0){this.playerVelocity.copy(this.player.position).sub(this.previousPlayerPosition).multiplyScalar(1/dt);this.previousPlayerPosition.copy(this.player.position);}
    const justPressed = this.input.consumeJustPressed();
    const radarModeRequested=justPressed.has('KeyR');
    const targetCycleRequested=justPressed.has('KeyT');
    const missileRequested=justPressed.has('KeyM');
    const countermeasureRequested=justPressed.has('KeyC');
    if(radarModeRequested)this.radar.toggleMode();
    if(countermeasureRequested)this.deployCountermeasures();
    this.missileFeedbackTimer=Math.max(0,this.missileFeedbackTimer-dt);
    this.audio?.setGunFiring(this.input.pressed.has('Space')&&!this.destroyed);
    this.radar.updateContacts(dt, this.getPlayerHeading(), {
      airFriendly: this.allies, airHostile: this.enemies,
      groundFriendly: this.friends, groundHostile: this.redUnits,
    });
    if(targetCycleRequested){
      if(this.radar.cycleTarget(this.enemies,this.redUnits)){
        this.missileFeedbackKey=null;this.missileFeedbackTimer=0;
      }else{
        this.missileFeedbackKey='combat.noRadarTargets';this.missileFeedbackTimer=1.5;this.audio?.playWeaponNoLock();
      }
    }
    this.radar.updateLock(dt, this.enemies, this.redUnits);
    if(this.input.pressed.has('Space')&&this.gunClock<=0){this.fireGun();this.gunClock=.09;}
    if(missileRequested)this.requestMissile();
    this.airBattle.update(dt, {
      lockedTarget: this.radar.targetDomain === 'air' && this.radar.lockCueConfirmed ? this.radar.target : null,
      incomingMissiles: this.playerShots.filter(shot => shot.homing && shot.targetDomain === 'air'),
    });
    this.groundBattle.update(dt);
    this.updateShots(dt);
    this.updateDecoys(dt);
    this.updateEffects(dt);
    this.updateMissionObjective(dt);
    this.updateHud();
  }
  checkPlayerCollision(){
    if(this.destroyed)return true;
    const p=this.player.position;
    const ground=this.terrain.sampleHeight(p.x,p.z);
    if(p.y-3.5<=ground){this.destroyPlayer('combat.collisionTerrain');return true;}
    const halfSize=this.terrain.worldSize/2;
    if(Math.abs(p.x)>halfSize-10||Math.abs(p.z)>halfSize-10){this.destroyPlayer('combat.collisionBoundary');return true;}
    for(const collider of this.colliders){
      if(collider.mesh&&!collider.mesh.parent)continue;
      const dx=p.x-collider.x, dz=p.z-collider.z;
      if(dx*dx+dz*dz>(collider.radius+7.5)**2)continue;
      if(p.y+3.5>=collider.y&&p.y-3.5<=collider.y+collider.height){this.destroyPlayer(collider.collisionKey,{vehicle:collider.vehicle});return true;}
    }
    for(const unit of this.enemies){if(!unit.dead&&p.distanceToSquared(unit.mesh.position)<14**2){this.destroyPlayer('combat.collisionHostile');return true;}}
    for(const unit of this.allies){if(!unit.dead&&p.distanceToSquared(unit.mesh.position)<14**2){this.destroyPlayer('combat.collisionFriendly');return true;}}
    return false;
  }
  destroyPlayer(reasonKey,params={}){
    if(this.destroyed)return;
    this.destroyed=true;
    this.audio?.setGunFiring(false);
    this.audio?.playCollision();
    this.audio?.stopEngine();
    for(const shot of this.playerShots)if(shot.homing)this.audio?.stopMissileFlight(shot.mesh.id);
    for(const shot of this.hostiles)if(shot.missile)this.audio?.stopMissileFlight(shot.mesh.id);
    this.deathReasonKey=reasonKey;this.deathReasonParams=params;
    this.deathReason&&(this.deathReason.textContent=t(reasonKey,params));
    if(this.deathScreen)this.deathScreen.hidden=false;
    if(this.status){this.status.classList.remove('complete');this.status.classList.add('destroyed');this.status.replaceChildren(document.createElement('i'),document.createTextNode(` ${t('combat.destroyed')}`));}
    this.addExplosion(this.player.position,1.35);
  }
  clearInput(){
    this.input.clear();
    this.audio?.setGunFiring(false);
  }
  dispose(){
    this.clearInput();
    this.input.dispose();
    document.removeEventListener('ilmatila:languagechange', this.onLanguageChange);
    this.restartButton?.removeEventListener('click', this.onRestart);
    if(this.missionNoticeTimer!==null)clearTimeout(this.missionNoticeTimer);
    this.missionCompleteNotice?.classList.remove('visible');
    if(this.missionCompleteNotice)this.missionCompleteNotice.hidden=true;
    for(const shot of [...this.playerShots,...this.hostiles]){
      if(shot.missile)this.audio?.stopMissileFlight(shot.mesh.id);
      if(shot.mesh)this.scene.remove(shot.mesh);
    }
    this.airBattle.dispose();
    this.groundBattle.dispose();
    for(const effect of this.effects){this.scene.remove(effect.mesh);disposeTransientMaterials(effect.mesh);}
    for(const decoy of this.decoys){this.scene.remove(decoy.mesh);disposeTransientMaterials(decoy.mesh);}
    this.radar.dispose();
    this.effects.length=0;
    this.decoys.length=0;
    this.playerShots.length=0;
    this.hostiles.length=0;
    const designator=document.querySelector('#target-designator');
    if(designator){designator.hidden=true;designator.classList.remove('ground-target','locked');}
    if(this.threatWarning)this.threatWarning.hidden=true;
    if(this.status){this.status.classList.remove('destroyed','complete');this.status.replaceChildren(document.createElement('i'),document.createTextNode(` ${t('hud.ready')}`));}
  }
  fireGun(){
    this.audio?.playGunBurst();
    const dir=forward.clone().applyQuaternion(this.player.quaternion);
    for(const side of [-1,1]){
      const start=this.player.position.clone().add(new THREE.Vector3(side*.9,-.25,3.8).applyQuaternion(this.player.quaternion));
      const velocity=dir.clone().multiplyScalar(GUN_PROJECTILE_SPEED).add(this.playerVelocity);
      this.fx?.addTracer(start,start.clone().addScaledVector(velocity.clone().normalize(),29),'#fff0a4');
      const shot=new THREE.Mesh(gunShotGeo,flare); shot.position.copy(start);this.scene.add(shot);
      this.playerShots.push({mesh:shot,velocity,life:GUN_PROJECTILE_LIFETIME,damage:.5});
    }
  }
  fireMissile(){
    if(!this.radar.target||this.radar.target.dead)return;
    this.missiles--;this.cooldown=2.8;
    this.missileFeedbackKey=null; this.missileFeedbackTimer=0;
    const targetDomain=this.radar.targetDomain;
    const missileProfile=targetDomain==='ground'?PLAYER_MISSILE.ground:PLAYER_MISSILE.air;
    const missileSpeed=missileProfile.speed;
    const missileLife=missileProfile.life;
    const dir=forward.clone().applyQuaternion(this.player.quaternion).normalize();
    const mesh=createMissile('#d3d9d2');
    mesh.position.copy(this.player.position).addScaledVector(dir,5);
    mesh.quaternion.setFromUnitVectors(forward,dir);
    this.scene.add(mesh);
    this.audio?.playMissileLaunch();
    this.audio?.startMissileFlight(mesh.id);
    if(mesh.userData.engineFlame)mesh.userData.engineFlame.visible=true;
    this.playerShots.push({mesh,velocity:dir.clone().multiplyScalar(missileSpeed),speed:missileSpeed,life:missileLife,damage:5,homing:true,target:this.radar.target,targetDomain,seeker:targetDomain==='air'?'ir':'radar',decoyTarget:null,decoyAttempts:new Set(),trail:0});
  }
  requestMissile(){
    if(this.cooldown>0||this.missiles<=0){this.audio?.playWeaponNoLock();return;}
    if(!this.radar.target||this.radar.target.dead){this.missileFeedbackKey='combat.aimAtHostile';this.missileFeedbackTimer=1.5;this.audio?.playWeaponNoLock();return;}
    if(!this.radar.inLockEnvelope){this.missileFeedbackKey='combat.outOfRange';this.missileFeedbackTimer=1.5;this.audio?.playWeaponNoLock();return;}
    if(!this.radar.lockCueConfirmed){this.missileFeedbackKey='combat.lockNotReady';this.missileFeedbackTimer=1.3;this.audio?.playWeaponNoLock();return;}
    this.fireMissile();
  }
  deployCountermeasures(){
    if(this.countermeasureCooldown>0||this.countermeasures<=0){this.audio?.playWeaponNoLock();return;}
    this.countermeasures--;this.countermeasureCooldown=.85;
    const q=this.player.quaternion;
    const rear=localForward.clone().negate().applyQuaternion(q).normalize();
    const right=localRight.clone().applyQuaternion(q).normalize();
    const up=localUp.clone().applyQuaternion(q).normalize();
    const flareCloud=new THREE.Group();
    flareCloud.position.copy(this.player.position).addScaledVector(rear,6);
    for(let i=0;i<3;i++){
      const flareMesh=new THREE.Mesh(flareDecoyGeo,flareDecoyMaterial);
      flareMesh.position.set((i-1)*1.8,(Math.random()-.5)*1.8,(Math.random()-.5)*1.8);
      flareMesh.scale.setScalar(1.1+Math.random()*.7);flareCloud.add(flareMesh);
      const glow=addTransientGlow(flareCloud,'#ff9b35',15+Math.random()*7,.96);
      glow.position.copy(flareMesh.position);glow.userData.baseSize=glow.scale.x;glow.userData.flareGlow=true;
    }
    this.scene.add(flareCloud);
    this.decoys.push({team:'player',type:'ir',mesh:flareCloud,position:flareCloud.position,velocity:this.playerVelocity.clone().addScaledVector(rear,115).addScaledVector(right,(Math.random()-.5)*18).addScaledVector(up,18),life:2.7,maxLife:2.7,active:true,age:0,trailClock:0});

    const chaffCloud=new THREE.Group();
    chaffCloud.position.copy(this.player.position).addScaledVector(rear,4).addScaledVector(up,-1);
    for(let i=0;i<18;i++){
      const piece=new THREE.Mesh(chaffDecoyGeo,chaffDecoyMaterial);
      piece.position.set((Math.random()-.5)*5,(Math.random()-.5)*4,(Math.random()-.5)*6);
      piece.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);chaffCloud.add(piece);
    }
    this.scene.add(chaffCloud);
    this.decoys.push({team:'player',type:'radar',mesh:chaffCloud,position:chaffCloud.position,velocity:this.playerVelocity.clone().addScaledVector(rear,62).addScaledVector(right,(Math.random()-.5)*12).addScaledVector(up,-5),life:2.7,maxLife:2.7,active:true,age:0,trailClock:0});
    this.audio?.playCountermeasure();this.updateHud();
  }
  deployHostileCountermeasures(enemy,seeker=null){
    if(!enemy?.mesh||enemy.dead||enemy.countermeasures<=0||enemy.countermeasureCooldown>0)return false;
    enemy.countermeasures--;
    enemy.countermeasureCooldown=4.5+Math.random()*1.5;
    enemy.evasiveTimer=2.4;
    enemy.evasiveDirection=Math.random()<.5?-1:1;

    const q=enemy.mesh.quaternion;
    const rear=localForward.clone().negate().applyQuaternion(q).normalize();
    const right=localRight.clone().applyQuaternion(q).normalize();
    const up=localUp.clone().applyQuaternion(q).normalize();
    const types=seeker? [seeker] : ['ir','radar'];
    for(const type of types){
      const cloud=new THREE.Group();
      cloud.position.copy(enemy.mesh.position).addScaledVector(rear,type==='ir'?6:4);
      cloud.position.addScaledVector(up,type==='ir'?1:-1);
      if(type==='ir'){
        for(let i=0;i<3;i++){
          const flareMesh=new THREE.Mesh(flareDecoyGeo,flareDecoyMaterial);
          flareMesh.position.set((i-1)*1.8,(Math.random()-.5)*1.8,(Math.random()-.5)*1.8);
          flareMesh.scale.setScalar(1.1+Math.random()*.7);cloud.add(flareMesh);
          const glow=addTransientGlow(cloud,'#ff9b35',15+Math.random()*7,.96);
          glow.position.copy(flareMesh.position);glow.userData.baseSize=glow.scale.x;glow.userData.flareGlow=true;
        }
      }else{
        for(let i=0;i<18;i++){
          const piece=new THREE.Mesh(chaffDecoyGeo,chaffDecoyMaterial);
          piece.position.set((Math.random()-.5)*5,(Math.random()-.5)*4,(Math.random()-.5)*6);
          piece.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);cloud.add(piece);
        }
      }
      this.scene.add(cloud);
      const velocity=(enemy.velocity??stationaryVelocity).clone()
        .addScaledVector(rear,type==='ir'?105:62)
        .addScaledVector(right,(Math.random()-.5)*18)
        .addScaledVector(up,type==='ir'?18:-5);
      this.decoys.push({team:'enemy',source:enemy, type,mesh:cloud,position:cloud.position,velocity,life:2.7,maxLife:2.7,active:true,age:0,trailClock:0,spoofChance:type==='ir'?.62:.58});
    }
    return true;
  }
  updateMissionObjective(dt){
    if(this.destroyed||this.missionComplete)return;
    const type=this.missionObjective.type;
    if(type==='training')this.objectiveElapsed=Math.min(this.missionObjective.duration??90,this.objectiveElapsed+dt);
    this.renderMissionObjective();

    const airRemaining=this.enemies.filter(enemy=>!enemy.dead).length;
    const groundRemaining=this.redUnits.filter(unit=>!unit.dead&&unit.armed!==false).length;
    const complete=type==='training'
      ? this.objectiveElapsed>=(this.missionObjective.duration??90)
      : type==='support'
        ? airRemaining===0&&groundRemaining===0
        : airRemaining===0;
    if(complete)this.completeMission();
  }
  renderMissionObjective(){
    if(this.objectiveTitle){
      const type=this.missionObjective.type;
      this.objectiveTitle.textContent=t(`mission.objective.${type}`);
    }
    if(!this.objectiveProgress)return;
    if(this.missionComplete){
      this.objectiveProgress.textContent=t('mission.progress.complete');
      return;
    }
    const type=this.missionObjective.type;
    if(type==='training'){
      const duration=this.missionObjective.duration??90;
      this.objectiveProgress.textContent=t('mission.progress.training',{
        elapsed:Math.min(duration,Math.floor(this.objectiveElapsed)),duration,
      });
    }else if(type==='support'){
      this.objectiveProgress.textContent=t('mission.progress.support',{
        airRemaining:this.enemies.filter(enemy=>!enemy.dead).length,
        airTotal:this.objectiveTotals.air,
        groundRemaining:this.redUnits.filter(unit=>!unit.dead&&unit.armed!==false).length,
        groundTotal:this.objectiveTotals.ground,
      });
    }else{
      this.objectiveProgress.textContent=t('mission.progress.air',{
        remaining:this.enemies.filter(enemy=>!enemy.dead).length,
      });
    }
  }
  renderMissionComplete(){
    if(!this.missionComplete)return;
    const title=this.missionCompleteNotice?.querySelector('#mission-complete-title');
    if(title)title.textContent=t('mission.objectiveAchieved');
    if(this.missionCompleteDetail)this.missionCompleteDetail.textContent=t(`mission.complete.${this.mission.id}`);
  }
  completeMission(){
    if(this.missionComplete)return;
    this.missionComplete=true;
    this.renderMissionObjective();
    this.renderMissionComplete();
    if(this.statusText)this.statusText.textContent=t('mission.statusComplete');
    if(this.status)this.status.classList.add('complete');
    if(this.missionCompleteNotice){
      this.missionCompleteNotice.hidden=false;
      this.missionCompleteNotice.classList.remove('visible');
      requestAnimationFrame(()=>this.missionCompleteNotice?.classList.add('visible'));
      this.missionNoticeTimer=setTimeout(()=>{
        this.missionCompleteNotice?.classList.remove('visible');
        if(this.missionCompleteNotice)this.missionCompleteNotice.hidden=true;
        this.missionNoticeTimer=null;
      },8500);
    }
  }
  updateDecoys(dt){
    for(let i=this.decoys.length-1;i>=0;i--){
      const decoy=this.decoys[i];
      if(decoy.active){
        decoy.life-=dt;decoy.age+=dt;decoy.mesh.position.addScaledVector(decoy.velocity,dt);
        decoy.velocity.multiplyScalar(Math.exp(-.24*dt));
        decoy.mesh.rotation.y+=dt*(decoy.type==='ir'?1.5:.4);
        const progress=1-decoy.life/decoy.maxLife;
        if(decoy.type==='ir'){
          decoy.mesh.scale.setScalar(1+progress*.42);
          for(const child of decoy.mesh.children){
            if(!child.userData.flareGlow)continue;
            const flicker=.84+Math.sin(decoy.age*43+child.position.x)*.16;
            child.material.opacity=(1-progress)**.72*flicker;
            child.scale.setScalar(child.userData.baseSize*(.72+progress*.75)*flicker);
          }
          decoy.trailClock-=dt;
          if(decoy.trailClock<=0){
            const drift=decoy.velocity.clone().multiplyScalar(.055).add(new THREE.Vector3((Math.random()-.5)*7,Math.random()*8,(Math.random()-.5)*7));
            this.fx?.emitParticle(decoy.position,drift,flareParticleColor,.42,2.4+Math.random()*1.2,.98,1);
            decoy.trailClock=.035;
          }
        }else{
          decoy.mesh.scale.setScalar(1+progress*.72);
          decoy.trailClock-=dt;
          if(decoy.trailClock<=0){
            const drift=decoy.velocity.clone().multiplyScalar(.025).add(new THREE.Vector3((Math.random()-.5)*9,(Math.random()-.5)*6,(Math.random()-.5)*9));
            this.fx?.emitParticle(decoy.position,drift,chaffParticleColor,.34,1.15+Math.random()*.55,.58,.3);
            decoy.trailClock=.11;
          }
        }
        if(decoy.life<=0){decoy.active=false;this.scene.remove(decoy.mesh);}
      }
      const trackedByMissile=this.hostiles.some(missile=>missile.missile&&missile.decoyTarget===decoy)
        ||this.playerShots.some(missile=>missile.homing&&missile.decoyTarget===decoy);
      if(!decoy.active&&!trackedByMissile){
        disposeTransientMaterials(decoy.mesh);this.decoys.splice(i,1);
      }
    }
  }
  updateShots(dt){
    for(let i=this.playerShots.length-1;i>=0;i--){const s=this.playerShots[i];s.life-=dt;
      if(s.homing&&(!s.target||s.target.dead))s.life=0;
      if(s.homing&&s.target&&!s.target.dead){
        if(s.decoyTarget&&!s.decoyTarget.active)s.decoyTarget=null;
        if(!s.decoyTarget&&s.seeker){
          let nearest=1250, candidate=null;
          for(const decoy of this.decoys){
            if(!decoy.active||decoy.team!=='enemy'||decoy.source!==s.target||decoy.type!==s.seeker||s.decoyAttempts.has(decoy))continue;
            const distance=s.mesh.position.distanceTo(decoy.position);
            if(distance<nearest){nearest=distance;candidate=decoy;}
          }
          if(candidate){
            s.decoyAttempts.add(candidate);
            if(Math.random()<candidate.spoofChance)s.decoyTarget=candidate;
          }
        }
        const missileSpeed=s.speed??(s.targetDomain==='ground'?270:350);
        let aimPoint;
        if(s.decoyTarget){
          aimPoint=s.decoyTarget.position.clone().addScaledVector(s.decoyTarget.velocity,.15);
        }else{
          const targetVelocity=s.target.velocity??stationaryVelocity;
          const targetOffset=s.target.mesh.position.clone().sub(s.mesh.position);
          const leadTime=estimateInterceptTime(targetOffset,targetVelocity,missileSpeed);
          aimPoint=s.target.mesh.position.clone().addScaledVector(targetVelocity,leadTime);
        }
        const desiredDirection=aimPoint.sub(s.mesh.position).normalize();
        const direction=turnDirection(s.velocity,desiredDirection,MISSILE_TURN_RATE*dt);
        s.velocity.copy(direction).multiplyScalar(missileSpeed);
        s.mesh.quaternion.setFromUnitVectors(forward,direction);
        if(Math.random()<.04)this.addSpark(s.mesh.position);
      }
      if(s.homing)this.audio?.updateMissileFlight(s.mesh.id,s.mesh.position.distanceTo(this.player.position),dt);
      const previous=s.mesh.position.clone();
      s.mesh.position.addScaledVector(s.velocity,dt);
      if(s.decoyTarget&&pointSegmentDistanceSquared(s.decoyTarget.position,previous,s.mesh.position)<12**2){
        this.addSpark(s.mesh.position);s.life=0;
      }
      let hit=null,hitInfo=null;
      if(s.life>0)for(const e of this.enemies){
        if(e.dead)continue;
        // AirBattle advances aircraft before projectiles. Sweep the shot against
        // the target's movement during this frame so fast crossings do not tunnel.
        const relativeStart=previous.clone().addScaledVector(e.velocity??stationaryVelocity,dt);
        const impact=traceFighterHit(relativeStart,s.mesh.position,e.mesh);
        if(impact&&(!hitInfo||impact.t<hitInfo.t)){hit=e;hitInfo=impact;}
      }
      if(s.life>0&&!s.ally)for(const unit of this.redUnits){if(unit.dead)continue;const impact=traceVehicleHit(previous,s.mesh.position,unit.mesh);if(impact&&(!hitInfo||impact.t<hitInfo.t)){hit=unit;hitInfo=impact;}}
      if(hit){
        hit.hp-=s.damage*(hitInfo.damage??1);
        if(hit.hp<=0){if(hit.mesh.userData.faction==='red')this.destroyUnit(hit);else this.killJet(hit,!s.ally);}
        else this.addSpark(previous.clone().lerp(s.mesh.position,hitInfo.t));
        s.life=0;
      }
      if(s.life<=0){if(s.homing)this.audio?.stopMissileFlight(s.mesh.id);this.scene.remove(s.mesh);this.playerShots.splice(i,1);}
    }
    this.incomingMissile=false;
    for(let i=this.hostiles.length-1;i>=0;i--){
      const s=this.hostiles[i];if(!s.projectile)continue;s.life-=dt;
      const previous=s.mesh.position.clone();
      if(s.missile){
        const distanceToPlayer=s.mesh.position.distanceTo(this.player.position);
        if(distanceToPlayer<1900){
          this.incomingMissile=true;
          s.warningClock-=dt;
          if(s.warningClock<=0){this.audio?.playIncomingMissile();s.warningClock=1.25;}
        }
        if(!s.decoyTarget){
          let nearest=1250;
          for(const decoy of this.decoys){
            if(!decoy.active||decoy.team!=='player'||decoy.type!==s.seeker)continue;
            const d=s.mesh.position.distanceTo(decoy.position);
            if(d<nearest){nearest=d;s.decoyTarget=decoy;}
          }
        }
        const aimTarget=s.decoyTarget?s.decoyTarget.position:this.player.position;
        const missileSpeed=305;
        const wanted=aimTarget.clone().sub(s.mesh.position).normalize().multiplyScalar(missileSpeed);
        s.velocity.lerp(wanted,1-Math.exp(3.1*dt));
        if(s.velocity.lengthSq()>1)s.mesh.quaternion.setFromUnitVectors(forward,s.velocity.clone().normalize());
        this.audio?.updateMissileFlight(s.mesh.id,distanceToPlayer,dt);
        s.mesh.position.addScaledVector(s.velocity,dt);
        if(s.decoyTarget&&pointSegmentDistanceSquared(s.decoyTarget.position,previous,s.mesh.position)<12**2){this.addSpark(s.mesh.position);s.life=0;}
        else if(!s.decoyTarget&&pointSegmentDistanceSquared(this.player.position,previous,s.mesh.position)<13**2){this.destroyPlayer('combat.hostileMissile');this.addExplosion(s.mesh.position,.48);s.life=0;}
      }else{
        s.mesh.position.addScaledVector(s.velocity,dt);
        if(s.ground&&s.target&&!s.target.dead&&s.mesh.position.distanceTo(s.target.mesh.position)<12){s.target.hp--;if(s.target.hp<=0)this.destroyUnit(s.target);this.addExplosion(s.mesh.position,.72);s.life=0;}
        if(!s.ground&&pointSegmentDistanceSquared(this.player.position,previous,s.mesh.position)<9**2){this.destroyPlayer('combat.hostileFire');s.life=0;}
      }
      if(s.life<=0){if(s.missile)this.audio?.stopMissileFlight(s.mesh.id);this.scene.remove(s.mesh);this.hostiles.splice(i,1);}
    }
  }
  killJet(e,credited=true){e.dead=true;this.scene.remove(e.mesh);if(credited)this.score+=500;this.addExplosion(e.mesh.position,1.12);}
  destroyUnit(u){u.dead=true;this.scene.remove(u.mesh);if(u.team==='red')this.score+=100;this.addExplosion(u.mesh.position,.82);}
  addSpark(pos){
    for(let i=0;i<7;i++){
      const velocity=new THREE.Vector3((Math.random()-.5)*48,(Math.random()-.25)*54,(Math.random()-.5)*48);
      this.fx?.emitParticle(pos,velocity,i<3?hotEmberColor:emberColor,.28+Math.random()*.3,2+Math.random()*1.5,.98,1);
    }
    const sprite=addTransientGlow(this.scene,'#fff0ae',5,.95);sprite.position.copy(pos);
    this.effects.push({mesh:sprite,kind:'spark',material:sprite.material,life:.2,maxLife:.2});
  }
  addExplosion(pos,intensity=1){
    const distance=pos.distanceTo(this.player.position);
    this.audio?.playExplosion(distance,intensity>1.05);
    const group=new THREE.Group();group.position.copy(pos);this.scene.add(group);
    const core=addTransientGlow(group,'#fff1bd',30*intensity,1);
    const fireball=new THREE.Mesh(effectSphereGeo,explosionShellMaterial.clone());
    fireball.material.userData.transient=true;group.add(fireball);
    const smoke=addTransientGlow(group,'#73665f',26*intensity,.38,THREE.NormalBlending);smoke.position.y=4*intensity;
    const ring=new THREE.Mesh(shockwaveGeo,shockwaveMaterial.clone());
    ring.material.userData.transient=true;
    ring.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);group.add(ring);
    const effect={
      mesh:group,kind:'explosion',life:1.45,maxLife:1.45,intensity,core,fireball,smoke,ring,
      innerColor:new THREE.Color('#fff0ab'),outerColor:new THREE.Color('#a72d18'),
    };
    this.effects.push(effect);

    for(let i=0;i<26;i++){
      const direction=new THREE.Vector3(Math.random()-.5,Math.random()-.35,Math.random()-.5).normalize();
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
      if(effect.life<=0){this.scene.remove(effect.mesh);disposeTransientMaterials(effect.mesh);this.effects.splice(i,1);continue;}
      const progress=1-effect.life/effect.maxLife;
      if(effect.kind==='spark'){
        effect.material.opacity=(1-progress)**1.7;
        effect.mesh.scale.setScalar(5+progress*9);
      }else{
        const intensity=effect.intensity;
        effect.core.material.opacity=1-THREE.MathUtils.smoothstep(progress,.02,.3);
        effect.core.scale.setScalar(intensity*(28+progress*22));
        effect.fireball.scale.setScalar(intensity*(7+progress*48));
        effect.fireball.material.opacity=.88*(1-THREE.MathUtils.smoothstep(progress,.08,.78));
        effect.fireball.material.color.copy(effect.innerColor).lerp(effect.outerColor,progress);
        effect.smoke.material.opacity=.42*THREE.MathUtils.smoothstep(progress,.02,.24)*(1-progress*.7);
        effect.smoke.position.y=intensity*(4+progress*30);
        effect.smoke.scale.setScalar(intensity*(24+progress*78));
        effect.ring.material.opacity=.76*(1-THREE.MathUtils.smoothstep(progress,.24,1));
        effect.ring.scale.setScalar(intensity*(8+progress*82));
        effect.ring.rotation.z+=dt*.75;
      }
    }
  }
  updateHud(){
    if(this.weapon)this.weapon.textContent=this.input.pressed.has('Space')?t('combat.firing'):t('hud.readyShort');
    if(this.countermeasureCount)this.countermeasureCount.textContent=String(this.countermeasures).padStart(2,'0');
    if(this.threatWarning)this.threatWarning.hidden=!this.incomingMissile;
    if(this.ammo){
      let seeker;
      if(this.missileFeedbackTimer>0&&this.missileFeedbackKey)seeker=t(this.missileFeedbackKey);
      else if(this.missiles<=0)seeker=t('combat.noMissiles');
      else if(this.cooldown>0)seeker=t('combat.cooling',{seconds:formatNumber(this.cooldown,{minimumFractionDigits:1,maximumFractionDigits:1})});
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
    if(this.missileCount)this.missileCount.textContent=String(this.missiles).padStart(2,'0');
    if(this.scoreEl)this.scoreEl.textContent=String(this.score).padStart(5,'0');
  }
}
