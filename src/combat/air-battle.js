import * as THREE from 'three';
import { createFighter } from '../plane.js';
import { createMissile } from './projectiles.js';

const allyShotGeo = new THREE.SphereGeometry(.12, 5, 4);
const hostileShotGeo = new THREE.SphereGeometry(.3, 7, 5);
const allyShotMaterial = new THREE.MeshBasicMaterial({ color: '#75dff0' });
const hostileShotMaterial = new THREE.MeshBasicMaterial({ color: '#ff694d' });
const forward = new THREE.Vector3(0, 0, 1);

/** Enemy and wingman formation flight, combat decisions and air-to-air fire. */
export class AirBattle {
  constructor({ scene, player, aircraftAsset, mission, audio, fx, playerVelocity, getPlayerHeading, addHostileProjectile, addPlayerProjectile }) {
    this.scene = scene;
    this.player = player;
    this.aircraftAsset = aircraftAsset;
    this.mission = mission;
    this.audio = audio;
    this.fx = fx;
    this.playerVelocity = playerVelocity;
    this.currentPlayerHeading = getPlayerHeading;
    this.addHostileProjectile = addHostileProjectile;
    this.addPlayerProjectile = addPlayerProjectile;
    this.enemies = [];
    this.allies = [];
    this.spawn();
  }

