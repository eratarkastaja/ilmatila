import * as THREE from 'three';
import { createGroundVehicle, getGroundVehicleSpec } from '../vehicles.js';

const groundShotGeo = new THREE.SphereGeometry(.75, 5, 4);
const blueGroundShotMaterial = new THREE.MeshBasicMaterial({ color: '#ffd889' });
const redGroundShotMaterial = new THREE.MeshBasicMaterial({ color: '#ff785d' });

/** Owns ground-unit placement, movement, engagement and fire control. */
export class GroundBattle {
  constructor({ scene, player, terrain, mission, audio, fx, addProjectile }) {
    this.scene = scene;
    this.player = player;
    this.terrain = terrain;
    this.mission = mission;
    this.audio = audio;
    this.fx = fx;
    this.addProjectile = addProjectile;
    this.friends = [];
    this.redUnits = [];
    this.colliders = [];
    this.spawn();
    this.groundUnits = [...this.friends, ...this.redUnits];
  }

  spawn(){
    // Keep the orthophoto unobstructed and place units only on mapped dry ground.
    if(!this.mission.groundBattle)return;
    let seed=54321; const rnd=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
    const finnishTypes=['leopard2','cv9030','pasi'];
    const russianTypes=['t72','bmp2','btr80'];
    for(let i=0;i<this.mission.groundPairs;i++){
      const z=240+i*92, offset=(i%2)*28;
      const blueType=finnishTypes[i%finnishTypes.length],redType=russianTypes[i%russianTypes.length];
      const blue= createGroundVehicle(blueType,'finnish'), red=createGroundVehicle(redType,'russian');
      const blueSpec=getGroundVehicleSpec(blueType),redSpec=getGroundVehicleSpec(redType);
      const bluePos=nearestDryPoint(this.terrain,-420+offset,z),redPos=nearestDryPoint(this.terrain,420-offset,z+25);
      if(!bluePos||!redPos)continue;
      blue.position.set(bluePos.x,bluePos.y,bluePos.z); blue.rotation.y=Math.PI/2;
      red.position.set(redPos.x,redPos.y,redPos.z); red.rotation.y=-Math.PI/2;
      this.scene.add(blue,red);
      const blueUnit={mesh:blue,hp:blueSpec.hp,maxHp:blueSpec.hp,team:'blue',cool:1+i*.33,phase:i*.8,armed:true,speed:blueSpec.kind==='tracked'?10.5+rnd()*2:14+rnd()*2.5,flank:i%2===0?1:-1,velocity:new THREE.Vector3()};
      const redUnit={mesh:red,hp:redSpec.hp,maxHp:redSpec.hp,team:'red',cool:2+i*.25,phase:i*.8+1,armed:true,speed:redSpec.kind==='tracked'?10+rnd()*2:13.5+rnd()*2.5,flank:i%2===0?-1:1,velocity:new THREE.Vector3()};
      this.friends.push(blueUnit);this.redUnits.push(redUnit);
      blueUnit.collider={type:'vehicle',mesh:blue,x:bluePos.x,y:bluePos.y,z:bluePos.z,radius:blueSpec.radius,height:blueSpec.totalHeight,velocity:blueUnit.velocity,collisionKey:'combat.collisionFriendlyVehicle',vehicle:blueSpec.name};
      redUnit.collider={type:'vehicle',mesh:red,x:redPos.x,y:redPos.y,z:redPos.z,radius:redSpec.radius,height:redSpec.totalHeight,velocity:redUnit.velocity,collisionKey:'combat.collisionHostileVehicle',vehicle:redSpec.name};
      this.colliders.push(blueUnit.collider,redUnit.collider);
    }
    for(let i=0;i<this.mission.groundTrucks;i++){
      const truck=createGroundVehicle('ural4320','russian'),x=340+rnd()*520,z=500+rnd()*1500,spec=getGroundVehicleSpec('ural4320');
      if(this.terrain.isWater(x,z))continue;
      truck.position.set(x,this.terrain.sampleHeight(x,z),z); truck.rotation.y=(rnd()-.5)*1.2; this.scene.add(truck);
      const convoy={mesh:truck,hp:spec.hp,maxHp:spec.hp,team:'red',cool:0,phase:rnd()*Math.PI*2,armed:false,speed:12+rnd()*3,flank:1,velocity:new THREE.Vector3(),routeOrigin:new THREE.Vector3(x,truck.position.y,z),routeHeading:new THREE.Vector3((rnd()-.5)*.5,0,1).normalize(),routeTravel:0,routeSign:1};
      this.redUnits.push(convoy);
      convoy.collider={type:'vehicle',mesh:truck,x,z,y:truck.position.y,radius:spec.radius,height:spec.totalHeight,velocity:convoy.velocity,collisionKey:'combat.collisionHostileVehicle',vehicle:spec.name};
      this.colliders.push(convoy.collider);
    }
  }
  update(dt){
    for(const list of [this.friends,this.redUnits])for(const unit of list){if(unit.dead)continue;
      unit.phase+=dt*(unit.armed===false?.38:.25);
      let target=null,nearest=1550;
      if(unit.armed!==false){
        const opposing=unit.team==='blue'?this.redUnits:this.friends;
        for(const candidate of opposing){
          if(candidate.dead||candidate.armed===false)continue;
          const d=Math.hypot(candidate.mesh.position.x-unit.mesh.position.x,candidate.mesh.position.z-unit.mesh.position.z);
          if(d<nearest){nearest=d;target=candidate;}
        }
      }

      let travel=new THREE.Vector3(),speed=unit.speed;
      if(target){
        const toTarget=new THREE.Vector3(target.mesh.position.x-unit.mesh.position.x,0,target.mesh.position.z-unit.mesh.position.z).normalize();
        const tangent=new THREE.Vector3(-toTarget.z,0,toTarget.x).multiplyScalar(unit.flank);
        if(nearest>650){travel.copy(toTarget);}
        else if(nearest<235){travel.copy(toTarget).multiplyScalar(-.86).addScaledVector(tangent,.3);speed*=.7;}
        else{
          const rangeBias=THREE.MathUtils.clamp((nearest-415)/250,-.45,.45);
          travel.copy(toTarget).multiplyScalar(.9+rangeBias*.18).addScaledVector(tangent,.34+Math.sin(unit.phase)*.035);
          speed*=.34+Math.sin(unit.phase*1.7)*.04;
        }
        const spec=unit.mesh.userData.vehicleSpec;
        const firingRange=spec?.weapon?.includes('120')||spec?.weapon?.includes('125')?820:700;
        unit.cool-=dt;
        if(nearest<firingRange&&unit.cool<=0){
          this.fireGround(unit,target);
          unit.cool=(spec?.weapon?.includes('120')||spec?.weapon?.includes('125')?3.1:1.9)+Math.random()*.9;
        }
      }else if(unit.armed===false){
        const threat=this.friends.reduce((best,candidate)=>{
          if(candidate.dead)return best;
          const d=candidate.mesh.position.distanceTo(unit.mesh.position);
          return d<best.distance?{unit:candidate,distance:d}:best;
        },{unit:null,distance:Infinity});
        if(threat.unit&&threat.distance<650){
          travel.set(unit.mesh.position.x-threat.unit.mesh.position.x,0,unit.mesh.position.z-threat.unit.mesh.position.z).normalize();
          speed*=1.12;
        }else{
          unit.routeTravel+=unit.speed*dt*unit.routeSign;
          if(Math.abs(unit.routeTravel)>360){unit.routeSign*=-1;unit.routeTravel=THREE.MathUtils.clamp(unit.routeTravel,-360,360);}
          const waypoint=unit.routeOrigin.clone().addScaledVector(unit.routeHeading,unit.routeTravel);
          travel.set(waypoint.x-unit.mesh.position.x,0,waypoint.z-unit.mesh.position.z).normalize();
          travel.x+=Math.sin(unit.phase)*.12;travel.normalize();speed*=.82;
        }
      }else{
        // If the opposing armor is destroyed, the surviving vehicles keep
        // sweeping the sector instead of freezing in place.
        const heading=unit.team==='blue'?1:-1;
        travel.set(heading*.35+Math.sin(unit.phase*.35)*.22,0,1).normalize();
        speed*=.28;
        unit.cool=Math.max(0,unit.cool-dt);
      }

      const healthFactor=THREE.MathUtils.clamp(.58+.42*unit.hp/unit.maxHp,.58,1);
      this.driveGroundUnit(unit,travel,speed*healthFactor,dt);
    }
  }
  driveGroundUnit(unit,desiredDirection,speed,dt){
    const separation=new THREE.Vector3();
    for(const other of this.groundUnits){
      if(other===unit||other.dead)continue;
      const dx=unit.mesh.position.x-other.mesh.position.x,dz=unit.mesh.position.z-other.mesh.position.z;
      const distanceSq=dx*dx+dz*dz;
      if(distanceSq>0&&distanceSq<34*34){const distance=Math.sqrt(distanceSq);separation.x+=(dx/distance)*(34-distance)/34;separation.z+=(dz/distance)*(34-distance)/34;}
    }
    if(separation.lengthSq()>0)desiredDirection.addScaledVector(separation,.85).normalize();
    const direction=this.findDryGroundDirection(unit.mesh.position,desiredDirection);
    if(!direction){unit.velocity.multiplyScalar(Math.exp(-4*dt));return;}
    const wantedYaw=Math.atan2(direction.x,direction.z);
    let yawDelta=THREE.MathUtils.euclideanModulo(wantedYaw-unit.mesh.rotation.y+Math.PI,Math.PI*2)-Math.PI;
    const turnRate=unit.mesh.userData.vehicleSpec?.kind==='tracked' ? .82 : 1.12;
    yawDelta=THREE.MathUtils.clamp(yawDelta,-turnRate*dt,turnRate*dt);
    unit.mesh.rotation.y+=yawDelta;
    const facing=new THREE.Vector3(Math.sin(unit.mesh.rotation.y),0,Math.cos(unit.mesh.rotation.y));
    const movingSpeed=speed*Math.max(.18,facing.dot(direction));
    if(!this.groundPathIsClear(unit.mesh.position,facing,Math.max(24,movingSpeed*2.3))){
      unit.velocity.multiplyScalar(Math.exp(-5*dt));
      return;
    }
    const wantedVelocity=facing.multiplyScalar(movingSpeed);
    unit.velocity.lerp(wantedVelocity,1-Math.exp(-2.4*dt));
    unit.mesh.position.addScaledVector(unit.velocity,dt);
    unit.mesh.position.y=this.terrain.sampleHeight(unit.mesh.position.x,unit.mesh.position.z);
    if(unit.collider){unit.collider.x=unit.mesh.position.x;unit.collider.y=unit.mesh.position.y;unit.collider.z=unit.mesh.position.z;}
  }
  findDryGroundDirection(position,desiredDirection){
    if(desiredDirection.lengthSq()<1e-5)return null;
    const base=Math.atan2(desiredDirection.x,desiredDirection.z);
    const offsets=[0,.38,-.38,.78,-.78,1.22,-1.22,1.58,-1.58,Math.PI];
    let best=null,bestScore=-Infinity;
    for(const offset of offsets){
      const angle=base+offset,direction=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle));
      if(!this.groundPathIsClear(position,direction,82))continue;
      const score=Math.cos(offset)*100-Math.abs(offset)*2;
      if(score>bestScore){bestScore=score;best=direction;}
    }
    return best;
  }
  groundPathIsClear(position,direction,distance){
    const half=this.terrain.worldSize/2-35;
    for(let travelled=14;travelled<=distance;travelled+=14){
      const x=position.x+direction.x*travelled,z=position.z+direction.z*travelled;
      if(Math.abs(x)>half||Math.abs(z)>half||this.terrain.isWater(x,z))return false;
    }
    return true;
  }
  fireGround(unit,target){
    const groundDistance=unit.mesh.position.distanceTo(this.player.position);
    if(groundDistance<2200)this.audio?.playDistantGun(groundDistance,'ground');
    const a=unit.mesh.position.clone().add(new THREE.Vector3(0,5,0));
    const b=target.mesh.position.clone().add(new THREE.Vector3(0,3,0));
    const flightTime=a.distanceTo(b)/280;
    if(target.velocity)b.addScaledVector(target.velocity,flightTime*.72);
    const color=unit.team==='blue'?'#ffd889':'#ff785d';
    this.fx?.addTracer(a,b,color);
    const line=new THREE.Mesh(groundShotGeo,unit.team==='blue'?blueGroundShotMaterial:redGroundShotMaterial);line.position.copy(a);this.scene.add(line);
    const velocity=b.sub(a).normalize().multiplyScalar(280);
    this.addProjectile({projectile:true,ground:true,mesh:line,velocity,life:flightTime,target});
  }

  dispose() {
    for (const unit of this.groundUnits) this.scene.remove(unit.mesh);
    this.friends.length = 0;
    this.redUnits.length = 0;
    this.groundUnits.length = 0;
    this.colliders.length = 0;
  }
}

function nearestDryPoint(terrain, x, z) {
  if (!terrain.isWater(x, z)) return { x, z, y: terrain.sampleHeight(x, z) };
  for (let step = 1; step <= 100; step++) {
    for (let bearing = 0; bearing < 16; bearing++) {
      const angle = bearing * Math.PI / 8;
      const candidateX = x + Math.cos(angle) * step * 25;
      const candidateZ = z + Math.sin(angle) * step * 25;
      if (!terrain.isWater(candidateX, candidateZ)) {
        return { x: candidateX, z: candidateZ, y: terrain.sampleHeight(candidateX, candidateZ) };
      }
    }
  }
  return null;
}
