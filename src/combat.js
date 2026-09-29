import * as THREE from 'three';
import { AirBattle } from './combat/air-battle.js';
import { GroundBattle } from './combat/ground-battle.js';
import { CombatInput } from './combat/input.js';
import { CombatRadar } from './combat/radar.js';
import { pointSegmentDistanceSquared, traceFighterHit, traceVehicleHit } from './combat/hit-testing.js';
import { createMissile } from './combat/projectiles.js';
import { formatNumber, t } from './i18n.js';

const mat = (color, roughness=.85) => new THREE.MeshStandardMaterial({color,roughness,flatShading:true});
const flare=new THREE.MeshBasicMaterial({color:'#ffd18a'});
const sphereGeo=new THREE.SphereGeometry(1,7,5);
const gunShotGeo=new THREE.SphereGeometry(.16,6,5);
const flareDecoyGeo=new THREE.SphereGeometry(1,7,5),flareDecoyMaterial=new THREE.MeshBasicMaterial({color:'#ff8c37',toneMapped:false});
const chaffDecoyGeo=new THREE.TetrahedronGeometry(.18,0),chaffDecoyMaterial=new THREE.MeshBasicMaterial({color:'#d9e2d8',transparent:true,opacity:.72,toneMapped:false});
const explosionMaterial=mat('#bd6540');
const forward=new THREE.Vector3(0,0,1);
const localForward=new THREE.Vector3(0,0,1),localRight=new THREE.Vector3(1,0,0),localUp=new THREE.Vector3(0,1,0);
export class CombatWorld {
  constructor(scene, player, terrain, fx, aircraftAsset = null, mission = {}, audio = null) {
    this.scene=scene; this.player=player; this.enemies=[]; this.allies=[]; this.hostiles=[]; this.playerShots=[]; this.effects=[]; this.destroyed=false;
    this.fx=fx; this.audio=audio;
    const missionConfig={hostiles:4,wingmen:2,groundBattle:true,groundPairs:6,groundTrucks:12,...mission};
    this.input = new CombatInput();
    this.missiles=6; this.cooldown=0; this.score=0; this.gunClock=0;
    this.countermeasures=12; this.countermeasureCooldown=0; this.decoys=[]; this.incomingMissile=false;
    this.missileFeedbackKey=null; this.missileFeedbackTimer=0;
    this.terrain=terrain; this.playerHeading=0; this.previousPlayerPosition=player.position.clone(); this.playerVelocity=new THREE.Vector3();
    this.airBattle = new AirBattle({
      scene, player, aircraftAsset, mission: missionConfig, audio, fx,
      playerVelocity: this.playerVelocity,
      getPlayerHeading: () => this.getPlayerHeading(),
      addHostileProjectile: shot => this.hostiles.push(shot),
      addPlayerProjectile: shot => this.playerShots.push(shot),
    });
    this.enemies = this.airBattle.enemies;
    this.allies = this.airBattle.allies;
    this.groundBattle = new GroundBattle({ scene, player, terrain, mission: missionConfig, audio, fx, addProjectile: shot => this.hostiles.push(shot) });
    this.friends = this.groundBattle.friends;
    this.redUnits = this.groundBattle.redUnits;
    this.colliders = this.groundBattle.colliders;
    this.radar = new CombatRadar(player, audio);
    this.weapon=document.querySelector('#weapon'); this.ammo=document.querySelector('#ammo'); this.missileCount=document.querySelector('#missile-count'); this.scoreEl=document.querySelector('#score');
    this.countermeasureCount=document.querySelector('#countermeasure-count'); this.threatWarning=document.querySelector('#threat-warning');
    this.status=document.querySelector('.status'); this.deathScreen=document.querySelector('#death-screen'); this.deathReason=document.querySelector('#death-reason');
    this.restartButton = document.querySelector('#restart');
    this.onRestart = () => location.reload();
    this.restartButton?.addEventListener('click', this.onRestart);
    this.onLanguageChange = () => {
      this.radar.renderMode();
      this.updateHud();
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
    const missileRequested=justPressed.has('ControlLeft')||justPressed.has('ControlRight');
    const countermeasureRequested=justPressed.has('KeyC');
    if(radarModeRequested)this.radar.toggleMode();
    if(countermeasureRequested)this.deployCountermeasures();
    this.missileFeedbackTimer=Math.max(0,this.missileFeedbackTimer-dt);
    this.audio?.setGunFiring(this.input.pressed.has('Space')&&!this.destroyed);
    this.radar.updateContacts(dt, this.getPlayerHeading(), {
      airFriendly: this.allies, airHostile: this.enemies,
      groundFriendly: this.friends, groundHostile: this.redUnits,
    });
    this.radar.updateLock(dt, this.enemies, this.redUnits);
    if(this.input.pressed.has('Space')&&this.gunClock<=0){this.fireGun();this.gunClock=.09;}
    if(missileRequested)this.requestMissile();
    this.airBattle.update(dt);
    this.groundBattle.update(dt);
    this.updateShots(dt);
    this.updateDecoys(dt);
    this.updateEffects(dt);
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
    if(this.status){this.status.classList.add('destroyed');this.status.replaceChildren(document.createElement('i'),document.createTextNode(` ${t('combat.destroyed')}`));}
    this.addExplosion(this.player.position);
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
    for(const shot of [...this.playerShots,...this.hostiles]){
      if(shot.missile)this.audio?.stopMissileFlight(shot.mesh.id);
      if(shot.mesh)this.scene.remove(shot.mesh);
    }
    this.airBattle.dispose();
    this.groundBattle.dispose();
    for(const effect of this.effects)this.scene.remove(effect.mesh);
    for(const decoy of this.decoys)this.scene.remove(decoy.mesh);
    this.radar.dispose();
    this.effects.length=0;
    this.decoys.length=0;
    this.playerShots.length=0;
    this.hostiles.length=0;
    const designator=document.querySelector('#target-designator');
    if(designator){designator.hidden=true;designator.classList.remove('ground-target','locked');}
    if(this.threatWarning)this.threatWarning.hidden=true;
    if(this.status){this.status.classList.remove('destroyed');this.status.replaceChildren(document.createElement('i'),document.createTextNode(` ${t('hud.ready')}`));}
  }
  fireGun(){
    this.audio?.playGunBurst();
    const dir=forward.clone().applyQuaternion(this.player.quaternion);
    for(const side of [-1,1]){
      const start=this.player.position.clone().add(new THREE.Vector3(side*.9,-.25,3.8).applyQuaternion(this.player.quaternion));
      this.fx?.addTracer(start,start.clone().addScaledVector(dir,29),'#fff0a4');
      const shot=new THREE.Mesh(gunShotGeo,flare); shot.position.copy(start);this.scene.add(shot);
      this.playerShots.push({mesh:shot,velocity:dir.clone().multiplyScalar(630),life:1.7,damage:.5});
    }
  }
  fireMissile(){
    if(!this.radar.target||this.radar.target.dead)return;
    this.missiles--;this.cooldown=2.8;
    this.missileFeedbackKey=null; this.missileFeedbackTimer=0;
    const targetDomain=this.radar.targetDomain;
    const missileSpeed=targetDomain==='ground'?270:180;
    const missileLife=targetDomain==='ground'?13:8;
    const dir=forward.clone().applyQuaternion(this.player.quaternion);
    const mesh=createMissile('#d3d9d2');mesh.position.copy(this.player.position).addScaledVector(dir,5);this.scene.add(mesh);
    this.audio?.playMissileLaunch();
    this.audio?.startMissileFlight(mesh.id);
    if(mesh.userData.engineFlame)mesh.userData.engineFlame.visible=true;
    this.playerShots.push({mesh,velocity:dir.multiplyScalar(missileSpeed),life:missileLife,damage:5,homing:true,target:this.radar.target,targetDomain,trail:0});
  }
  requestMissile(){
    if(this.cooldown>0||this.missiles<=0){this.audio?.playWeaponNoLock();return;}
    if(!this.radar.target||this.radar.target.dead){this.missileFeedbackKey='combat.aimAtHostile';this.missileFeedbackTimer=1.5;this.audio?.playWeaponNoLock();return;}
    // A tracked target is sufficient to fire; the player need not wait for the
    // 100% lock cue. Holding the target in view improves lock while the missile
    // still guides toward an early soft-lock.
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
      flareMesh.position.set((i-1)*1.3,(Math.random()-.5)*1.4,(Math.random()-.5)*1.4);
      flareMesh.scale.setScalar(.9+Math.random()*.65);flareCloud.add(flareMesh);
    }
    this.scene.add(flareCloud);
    this.decoys.push({type:'ir',mesh:flareCloud,position:flareCloud.position,velocity:this.playerVelocity.clone().addScaledVector(rear,115).addScaledVector(right,(Math.random()-.5)*18).addScaledVector(up,18),life:2.7,maxLife:2.7,active:true});

    const chaffCloud=new THREE.Group();
    chaffCloud.position.copy(this.player.position).addScaledVector(rear,4).addScaledVector(up,-1);
    for(let i=0;i<18;i++){
      const piece=new THREE.Mesh(chaffDecoyGeo,chaffDecoyMaterial);
      piece.position.set((Math.random()-.5)*5,(Math.random()-.5)*4,(Math.random()-.5)*6);
      piece.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);chaffCloud.add(piece);
    }
    this.scene.add(chaffCloud);
    this.decoys.push({type:'radar',mesh:chaffCloud,position:chaffCloud.position,velocity:this.playerVelocity.clone().addScaledVector(rear,62).addScaledVector(right,(Math.random()-.5)*12).addScaledVector(up,-5),life:2.7,maxLife:2.7,active:true});
    this.audio?.playCountermeasure();this.updateHud();
  }
  updateDecoys(dt){
    for(let i=this.decoys.length-1;i>=0;i--){
      const decoy=this.decoys[i];
      if(decoy.active){
        decoy.life-=dt;decoy.mesh.position.addScaledVector(decoy.velocity,dt);
        decoy.velocity.multiplyScalar(Math.exp(-.24*dt));
        decoy.mesh.rotation.y+=dt*(decoy.type==='ir'?1.5:.4);
        decoy.mesh.scale.setScalar(decoy.type==='ir'?Math.max(.1,decoy.life/decoy.maxLife):1+(decoy.maxLife-decoy.life)*.3);
        if(decoy.life<=0){decoy.active=false;this.scene.remove(decoy.mesh);}
      }
      if(!decoy.active&&!this.hostiles.some(missile=>missile.missile&&missile.decoyTarget===decoy))this.decoys.splice(i,1);
    }
  }
  updateShots(dt){
    for(let i=this.playerShots.length-1;i>=0;i--){const s=this.playerShots[i];s.life-=dt;
      if(s.homing&&s.target&&!s.target.dead){const missileSpeed=s.targetDomain==='ground'?270:180;const wanted=s.target.mesh.position.clone().sub(s.mesh.position).normalize().multiplyScalar(missileSpeed);s.velocity.lerp(wanted,1-Math.exp(2.4*dt));s.mesh.quaternion.setFromUnitVectors(forward,s.velocity.clone().normalize());if(Math.random()<.16)this.addSpark(s.mesh.position);}
      if(s.homing)this.audio?.updateMissileFlight(s.mesh.id,s.mesh.position.distanceTo(this.player.position),dt);
      const previous=s.mesh.position.clone();
      s.mesh.position.addScaledVector(s.velocity,dt);
      let hit=null,hitInfo=null;
      for(const e of this.enemies){if(e.dead)continue;const impact=traceFighterHit(previous,s.mesh.position,e.mesh);if(impact&&(!hitInfo||impact.t<hitInfo.t)){hit=e;hitInfo=impact;}}
      if(!s.ally)for(const unit of this.redUnits){if(unit.dead)continue;const impact=traceVehicleHit(previous,s.mesh.position,unit.mesh);if(impact&&(!hitInfo||impact.t<hitInfo.t)){hit=unit;hitInfo=impact;}}
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
            if(!decoy.active||decoy.type!==s.seeker)continue;
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
        else if(!s.decoyTarget&&pointSegmentDistanceSquared(this.player.position,previous,s.mesh.position)<13**2){this.destroyPlayer('combat.hostileMissile');this.addExplosion(s.mesh.position);s.life=0;}
      }else{
        s.mesh.position.addScaledVector(s.velocity,dt);
        if(s.ground&&s.target&&!s.target.dead&&s.mesh.position.distanceTo(s.target.mesh.position)<12){s.target.hp--;if(s.target.hp<=0)this.destroyUnit(s.target);this.addExplosion(s.mesh.position);s.life=0;}
        if(!s.ground&&pointSegmentDistanceSquared(this.player.position,previous,s.mesh.position)<9**2){this.destroyPlayer('combat.hostileFire');s.life=0;}
      }
      if(s.life<=0){if(s.missile)this.audio?.stopMissileFlight(s.mesh.id);this.scene.remove(s.mesh);this.hostiles.splice(i,1);}
    }
  }
  killJet(e,credited=true){e.dead=true;this.scene.remove(e.mesh);if(credited)this.score+=500;this.addExplosion(e.mesh.position);}
  destroyUnit(u){u.dead=true;this.scene.remove(u.mesh);if(u.team==='red')this.score+=100;this.addExplosion(u.mesh.position);}
  addSpark(pos){const m=new THREE.Mesh(sphereGeo,flare);m.scale.setScalar(.35);m.position.copy(pos);this.scene.add(m);this.effects.push({mesh:m,life:.26});}
  addExplosion(pos){this.audio?.playExplosion(pos.distanceTo(this.player.position),pos===this.player.position);const g=new THREE.Group();g.position.copy(pos);this.scene.add(g);
    for(let i=0;i<9;i++){const m=new THREE.Mesh(sphereGeo,i<4?flare:explosionMaterial);m.position.set((Math.random()-.5)*2,(Math.random()-.5)*2,(Math.random()-.5)*2);m.scale.setScalar(.7+Math.random()*2);g.add(m);}
    this.effects.push({mesh:g,life:1.15,explosion:true});}
  updateEffects(dt){for(let i=this.effects.length-1;i>=0;i--){const e=this.effects[i];e.life-=dt;e.mesh.scale.multiplyScalar(1+dt*(e.explosion?1.9:0));if(e.life<=0){this.scene.remove(e.mesh);this.effects.splice(i,1);}}}
  updateHud(){
    if(this.weapon)this.weapon.textContent=this.input.pressed.has('Space')?t('combat.firing'):t('hud.readyShort');
    if(this.countermeasureCount)this.countermeasureCount.textContent=String(this.countermeasures).padStart(2,'0');
    if(this.threatWarning)this.threatWarning.hidden=!this.incomingMissile;
    if(this.ammo){
      let seeker;
      if(this.missileFeedbackTimer>0&&this.missileFeedbackKey)seeker=t(this.missileFeedbackKey);
      else if(this.missiles<=0)seeker=t('combat.noMissiles');
      else if(this.cooldown>0)seeker=t('combat.cooling',{seconds:formatNumber(this.cooldown,{minimumFractionDigits:1,maximumFractionDigits:1})});
      else if(this.radar.target&&this.radar.lock>.96)seeker=t('combat.locked');
      else if(this.radar.target)seeker=t('combat.tracking',{percent:Math.round(this.radar.lock*100)});
      else seeker=t(this.radar.mode==='ground'?'combat.searchGround':'combat.searchAir');
      this.ammo.textContent=seeker;
      const acquiring=Boolean(this.radar.target&&this.radar.lock<=.96);
      const locked=Boolean(this.radar.target&&this.radar.lock>.96);
      this.ammo.classList.toggle('acquiring',acquiring);
      this.ammo.classList.toggle('locked',locked);
      this.ammo.classList.toggle('ground-target',this.radar.targetDomain==='ground');
    }
    if(this.missileCount)this.missileCount.textContent=String(this.missiles).padStart(2,'0');
    if(this.scoreEl)this.scoreEl.textContent=String(this.score).padStart(5,'0');
  }
}
