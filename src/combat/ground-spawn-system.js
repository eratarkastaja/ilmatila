import * as THREE from 'three';
import { createGroundVehicle, getGroundVehicleSpec } from '../ground/vehicles.js';
import { distanceToTheaterEdge, nearestDryPoint, safeRouteAlignedSquareSpan } from './ground-combat-utils.js';

/** Places combat units, air defenses, and logistics vehicles in the theater. */
export class GroundSpawnSystem {
  spawn(battle) {
    // Keep the orthophoto unobstructed and place units only on mapped dry ground.
    if(!battle.mission.groundBattle)return;
    const rnd = battle.random;
    const finnishTypes=['leopard2','cv9030','pasi'];
    const russianTypes=['t72','bmp2','btr80'];
    const theaterHalf = (battle.terrain?.worldSize ?? 32000) * .5;
    const requestedFrontSpan = battle.mission.groundFrontSpan || 9800;
    const frontRoom = safeRouteAlignedSquareSpan(
      battle.battleCenter, battle.routeRight, battle.routeForward, theaterHalf, 900,
    );
    // CAS uses a broad frontage, while other missions keep a tighter, legible
    // engagement. The usable terrain footprint remains the final authority.
    const supportMission = battle.mission.id === 'support';
    const missionFrontage = supportMission ? 28000 : 12000;
    const frontSpan = Math.min(requestedFrontSpan, missionFrontage, frontRoom);
    const heading = Math.atan2(battle.routeForward.x,battle.routeForward.z);
    const approachRoom = distanceToTheaterEdge(battle.battleCenter,battle.routeForward.clone().negate(),theaterHalf-300);
    const defenseRoom = distanceToTheaterEdge(battle.battleCenter,battle.routeForward,theaterHalf-300);
    const approachDepthRoom = Math.max(0, approachRoom - 500);
    const defenseDepthRoom = Math.max(0, defenseRoom - 500);
    const russianSideRoom = supportMission ? defenseDepthRoom : approachDepthRoom;
    const finnishSideRoom = supportMission ? approachDepthRoom : defenseDepthRoom;
    const russianDepth = Math.min(3200, russianSideRoom);
    const finnishDepth = Math.min(900, finnishSideRoom);
    const russianStagger = Math.min(460, Math.max(0, (russianSideRoom - russianDepth) / 2));
    const finnishStagger = Math.min(130, Math.max(0, (finnishSideRoom - finnishDepth) / 2));
    for(let i=0;i<battle.mission.groundPairs;i++){
      const lane = battle.mission.groundPairs > 1 ? i / (battle.mission.groundPairs - 1) - .5 : 0;
      const alongFront = lane * frontSpan + (rnd() - .5) * 240;
      const blueDirection = supportMission ? -1 : 1;
      const redDirection = -blueDirection;
      const blueDepth = blueDirection * finnishDepth + ((i % 3) - 1) * finnishStagger;
      const redDepth = redDirection * (russianDepth + (i % 3) * russianStagger);
      const blueType=finnishTypes[i%finnishTypes.length],redType=russianTypes[i%russianTypes.length];
      const blue= createGroundVehicle(blueType,'finnish'), red=createGroundVehicle(redType,'russian');
      const blueSpec=getGroundVehicleSpec(blueType),redSpec=getGroundVehicleSpec(redType);
      const bluePos=nearestDryPoint(
        battle.terrain,
        battle.battleCenter.x+battle.routeRight.x*alongFront+battle.routeForward.x*blueDepth,
        battle.battleCenter.z+battle.routeRight.z*alongFront+battle.routeForward.z*blueDepth,
      );
      const redAlongFront = alongFront + (rnd() - .5) * 760;
      const redPos=nearestDryPoint(
        battle.terrain,
        battle.battleCenter.x+battle.routeRight.x*redAlongFront+battle.routeForward.x*redDepth,
        battle.battleCenter.z+battle.routeRight.z*redAlongFront+battle.routeForward.z*redDepth,
      );
      if(!bluePos||!redPos)continue;
      blue.position.set(bluePos.x,bluePos.y,bluePos.z); blue.rotation.y=heading+(supportMission?0:Math.PI);
      red.position.set(redPos.x,redPos.y,redPos.z); red.rotation.y=heading+(supportMission?Math.PI:0);
      battle.scene.add(blue,red);
      const blueUnit={mesh:blue,hp:blueSpec.hp,maxHp:blueSpec.hp,team:'blue',role:'defender',cool:1+i*.33,phase:i*.8,armed:true,airAaCooldown:2+rnd()*5,airAaBurstClock:0,airAaBurstRemaining:0,speed:blueSpec.kind==='tracked'?10.5+rnd()*2:14+rnd()*2.5,flank:i%2===0?1:-1,velocity:new THREE.Vector3(),travel:new THREE.Vector3(),toTarget:new THREE.Vector3(),tangent:new THREE.Vector3(),waypoint:new THREE.Vector3(),separation:new THREE.Vector3(),facing:new THREE.Vector3(),pathDirection:new THREE.Vector3()};
      const redUnit={mesh:red,hp:redSpec.hp,maxHp:redSpec.hp,team:'red',role:'assault',cool:2+i*.25,phase:i*.8+1,armed:true,speed:redSpec.kind==='tracked'?10+rnd()*2:13.5+rnd()*2.5,flank:i%2===0?-1:1,velocity:new THREE.Vector3(),aaCooldown:(battle.difficulty?.groundAA?.initialDelay ?? 2)+rnd()*(battle.difficulty?.groundAA?.initialJitter ?? 5),aaBurstClock:0,aaBurstRemaining:0,aaTarget:null,aaThreatTimer:0,aaFiringPause:0,assaultTarget:blue.position,travel:new THREE.Vector3(),toTarget:new THREE.Vector3(),tangent:new THREE.Vector3(),waypoint:new THREE.Vector3(),separation:new THREE.Vector3(),facing:new THREE.Vector3(),pathDirection:new THREE.Vector3()};
      battle.friends.push(blueUnit);battle.redUnits.push(redUnit);
      blueUnit.collider={type:'vehicle',mesh:blue,x:bluePos.x,y:bluePos.y,z:bluePos.z,radius:blueSpec.radius,height:blueSpec.totalHeight,velocity:blueUnit.velocity,collisionKey:'combat.collisionFriendlyVehicle',vehicle:blueSpec.name};
      redUnit.collider={type:'vehicle',mesh:red,x:redPos.x,y:redPos.y,z:redPos.z,radius:redSpec.radius,height:redSpec.totalHeight,velocity:redUnit.velocity,collisionKey:'combat.collisionHostileVehicle',vehicle:redSpec.name};
      battle.colliders.push(blueUnit.collider,redUnit.collider);
    }
    const convoyOffset=Math.min(2200,Math.max(0,russianSideRoom-russianDepth-700));
    const convoyCenter=battle.battleCenter.clone().addScaledVector(
      battle.routeForward,
      (supportMission ? 1 : -1) * (russianDepth + convoyOffset),
    );
    const convoySpan=Math.min(
      battle.mission.convoyArea || 8200,
      Math.max(1800,frontSpan*.8),
      safeRouteAlignedSquareSpan(convoyCenter,battle.routeForward,battle.routeRight,theaterHalf),
    );
    for(let i=0;i<battle.mission.groundTrucks;i++){
      const truck=createGroundVehicle('ural4320','russian');
      const lateral=(rnd()-.5)*convoySpan;
      const depth=(rnd()-.5)*360;
      const x=convoyCenter.x+battle.routeRight.x*lateral+battle.routeForward.x*depth;
      const z=convoyCenter.z+battle.routeRight.z*lateral+battle.routeForward.z*depth;
      const spec=getGroundVehicleSpec('ural4320');
      const dryPoint=nearestDryPoint(battle.terrain,x,z);
      if(!dryPoint)continue;
      truck.position.set(dryPoint.x,dryPoint.y,dryPoint.z); truck.rotation.y=heading+(supportMission?Math.PI:0); battle.scene.add(truck);
      const convoy={mesh:truck,hp:spec.hp,maxHp:spec.hp,team:'red',role:'logistics',cool:0,phase:rnd()*Math.PI*2,armed:false,speed:12+rnd()*3,flank:1,velocity:new THREE.Vector3(),routeOrigin:truck.position.clone(),routeHeading:battle.routeForward.clone(),routeTravel:0,routeLimit:1800,routeSign:1,travel:new THREE.Vector3(),toTarget:new THREE.Vector3(),tangent:new THREE.Vector3(),waypoint:new THREE.Vector3(),separation:new THREE.Vector3(),facing:new THREE.Vector3(),pathDirection:new THREE.Vector3()};
      battle.redUnits.push(convoy);
      convoy.collider={type:'vehicle',mesh:truck,x:truck.position.x,z:truck.position.z,y:truck.position.y,radius:spec.radius,height:spec.totalHeight,velocity:convoy.velocity,collisionKey:'combat.collisionHostileVehicle',vehicle:spec.name};
      battle.colliders.push(convoy.collider);
    }

    // Finnish Masi (Sisu SA-150) 4x4 supply trucks operate behind the defence
    // line. They are scenery/logistics, not objective targets or combatants.
    const friendlyTruckCount = battle.mission.groundFriendlyTrucks ?? 0;
    const supplyCenter = battle.battleCenter.clone().addScaledVector(
      battle.routeForward,
      (supportMission ? -1 : 1) * (finnishDepth + 1050),
    );
    const supplySpan = Math.min(frontSpan * .78, safeRouteAlignedSquareSpan(
      supplyCenter, battle.routeForward, battle.routeRight, theaterHalf, 900,
    ));
    for (let i = 0; i < friendlyTruckCount; i++) {
      const truck = createGroundVehicle('sisuSa150', 'finnish');
      const lane = friendlyTruckCount > 1 ? i / (friendlyTruckCount - 1) - .5 : 0;
      const lateral = lane * supplySpan + (rnd() - .5) * 340;
      const depth = (rnd() - .5) * 520;
      const dryPoint = nearestDryPoint(
        battle.terrain,
        supplyCenter.x + battle.routeRight.x * lateral + battle.routeForward.x * depth,
        supplyCenter.z + battle.routeRight.z * lateral + battle.routeForward.z * depth,
      );
      if (!dryPoint) continue;
      const spec = getGroundVehicleSpec('sisuSa150');
      truck.position.set(dryPoint.x, dryPoint.y, dryPoint.z);
      truck.rotation.y = heading + (supportMission ? 0 : Math.PI);
      battle.scene.add(truck);
      const supply = {
        mesh: truck, hp: spec.hp, maxHp: spec.hp, team: 'blue', role: 'logistics',
        cool: 0, phase: rnd() * Math.PI * 2, armed: false, speed: 8 + rnd() * 3,
        flank: 1, velocity: new THREE.Vector3(), routeOrigin: truck.position.clone(),
        routeHeading: battle.routeForward.clone(), routeTravel: rnd() * 1200 - 600,
        routeLimit: 0, routeSign: rnd() < .5 ? -1 : 1, travel: new THREE.Vector3(),
        toTarget: new THREE.Vector3(), tangent: new THREE.Vector3(), waypoint: new THREE.Vector3(),
        separation: new THREE.Vector3(), facing: new THREE.Vector3(), pathDirection: new THREE.Vector3(),
      };
      battle.friends.push(supply);
      supply.collider = {
        type: 'vehicle', mesh: truck, x: dryPoint.x, y: dryPoint.y, z: dryPoint.z,
        radius: spec.radius, height: spec.totalHeight, velocity: supply.velocity,
        collisionKey: 'combat.collisionFriendlyVehicle', vehicle: spec.name,
      };
      battle.colliders.push(supply.collider);
    }

    const addAirDefenseVehicle = (platform, team, index, count, depth, flankSign) => {
      const spec = getGroundVehicleSpec(platform);
      const lane = (index - (count - 1) * 0.5) * Math.min(1500, frontSpan * 0.18) * flankSign;
      const position = nearestDryPoint(
        battle.terrain,
        battle.battleCenter.x + battle.routeRight.x * lane + battle.routeForward.x * depth,
        battle.battleCenter.z + battle.routeRight.z * lane + battle.routeForward.z * depth,
      );
      if (!position) return;
      const mesh = createGroundVehicle(platform, team === 'blue' ? 'finnish' : 'russian');
      mesh.position.set(position.x, position.y, position.z);
      mesh.rotation.y = heading + ((team === 'blue') !== supportMission ? Math.PI : 0);
      battle.scene.add(mesh);
      const unit = {
        mesh, hp: spec.hp, maxHp: spec.hp, team,
        role: 'airDefense',
        cool: 0, phase: rnd() * Math.PI * 2, armed: true, speed: 0,
        flank: team === 'blue' ? 1 : -1,
        velocity: new THREE.Vector3(), travel: new THREE.Vector3(),
        toTarget: new THREE.Vector3(), tangent: new THREE.Vector3(),
        waypoint: new THREE.Vector3(), separation: new THREE.Vector3(),
        facing: new THREE.Vector3(), pathDirection: new THREE.Vector3(),
        airAaCooldown: 5 + index * 4 + rnd() * 4,
        airAaBurstClock: 0, airAaBurstRemaining: 0, airAaTarget: null,
        aaCooldown: (battle.difficulty?.groundAA?.initialDelay ?? 2) + rnd() * (battle.difficulty?.groundAA?.initialJitter ?? 5),
        aaBurstClock: 0, aaBurstRemaining: 0,
        samRail: index % 4, samAmmo: 4,
      };
      unit.collider = {
        type: 'vehicle', mesh, x: position.x, y: position.y, z: position.z,
        radius: spec.radius, height: spec.totalHeight, velocity: unit.velocity,
        collisionKey: team === 'blue' ? 'combat.collisionFriendlyVehicle' : 'combat.collisionHostileVehicle',
        vehicle: spec.name,
      };
      (team === 'blue' ? battle.friends : battle.redUnits).push(unit);
      battle.colliders.push(unit.collider);
    };
    for (let i = 0; i < (battle.mission.groundIto90Count ?? 0); i++) {
      const depth = supportMission ? -finnishDepth - 720 : finnishDepth + 720;
      addAirDefenseVehicle('ito90', 'blue', i, battle.mission.groundIto90Count, depth, 1);
    }
    for (let i = 0; i < (battle.mission.groundShilkaCount ?? 0); i++) {
      const depth = supportMission ? russianDepth + 760 : -russianDepth - 760;
      addAirDefenseVehicle('zsu23-4', 'red', i, battle.mission.groundShilkaCount, depth, -1);
    }
  }
}
