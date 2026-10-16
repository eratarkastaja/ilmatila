import * as THREE from 'three';
import { createGroundVehicle, getGroundVehicleSpec } from '../ground/vehicles.js';
import { distanceToTheaterEdge, nearestDryPoint, safeRouteAlignedSquareSpan } from './ground-combat-utils.js';

const FORMATIONS = ['line', 'staggered', 'wedge', 'echelon'];

function shuffled(values, rnd) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function formationDepthProfile(formation, normalizedLane, slot, count) {
  if (formation === 'staggered') return slot % 2 === 0 ? -1 : 1;
  if (formation === 'wedge') return Math.abs(normalizedLane) * 1.35 - .45;
  if (formation === 'echelon') return normalizedLane * 1.2;
  return count > 1 ? normalizedLane * .12 : 0;
}

/** Places combat units, air defenses, and logistics vehicles in the theater. */
export class GroundSpawnSystem {
  spawn(battle) {
    // Keep the orthophoto unobstructed and place units only on mapped dry ground.
    if(!battle.mission.groundBattle)return;
    // Keep formation/layout randomness independent from combat timing and AI rolls.
    const rnd = battle.spawnRandom ?? battle.random;
    const finnishTypes=['leopard2','cv9030','pasi'];
    const russianTypes=['t72','bmp2','btr80'];
    const theaterHalf = (battle.terrain?.worldSize ?? 32000) * .5;
    const requestedFrontSpan = battle.mission.groundFrontSpan || 9800;
    const initialFrontRoom = safeRouteAlignedSquareSpan(
      battle.battleCenter, battle.routeRight, battle.routeForward, theaterHalf, 900,
    );
    const frontOffsetLimit = Math.min(3200, initialFrontRoom * .18);
    const lateralOffset = (rnd() - .5) * frontOffsetLimit;
    const approachRoomFromCenter = distanceToTheaterEdge(
      battle.battleCenter, battle.routeForward.clone().negate(), theaterHalf - 300,
    );
    const defenseRoomFromCenter = distanceToTheaterEdge(
      battle.battleCenter, battle.routeForward, theaterHalf - 300,
    );
    const depthRoomFromCenter = Math.min(approachRoomFromCenter, defenseRoomFromCenter);
    const depthOffsetLimit = Number.isFinite(depthRoomFromCenter)
      ? Math.min(1000, depthRoomFromCenter * .12)
      : 1000;
    const depthOffset = (rnd() - .5) * depthOffsetLimit;
    const layoutCenter = battle.battleCenter.clone()
      .addScaledVector(battle.routeRight, lateralOffset)
      .addScaledVector(battle.routeForward, depthOffset);
    const frontRoom = safeRouteAlignedSquareSpan(
      layoutCenter, battle.routeRight, battle.routeForward, theaterHalf, 900,
    );
    // CAS uses a broad frontage, while other missions keep a tighter, legible
    // engagement. The usable terrain footprint remains the final authority.
    const supportMission = battle.mission.id === 'support';
    const missionFrontage = supportMission ? 28000 : 12000;
    const frontSpan = Math.min(requestedFrontSpan * (.82 + rnd() * .18), missionFrontage, frontRoom);
    const heading = Math.atan2(battle.routeForward.x,battle.routeForward.z);
    const approachRoom = distanceToTheaterEdge(layoutCenter,battle.routeForward.clone().negate(),theaterHalf-300);
    const defenseRoom = distanceToTheaterEdge(layoutCenter,battle.routeForward,theaterHalf-300);
    const approachDepthRoom = Math.max(0, approachRoom - 500);
    const defenseDepthRoom = Math.max(0, defenseRoom - 500);
    const russianSideRoom = supportMission ? defenseDepthRoom : approachDepthRoom;
    const finnishSideRoom = supportMission ? approachDepthRoom : defenseDepthRoom;
    const russianDepth = Math.min(3200, russianSideRoom);
    const finnishDepth = Math.min(900, finnishSideRoom);
    const russianStagger = Math.min(460, Math.max(0, (russianSideRoom - russianDepth) / 2)) * (.75 + rnd() * .5);
    const finnishStagger = Math.min(130, Math.max(0, (finnishSideRoom - finnishDepth) / 2)) * (.75 + rnd() * .5);
    const formation = FORMATIONS[Math.floor(rnd() * FORMATIONS.length)];
    const pairCount = Math.max(0, battle.mission.groundPairs ?? 0);
    const pairLaneOrder = shuffled(Array.from({ length: pairCount }, (_, index) => index), rnd);
    const finnishTypeOrder = shuffled([...finnishTypes], rnd);
    const russianTypeOrder = shuffled([...russianTypes], rnd);
    const friendlyHealthScale = battle.mission.campaignFriendlyGroundHealthScale ?? 1;
    for(let i=0;i<pairCount;i++){
      const slot = pairLaneOrder[i];
      const lane = pairCount > 1 ? slot / (pairCount - 1) - .5 : 0;
      const laneJitter = (rnd() - .5) * Math.min(900, Math.max(240, frontSpan / Math.max(pairCount, 1) * .45));
      const alongFront = lane * frontSpan + laneJitter;
      const blueDirection = supportMission ? -1 : 1;
      const redDirection = -blueDirection;
      const profile = formationDepthProfile(formation, lane, slot, pairCount);
      const blueDepth = blueDirection * finnishDepth + profile * finnishStagger;
      const redDepth = redDirection * (russianDepth + profile * russianStagger);
      const blueType=finnishTypeOrder[slot%finnishTypeOrder.length],redType=russianTypeOrder[slot%russianTypeOrder.length];
      const blue= createGroundVehicle(blueType,'finnish'), red=createGroundVehicle(redType,'russian');
      const blueSpec=getGroundVehicleSpec(blueType),redSpec=getGroundVehicleSpec(redType);
      const bluePos=nearestDryPoint(
        battle.terrain,
        layoutCenter.x+battle.routeRight.x*alongFront+battle.routeForward.x*blueDepth,
        layoutCenter.z+battle.routeRight.z*alongFront+battle.routeForward.z*blueDepth,
      );
      const redAlongFront = alongFront + (rnd() - .5) * Math.min(1400, Math.max(760, frontSpan * .06));
      const redPos=nearestDryPoint(
        battle.terrain,
        layoutCenter.x+battle.routeRight.x*redAlongFront+battle.routeForward.x*redDepth,
        layoutCenter.z+battle.routeRight.z*redAlongFront+battle.routeForward.z*redDepth,
      );
      if(!bluePos||!redPos)continue;
      blue.position.set(bluePos.x,bluePos.y,bluePos.z); blue.rotation.y=heading+(supportMission?0:Math.PI);
      red.position.set(redPos.x,redPos.y,redPos.z); red.rotation.y=heading+(supportMission?Math.PI:0);
      battle.scene.add(blue,red);
      const blueUnit={mesh:blue,hp:blueSpec.hp*friendlyHealthScale,maxHp:blueSpec.hp*friendlyHealthScale,team:'blue',role:'defender',cool:1+i*.33,phase:i*.8,armed:true,airAaCooldown:2+rnd()*5,airAaBurstClock:0,airAaBurstRemaining:0,speed:blueSpec.kind==='tracked'?10.5+rnd()*2:14+rnd()*2.5,flank:i%2===0?1:-1,velocity:new THREE.Vector3(),travel:new THREE.Vector3(),toTarget:new THREE.Vector3(),tangent:new THREE.Vector3(),waypoint:new THREE.Vector3(),separation:new THREE.Vector3(),facing:new THREE.Vector3(),pathDirection:new THREE.Vector3()};
      const redUnit={mesh:red,hp:redSpec.hp,maxHp:redSpec.hp,team:'red',role:'assault',missionTargetRoleKey:'combat.groundTargetRole.armor',cool:2+i*.25,phase:i*.8+1,armed:true,speed:redSpec.kind==='tracked'?10+rnd()*2:13.5+rnd()*2.5,flank:i%2===0?-1:1,velocity:new THREE.Vector3(),aaCooldown:(battle.difficulty?.groundAA?.initialDelay ?? 2)+rnd()*(battle.difficulty?.groundAA?.initialJitter ?? 5),aaBurstClock:0,aaBurstRemaining:0,aaTrackTimer:null,aaPlayerTracking:false,aaTarget:null,aaThreatTimer:0,aaFiringPause:0,assaultTarget:blue.position,travel:new THREE.Vector3(),toTarget:new THREE.Vector3(),tangent:new THREE.Vector3(),waypoint:new THREE.Vector3(),separation:new THREE.Vector3(),facing:new THREE.Vector3(),pathDirection:new THREE.Vector3()};
      battle.friends.push(blueUnit);battle.redUnits.push(redUnit);
      blueUnit.collider={type:'vehicle',mesh:blue,x:bluePos.x,y:bluePos.y,z:bluePos.z,radius:blueSpec.radius,height:blueSpec.totalHeight,velocity:blueUnit.velocity,collisionKey:'combat.collisionFriendlyVehicle',vehicle:blueSpec.name};
      redUnit.collider={type:'vehicle',mesh:red,x:redPos.x,y:redPos.y,z:redPos.z,radius:redSpec.radius,height:redSpec.totalHeight,velocity:redUnit.velocity,collisionKey:'combat.collisionHostileVehicle',vehicle:redSpec.name};
      battle.colliders.push(blueUnit.collider,redUnit.collider);
    }
    const convoyOffset=Math.min(2200,Math.max(0,russianSideRoom-russianDepth-700));
    const convoyCenter=layoutCenter.clone()
      .addScaledVector(battle.routeRight, (rnd() - .5) * Math.min(frontSpan * .2, 2600))
      .addScaledVector(
      battle.routeForward,
      (supportMission ? 1 : -1) * (russianDepth + convoyOffset) + (rnd() - .5) * 700,
    );
    const convoySpan=Math.min(
      battle.mission.convoyArea || 8200,
      Math.max(1800,frontSpan*.8),
      safeRouteAlignedSquareSpan(convoyCenter,battle.routeForward,battle.routeRight,theaterHalf),
    );
    let reinforcementSourceSpawned = false;
    for(let i=0;i<battle.mission.groundTrucks;i++){
      const truck=createGroundVehicle('ural4320','russian');
      const reinforcementSource = supportMission && !reinforcementSourceSpawned;
      const lateral=reinforcementSource?0:(rnd()-.5)*convoySpan;
      const depth=(rnd()-.5)*360;
      const x=convoyCenter.x+battle.routeRight.x*lateral+battle.routeForward.x*depth;
      const z=convoyCenter.z+battle.routeRight.z*lateral+battle.routeForward.z*depth;
      const spec=getGroundVehicleSpec('ural4320');
      const dryPoint=nearestDryPoint(battle.terrain,x,z);
      if(!dryPoint)continue;
      reinforcementSourceSpawned ||= reinforcementSource;
      truck.position.set(dryPoint.x,dryPoint.y,dryPoint.z); truck.rotation.y=heading+(supportMission?Math.PI:0); battle.scene.add(truck);
      const convoy={mesh:truck,hp:spec.hp,maxHp:spec.hp,team:'red',role:'logistics',reinforcementSource,missionTargetRoleKey:reinforcementSource?'combat.groundTargetRole.logistics':null,cool:0,phase:rnd()*Math.PI*2,armed:false,speed:12+rnd()*3,flank:1,velocity:new THREE.Vector3(),routeOrigin:truck.position.clone(),routeHeading:battle.routeForward.clone(),routeTravel:0,routeLimit:1800,routeSign:1,travel:new THREE.Vector3(),toTarget:new THREE.Vector3(),tangent:new THREE.Vector3(),waypoint:new THREE.Vector3(),separation:new THREE.Vector3(),facing:new THREE.Vector3(),pathDirection:new THREE.Vector3()};
      battle.redUnits.push(convoy);
      convoy.collider={type:'vehicle',mesh:truck,x:truck.position.x,z:truck.position.z,y:truck.position.y,radius:spec.radius,height:spec.totalHeight,velocity:convoy.velocity,collisionKey:'combat.collisionHostileVehicle',vehicle:spec.name};
      battle.colliders.push(convoy.collider);
    }

    // Finnish Masi (Sisu SA-150) 4x4 supply trucks operate behind the defence
    // line. They are scenery/logistics, not objective targets or combatants.
    const friendlyTruckCount = battle.mission.groundFriendlyTrucks ?? 0;
    const supplyCenter = layoutCenter.clone().addScaledVector(
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

    const airDefenseFlank = rnd() < .5 ? -1 : 1;
    const airDefenseDepthPattern = FORMATIONS[Math.floor(rnd() * FORMATIONS.length)];
    const addAirDefenseVehicle = (platform, team, index, count, depth, flankSign, role = 'airDefense') => {
      const spec = getGroundVehicleSpec(platform);
      const normalizedLane = count > 1 ? index / (count - 1) - .5 : 0;
      const lane = normalizedLane * Math.min(1500, frontSpan * (.14 + rnd() * .08)) * flankSign;
      const depthProfile = formationDepthProfile(airDefenseDepthPattern, normalizedLane, index, count);
      const variedDepth = depth + depthProfile * Math.min(420, Math.max(120, Math.abs(depth) * .12));
      const position = nearestDryPoint(
        battle.terrain,
        layoutCenter.x + battle.routeRight.x * lane + battle.routeForward.x * variedDepth,
        layoutCenter.z + battle.routeRight.z * lane + battle.routeForward.z * variedDepth,
      );
      if (!position) return;
      const mesh = createGroundVehicle(platform, team === 'blue' ? 'finnish' : 'russian');
      mesh.position.set(position.x, position.y, position.z);
      mesh.rotation.y = heading + ((team === 'blue') !== supportMission ? Math.PI : 0);
      battle.scene.add(mesh);
      const unit = {
        mesh, hp: spec.hp, maxHp: spec.hp, team,
        platform,
        role,
        missionTargetRoleKey: team === 'red' && role === 'airDefense' ? 'combat.groundTargetRole.airDefense' : null,
        cool: 0, phase: rnd() * Math.PI * 2, armed: true, speed: 0,
        flank: team === 'blue' ? 1 : -1,
        velocity: new THREE.Vector3(), travel: new THREE.Vector3(),
        toTarget: new THREE.Vector3(), tangent: new THREE.Vector3(),
        waypoint: new THREE.Vector3(), separation: new THREE.Vector3(),
        facing: new THREE.Vector3(), pathDirection: new THREE.Vector3(),
        airAaCooldown: 5 + index * 4 + rnd() * 4,
        airAaBurstClock: 0, airAaBurstRemaining: 0, airAaTarget: null,
        aaCooldown: (battle.difficulty?.groundAA?.initialDelay ?? 2) + rnd() * (battle.difficulty?.groundAA?.initialJitter ?? 5),
        aaBurstClock: 0, aaBurstRemaining: 0, aaTrackTimer: null, aaPlayerTracking: false,
        samRail: index % 4, samAmmo: 4,
        manualSupport: Boolean(battle.mission.groundMlrsManual && role === 'artillery'),
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
      addAirDefenseVehicle('ito90', 'blue', i, battle.mission.groundIto90Count, depth, airDefenseFlank);
    }
    for (let i = 0; i < (battle.mission.groundSergeiCount ?? 0); i++) {
      const depth = supportMission ? -finnishDepth - 980 : finnishDepth + 980;
      addAirDefenseVehicle('sergei23', 'blue', i, battle.mission.groundSergeiCount, depth, airDefenseFlank);
    }
    for (let i = 0; i < (battle.mission.groundMlrsCount ?? 0); i++) {
      const depth = supportMission ? -finnishDepth - 1380 : finnishDepth + 1380;
      addAirDefenseVehicle('rsrakh06', 'blue', i, battle.mission.groundMlrsCount, depth, airDefenseFlank, 'artillery');
    }
    for (let i = 0; i < (battle.mission.groundShilkaCount ?? 0); i++) {
      const depth = supportMission ? russianDepth + 760 : -russianDepth - 760;
      addAirDefenseVehicle('zsu23-4', 'red', i, battle.mission.groundShilkaCount, depth, -airDefenseFlank);
    }
  }
}