  spawn(){
    const yaw=this.currentPlayerHeading();
    const forward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
    const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
    const hostileCount=this.mission.hostiles;
    for(let i=0;i<hostileCount;i++){
      const jet=createFighter({enemy:true});
      jet.position.copy(this.player.position).addScaledVector(right,(i-(hostileCount-1)*.5)*70).addScaledVector(forward,300+i*95);
      jet.position.y=this.player.position.y+25+i*12; jet.rotation.y=yaw+Math.PI; jet.scale.setScalar(.82);
      this.scene.add(jet); this.enemies.push({mesh:jet,label:'SU-35',hp:4,orbit:i*.9,fire:2+i*.7,missileClock:7+i*2.8,missilesFired:0,velocity:new THREE.Vector3(),boostClock:1.2+i*.8,boosting:false,dead:false});
    }
    for(let i=0;i<this.mission.wingmen;i++){
      const jet=createFighter({friendly:true,aircraftAsset:this.aircraftAsset});
      jet.position.copy(this.player.position).addScaledVector(right,i===0?-52:52).addScaledVector(forward,-68-i*10);
      jet.position.y=this.player.position.y+8; jet.rotation.y=yaw; this.scene.add(jet);
      this.allies.push({mesh:jet,wing:i===0?-1:1,fire:1.8+i*.9,velocity:new THREE.Vector3(),dead:false});
    }
  }
  update(dt) {
    const heading = this.currentPlayerHeading();
    this.updateJets(dt, heading);
    this.updateAllies(dt, heading);
  }
  updateJets(dt, yaw){
    const p=this.player.position;
    const playerForward=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
    const playerRight=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
    const playerUp=new THREE.Vector3(0,1,0).applyQuaternion(this.player.quaternion);
    for(let i=0;i<this.enemies.length;i++){
      const e=this.enemies[i];if(e.dead)continue;
      e.orbit+=dt*(.2+(i%3)*.025);
      e.fire-=dt;
      e.missileClock-=dt;
      e.boostClock-=dt;
      if(e.boostClock<=0){e.boosting=!e.boosting;e.boostClock=e.boosting?1.1+Math.random()*1.4:2.3+Math.random()*3.2;}
      e.mesh.userData.boosting=e.boosting;
      if(e.mesh.userData.afterburner){
        e.mesh.userData.afterburner.visible=e.boosting;
        const pulse=1+Math.sin((e.orbit*18)+e.mesh.position.z*.015)*.045;
        e.mesh.userData.afterburner.scale.setScalar(e.boosting?pulse:1);
      }
      // Keep opponents in a compact, moving combat orbit around the player.
      // Steering is velocity-limited; position.lerp() made distant aircraft
      // teleport at extreme speeds while trying to catch up.
      const radius=350+(i%3)*65;
      const desired=p.clone()
        .addScaledVector(playerForward,260+Math.cos(e.orbit)*radius*.58)
        .addScaledVector(playerRight,Math.sin(e.orbit)*radius);
      desired.y+=Math.sin(e.orbit*1.45+i)*75;
      const rangeToPlayer=e.mesh.position.distanceTo(p);
      if(rangeToPlayer>1250){
        e.mesh.position.copy(p).addScaledVector(playerForward,300+Math.cos(e.orbit)*120)
          .addScaledVector(playerRight,Math.sin(e.orbit)*260).addScaledVector(playerUp,Math.sin(e.orbit)*60);
        e.velocity.copy(this.playerVelocity);
      }
      const correction=desired.sub(e.mesh.position).multiplyScalar(2.5).clampLength(0,175);
      const wantedVelocity=this.playerVelocity.clone().add(correction).clampLength(0,520);
      e.velocity.lerp(wantedVelocity,1-Math.exp(-3.5*dt));
      e.mesh.position.addScaledVector(e.velocity,dt);
      const aim=p.clone().addScaledVector(this.playerVelocity,.35).sub(e.mesh.position).normalize();
      const travel=e.velocity.lengthSq()>1?e.velocity.clone().normalize():aim.clone();
      const nose=travel.multiplyScalar(.42).addScaledVector(aim,.58).normalize();
      e.mesh.rotation.order='YXZ'; e.mesh.rotation.y=Math.atan2(nose.x,nose.z); e.mesh.rotation.x=-Math.atan2(nose.y,Math.max(1,Math.hypot(nose.x,nose.z)));
      e.mesh.rotation.z=Math.sin(e.orbit)*.2;
      const distance=e.mesh.position.distanceTo(p);
      if(e.fire<=0&&distance<1000){this.fireEnemy(e);e.fire=4.5+Math.random()*3.5;}
      const enemyNose=new THREE.Vector3(0,0,1).applyQuaternion(e.mesh.quaternion).normalize();
      if(e.missileClock<=0&&e.missilesFired<3&&distance>280&&distance<1450&&enemyNose.dot(aim)>.62){
        this.launchEnemyMissile(e);e.missileClock=11+Math.random()*5;e.missilesFired++;
      }
    }
  }
  updateAllies(dt, yaw){
    const playerRight=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
    for(const ally of this.allies){if(ally.dead)continue;
      let target=null,best=1200;
      for(const enemy of this.enemies){if(enemy.dead)continue;const d=enemy.mesh.position.distanceTo(ally.mesh.position);if(d<best){best=d;target=enemy;}}
      let desired;
      if(target){
        desired=target.mesh.position.clone().addScaledVector(playerRight,ally.wing*220).add(new THREE.Vector3(0,50+ally.wing*12,0));
      }else{
        const localOffset=new THREE.Vector3(ally.wing*48,11,-70).applyQuaternion(this.player.quaternion);
        desired=this.player.position.clone().add(localOffset);
      }
      if(ally.mesh.position.distanceTo(this.player.position)>1100){
        const localOffset=new THREE.Vector3(ally.wing*48,11,-70).applyQuaternion(this.player.quaternion);
        ally.mesh.position.copy(this.player.position).add(localOffset);ally.velocity.copy(this.playerVelocity);
      }
      const correction=desired.sub(ally.mesh.position).multiplyScalar(3.2).clampLength(0,155);
      const wantedVelocity=this.playerVelocity.clone().add(correction).clampLength(0,530);
      ally.velocity.lerp(wantedVelocity,1-Math.exp(-4.2*dt));
      ally.mesh.position.addScaledVector(ally.velocity,dt);
      ally.mesh.userData.boosting=Boolean(this.player.userData.boosting);
      if(ally.mesh.userData.afterburner)ally.mesh.userData.afterburner.visible=ally.mesh.userData.boosting;
      if(target){const d=target.mesh.position.clone().sub(ally.mesh.position);ally.mesh.rotation.order='YXZ';ally.mesh.rotation.y=Math.atan2(d.x,d.z);ally.mesh.rotation.x=-Math.atan2(d.y,Math.hypot(d.x,d.z));ally.mesh.rotation.z=ally.wing*.08;
        ally.fire-=dt;if(ally.fire<=0){this.fireAlly(ally,target);ally.fire=1.1+Math.random()*1.2;}
      }else{ally.mesh.quaternion.copy(this.player.quaternion);}
    }
  }
  fireAlly(ally,target){
    this.audio?.playDistantGun(ally.mesh.position.distanceTo(this.player.position),'air');
    const start=ally.mesh.position.clone(),dir=target.mesh.position.clone().sub(start).normalize();
    this.fx?.addTracer(start,start.clone().addScaledVector(dir,25),'#82e7ff');
    const shot=new THREE.Mesh(allyShotGeo,allyShotMaterial);shot.position.copy(start);this.scene.add(shot);
    this.addPlayerProjectile({mesh:shot,velocity:dir.multiplyScalar(510),life:3.5,damage:.45,ally:true});
  }
  fireEnemy(e){
    this.audio?.playDistantGun(e.mesh.position.distanceTo(this.player.position),'air');
    const start=e.mesh.position.clone(),target=this.player.position.clone();
    const aim=target.clone().sub(start).normalize();
    this.fx?.addTracer(start,start.clone().addScaledVector(aim,28),'#ff735a');
    const shot=new THREE.Mesh(hostileShotGeo,hostileShotMaterial);shot.position.copy(start);this.scene.add(shot);
    this.addHostileProjectile({projectile:true,mesh:shot,velocity:target.sub(start).normalize().multiplyScalar(145),life:7});
  }
  launchEnemyMissile(enemy){
    const dir=forward.clone().applyQuaternion(enemy.mesh.quaternion).normalize();
    const start=enemy.mesh.position.clone().addScaledVector(dir,5);
    const predicted=this.player.position.clone().addScaledVector(this.playerVelocity,.45);
    const aim=predicted.sub(start).normalize();
    const mesh=createMissile('#c5c5bc');mesh.position.copy(start);mesh.quaternion.setFromUnitVectors(forward,aim);this.scene.add(mesh);
    if(mesh.userData.engineFlame)mesh.userData.engineFlame.visible=true;
    const seeker=Math.random()<.5?'ir':'radar';
    this.addHostileProjectile({projectile:true,missile:true,homing:true,seeker,mesh,velocity:aim.multiplyScalar(305),life:8.5,warningClock:0,decoyTarget:null});
    this.audio?.playMissileLaunch();this.audio?.startMissileFlight(mesh.id);
  }
  dispose() {
    for (const unit of [...this.enemies, ...this.allies]) this.scene.remove(unit.mesh);
    this.enemies.length = 0;
    this.allies.length = 0;
  }
}
