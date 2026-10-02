import * as THREE from 'three';
import { dryRouteOffsets } from './ground-combat-utils.js';

/** Handles ground-unit steering, route selection, and terrain avoidance. */
export class GroundMovementAI {
  driveGroundUnit(battle, unit,desiredDirection,speed,dt) {
    const separation=unit.separation.set(0,0,0);
    for(const other of battle.groundUnits){
      if(other===unit||other.dead)continue;
      const dx=unit.mesh.position.x-other.mesh.position.x,dz=unit.mesh.position.z-other.mesh.position.z;
      const distanceSq=dx*dx+dz*dz;
      if(distanceSq>0&&distanceSq<34*34){const distance=Math.sqrt(distanceSq);separation.x+=(dx/distance)*(34-distance)/34;separation.z+=(dz/distance)*(34-distance)/34;}
    }
    if(separation.lengthSq()>0)desiredDirection.addScaledVector(separation,.85).normalize();
    const direction=this.findDryGroundDirection(battle, unit.mesh.position,desiredDirection,unit);
    if(!direction){unit.velocity.multiplyScalar(Math.exp(-4*dt));return;}
    const wantedYaw=Math.atan2(direction.x,direction.z);
    let yawDelta=THREE.MathUtils.euclideanModulo(wantedYaw-unit.mesh.rotation.y+Math.PI,Math.PI*2)-Math.PI;
    const turnRate=unit.mesh.userData.vehicleSpec?.kind==='tracked' ? .82 : 1.12;
    yawDelta=THREE.MathUtils.clamp(yawDelta,-turnRate*dt,turnRate*dt);
    unit.mesh.rotation.y+=yawDelta;
    const facing=unit.facing.set(Math.sin(unit.mesh.rotation.y),0,Math.cos(unit.mesh.rotation.y));
    const movingSpeed=speed*Math.max(.18,facing.dot(direction));
    if(!this.groundPathIsClear(battle, unit.mesh.position,facing,Math.max(24,movingSpeed*2.3))){
      unit.velocity.multiplyScalar(Math.exp(-5*dt));
      return;
    }
    const wantedVelocity=facing.multiplyScalar(movingSpeed);
    unit.velocity.lerp(wantedVelocity,1-Math.exp(-2.4*dt));
    unit.mesh.position.addScaledVector(unit.velocity,dt);
    unit.mesh.position.y=battle.terrain.sampleHeight(unit.mesh.position.x,unit.mesh.position.z);
    if(unit.collider){unit.collider.x=unit.mesh.position.x;unit.collider.y=unit.mesh.position.y;unit.collider.z=unit.mesh.position.z;}
  }

  findDryGroundDirection(battle, position,desiredDirection,unit) {
    if(desiredDirection.lengthSq()<1e-5)return null;
    const base=Math.atan2(desiredDirection.x,desiredDirection.z);
    const best=unit.pathDirection;
    let bestScore=-Infinity,hasBest=false;
    for(const offset of dryRouteOffsets){
      const angle=base+offset,direction=unit.tangent.set(Math.sin(angle),0,Math.cos(angle));
      if(!this.groundPathIsClear(battle, position,direction,82))continue;
      const score=Math.cos(offset)*100-Math.abs(offset)*2;
      if(score>bestScore){bestScore=score;best.copy(direction);hasBest=true;}
    }
    return hasBest?best:null;
  }

  groundPathIsClear(battle, position,direction,distance) {
    const half=battle.terrain.worldSize/2-35;
    for(let travelled=14;travelled<=distance;travelled+=14){
      const x=position.x+direction.x*travelled,z=position.z+direction.z*travelled;
      if(Math.abs(x)>half||Math.abs(z)>half
        ||(battle.terrain.isPlayableArea&&!battle.terrain.isPlayableArea(x,z))
        ||battle.terrain.isWater(x,z))return false;
    }
    return true;
  }
}
