import * as THREE from 'three';
import { getGroundWeaponRange } from './ground-combat-utils.js';
import { createSeededRandom, DEFAULT_RANDOM_SEED } from './random.js';

/** Selects ground contacts and coordinates unit movement and engagement updates. */
export class GroundUnitAI {
  constructor(random = createSeededRandom(DEFAULT_RANDOM_SEED)) {
    this.random = random;
  }

  update(battle, dt) {
    for(let listIndex=0;listIndex<2;listIndex++){
      const list=listIndex===0?battle.friends:battle.redUnits;
      for(const unit of list){if(unit.dead)continue;
      unit.aaFiringPause=Math.max(0,(unit.aaFiringPause??0)-dt);
      unit.aaThreatTimer = Math.max(0, (unit.aaThreatTimer ?? 0) - dt);
      if (unit.aaThreatTimer <= 0) unit.aaTarget = null;
      if(unit.team==='red')battle.airDefenseAI.updateHostile(battle, unit, dt);
      else battle.airDefenseAI.updateFriendly(battle, unit, dt);
      unit.phase+=dt*(unit.armed===false?.38:.25);
      let target=null,nearest=2600;
      if(unit.armed!==false && unit.mesh.userData.platform!=='ito90'){
        const opposing=unit.team==='blue'?battle.redUnits:battle.friends;
        for(const candidate of opposing){
          if(candidate.dead||candidate.armed===false)continue;
          const d=Math.hypot(candidate.mesh.position.x-unit.mesh.position.x,candidate.mesh.position.z-unit.mesh.position.z);
          if(d<nearest){nearest=d;target=candidate;}
        }
      }

      const travel=unit.travel.set(0,0,0);let speed=unit.speed;
      if(unit.role==='airDefense'){
        // Dedicated gun and missile batteries hold position and traverse their
        // weapon mounts instead of turning the whole carrier toward contacts.
        speed=0;
      }else if(unit.role==='defender'){
        // Finnish vehicles hold a prepared line and only pivot to engage.
        // This leaves the Russian advance, rather than both sides circling,
        // as the readable motion in the ground battle.
        if(target){
          travel.set(target.mesh.position.x-unit.mesh.position.x,0,target.mesh.position.z-unit.mesh.position.z).normalize();
        }
        speed=0;
      }else if(unit.role==='assault'&&unit.armed!==false){
        const objective=target?.mesh.position??unit.assaultTarget;
        if(objective){
          const toTarget=unit.toTarget.set(objective.x-unit.mesh.position.x,0,objective.z-unit.mesh.position.z);
          const objectiveDistance=toTarget.length();
          if(objectiveDistance>1)travel.copy(toTarget).multiplyScalar(1/objectiveDistance);
          // Russian armor advances toward the defense line, then halts at
          // close range to fight instead of orbiting the defenders.
          if(objectiveDistance<460)speed=0;
          else if(objectiveDistance<1000)speed*=.62;
        }
      }else if(target){
        const toTarget=unit.toTarget.set(target.mesh.position.x-unit.mesh.position.x,0,target.mesh.position.z-unit.mesh.position.z).normalize();
        const tangent=unit.tangent.set(-toTarget.z,0,toTarget.x).multiplyScalar(unit.flank);
        if(nearest>650){travel.copy(toTarget);}
        else if(nearest<235){travel.copy(toTarget).multiplyScalar(-.86).addScaledVector(tangent,.3);speed*=.7;}
        else{
          const rangeBias=THREE.MathUtils.clamp((nearest-415)/250,-.45,.45);
          travel.copy(toTarget).multiplyScalar(.9+rangeBias*.18).addScaledVector(tangent,.34+Math.sin(unit.phase)*.035);
          speed*=.34+Math.sin(unit.phase*1.7)*.04;
        }
      }else if(unit.armed===false){
        let threat=null,threatDistance=Infinity;
        for(const candidate of battle.friends){
          if(candidate===unit||candidate.dead)continue;
          const d=candidate.mesh.position.distanceTo(unit.mesh.position);
          if(d<threatDistance){threat=candidate;threatDistance=d;}
        }
        if(threat&&threatDistance<650){
          travel.set(unit.mesh.position.x-threat.mesh.position.x,0,unit.mesh.position.z-threat.mesh.position.z).normalize();
          speed*=1.12;
        }else{
          if(unit.routeSign!==0){
            unit.routeTravel+=unit.speed*dt*unit.routeSign;
            if(unit.routeLimit&&unit.routeTravel>=unit.routeLimit){unit.routeTravel=unit.routeLimit;unit.routeSign=0;}
            else if(!unit.routeLimit&&Math.abs(unit.routeTravel)>360){unit.routeSign*=-1;unit.routeTravel=THREE.MathUtils.clamp(unit.routeTravel,-360,360);}
          }
          const waypoint=unit.waypoint.copy(unit.routeOrigin).addScaledVector(unit.routeHeading,unit.routeTravel);
          travel.set(waypoint.x-unit.mesh.position.x,0,waypoint.z-unit.mesh.position.z).normalize();
          travel.x+=Math.sin(unit.phase)*(unit.role==='logistics'?.025:.12);travel.normalize();speed*=.82;
        }
      }else{
        // If the opposing armor is destroyed, the surviving vehicles keep
        // sweeping the sector instead of freezing in place.
        const heading=unit.team==='blue'?1:-1;
        travel.set(heading*.35+Math.sin(unit.phase*.35)*.22,0,1).normalize();
        speed*=.28;
        unit.cool=Math.max(0,unit.cool-dt);
      }

      if(target){
        const spec=unit.mesh.userData.vehicleSpec;
        unit.cool-=dt;
        if(nearest<getGroundWeaponRange(spec?.weapon)&&unit.cool<=0){
          battle.weaponAI.fireGround(battle, unit, target);
          const weapon = spec?.weapon ?? '';
          // Realistic reload/burst pauses let the armoured line exchange fire
          // for a while instead of resolving the whole battle in seconds.
          unit.cool = weapon.includes('120') || weapon.includes('125')
            ? 5.1 + this.random() * 1.6
            : weapon.includes('30') || weapon.includes('14,5')
              ? 2.8 + this.random() * 1.25
              : 2.2 + this.random() * .9;
        }
      }else{
        unit.cool=Math.max(0,unit.cool-dt);
      }

      // Assault vehicles keep advancing through most AA bursts, but some
      // pause briefly to steady their roof-mounted weapons and make their
      // firing posture readable to the player.
      if(unit.team==='red'&&unit.role==='assault'&&unit.aaFiringPause>0)speed=0;

      const healthFactor=THREE.MathUtils.clamp(.58+.42*unit.hp/unit.maxHp,.58,1);
      battle.movementAI.driveGroundUnit(battle, unit, travel, speed * healthFactor, dt);
      }
    }
  }
}
