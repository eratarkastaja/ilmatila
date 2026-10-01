import * as THREE from 'three';
import { createGroundVehicle, getGroundVehicleSpec, disposeGroundVehicleVisual } from '../ground/vehicles.js';
import { createMissile } from './projectiles.js';

const groundShotGeo = new THREE.SphereGeometry(.75, 5, 4);
const antiAirShotGeo = new THREE.CylinderGeometry(.075, .055, 1.35, 6, 1);
const blueGroundShotMaterial = new THREE.MeshBasicMaterial({ color: '#ffd889' });
const redGroundShotMaterial = new THREE.MeshBasicMaterial({ color: '#ff785d' });
const antiAirShotMaterial = new THREE.MeshBasicMaterial({ color: '#ffc47a', toneMapped: false });
const antiAirMuzzleGlow = new THREE.Color('#ffd69d');
const shilkaMuzzleGlow = new THREE.Color('#fff0ca');
const muzzleFlashVelocity = new THREE.Vector3(0, 0.35, 0);
const antiAirRoundAxis = new THREE.Vector3(0, 1, 0);
const missileForward = new THREE.Vector3(0, 0, 1);
const dryRouteOffsets=[0,.38,-.38,.78,-.78,1.22,-1.22,1.58,-1.58,Math.PI];

function distanceToTheaterEdge(position,direction,halfExtent){
  let distance=Infinity;
  if(direction.x>1e-5)distance=Math.min(distance,(halfExtent-position.x)/direction.x);
  else if(direction.x< -1e-5)distance=Math.min(distance,(-halfExtent-position.x)/direction.x);
  if(direction.z>1e-5)distance=Math.min(distance,(halfExtent-position.z)/direction.z);
  else if(direction.z< -1e-5)distance=Math.min(distance,(-halfExtent-position.z)/direction.z);
  return Math.max(0,distance);
}

function safeRouteAlignedSquareSpan(center,forward,right,halfExtent,margin=300){
  const xProjection=Math.abs(forward.x)+Math.abs(right.x);
  const zProjection=Math.abs(forward.z)+Math.abs(right.z);
  const xRoom=(halfExtent-margin-Math.abs(center.x))/Math.max(xProjection,1e-5);
  const zRoom=(halfExtent-margin-Math.abs(center.z))/Math.max(zProjection,1e-5);
  return Math.max(0,Math.min(xRoom,zRoom)*2);
}

/** Owns ground-unit placement, movement, engagement and fire control. */
export class GroundBattle {
  constructor({ scene, player, playerVelocity, terrain, mission, audio, fx, difficulty = {}, enemies = [], addProjectile, addFriendlyProjectile }) {
    this.scene = scene;
    this.player = player;
    this.playerVelocity = playerVelocity;
    this.terrain = terrain;
    this.mission = mission;
    this.audio = audio;
    this.fx = fx;
    this.difficulty = difficulty;
    this.enemies = enemies;
    this.addProjectile = addProjectile;
    this.addFriendlyProjectile = addFriendlyProjectile;
    this.aaAim = new THREE.Vector3();
    this.aaStart = new THREE.Vector3();
    this.aaLeadPoint = new THREE.Vector3();
    this.friends = [];
    this.redUnits = [];
    this.colliders = [];
    this.airDefenseActive = false;
    this.routeForward = new THREE.Vector3(0,0,1).applyQuaternion(player.quaternion);
    this.routeForward.y = 0;
    if(this.routeForward.lengthSq()<1e-6)this.routeForward.set(0,0,1);
    else this.routeForward.normalize();
    this.routeRight = new THREE.Vector3(1,0,0).applyQuaternion(player.quaternion);
    this.routeRight.y = 0;
    if(this.routeRight.lengthSq()<1e-6)this.routeRight.set(1,0,0);
    else this.routeRight.normalize();
    const theaterHalf = (this.terrain?.worldSize ?? 32000) * .5;
    const ingressDistance = Math.min(
      mission.navigationDistance ?? 4200,
      Math.max(900, theaterHalf * .55),
    );
    this.battleCenter = player.position.clone().addScaledVector(this.routeForward,ingressDistance);
    this.spawn();
    this.groundUnits = [...this.friends, ...this.redUnits];
  }

  setAirDefenseActive(active=true){
    this.airDefenseActive=Boolean(active);
  }

  spawn(){
    // Keep the orthophoto unobstructed and place units only on mapped dry ground.
    if(!this.mission.groundBattle)return;
    let seed=54321; const rnd=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
    const finnishTypes=['leopard2','cv9030','pasi'];
    const russianTypes=['t72','bmp2','btr80'];
    const theaterHalf = (this.terrain?.worldSize ?? 32000) * .5;
    const requestedFrontSpan = this.mission.groundFrontSpan || 9800;
    const frontRoom = safeRouteAlignedSquareSpan(
      this.battleCenter, this.routeRight, this.routeForward, theaterHalf, 900,
    );
    // CAS uses a broad frontage, while other missions keep a tighter, legible
    // engagement. The usable terrain footprint remains the final authority.
    const supportMission = this.mission.id === 'support';
    const missionFrontage = supportMission ? 26000 : 10500;
    const frontSpan = Math.min(requestedFrontSpan, missionFrontage, frontRoom);
    const heading = Math.atan2(this.routeForward.x,this.routeForward.z);
    const approachRoom = distanceToTheaterEdge(this.battleCenter,this.routeForward.clone().negate(),theaterHalf-300);
    const defenseRoom = distanceToTheaterEdge(this.battleCenter,this.routeForward,theaterHalf-300);
    const approachDepthRoom = Math.max(0, approachRoom - 500);
    const defenseDepthRoom = Math.max(0, defenseRoom - 500);
    const russianSideRoom = supportMission ? defenseDepthRoom : approachDepthRoom;
    const finnishSideRoom = supportMission ? approachDepthRoom : defenseDepthRoom;
    const russianDepth = Math.min(3200, russianSideRoom);
    const finnishDepth = Math.min(900, finnishSideRoom);
    const russianStagger = Math.min(300, Math.max(0, (russianSideRoom - russianDepth) / 2));
    const finnishStagger = Math.min(90, Math.max(0, (finnishSideRoom - finnishDepth) / 2));
    for(let i=0;i<this.mission.groundPairs;i++){
      const lane = this.mission.groundPairs > 1 ? i / (this.mission.groundPairs - 1) - .5 : 0;
      const alongFront = lane * frontSpan + (rnd() - .5) * 100;
      const blueDirection = supportMission ? -1 : 1;
      const redDirection = -blueDirection;
      const blueDepth = blueDirection * finnishDepth + ((i % 3) - 1) * finnishStagger;
      const redDepth = redDirection * (russianDepth + (i % 3) * russianStagger);
      const blueType=finnishTypes[i%finnishTypes.length],redType=russianTypes[i%russianTypes.length];
      const blue= createGroundVehicle(blueType,'finnish'), red=createGroundVehicle(redType,'russian');
      const blueSpec=getGroundVehicleSpec(blueType),redSpec=getGroundVehicleSpec(redType);
      const bluePos=nearestDryPoint(
        this.terrain,
        this.battleCenter.x+this.routeRight.x*alongFront+this.routeForward.x*blueDepth,
        this.battleCenter.z+this.routeRight.z*alongFront+this.routeForward.z*blueDepth,
      );
      const redAlongFront = alongFront + (rnd() - .5) * 520;
      const redPos=nearestDryPoint(
        this.terrain,
        this.battleCenter.x+this.routeRight.x*redAlongFront+this.routeForward.x*redDepth,
        this.battleCenter.z+this.routeRight.z*redAlongFront+this.routeForward.z*redDepth,
      );
      if(!bluePos||!redPos)continue;
      blue.position.set(bluePos.x,bluePos.y,bluePos.z); blue.rotation.y=heading+(supportMission?0:Math.PI);
      red.position.set(redPos.x,redPos.y,redPos.z); red.rotation.y=heading+(supportMission?Math.PI:0);
      this.scene.add(blue,red);
      const blueUnit={mesh:blue,hp:blueSpec.hp,maxHp:blueSpec.hp,team:'blue',role:'defender',cool:1+i*.33,phase:i*.8,armed:true,airAaCooldown:2+rnd()*5,airAaBurstClock:0,airAaBurstRemaining:0,speed:blueSpec.kind==='tracked'?10.5+rnd()*2:14+rnd()*2.5,flank:i%2===0?1:-1,velocity:new THREE.Vector3(),travel:new THREE.Vector3(),toTarget:new THREE.Vector3(),tangent:new THREE.Vector3(),waypoint:new THREE.Vector3(),separation:new THREE.Vector3(),facing:new THREE.Vector3(),pathDirection:new THREE.Vector3()};
      const redUnit={mesh:red,hp:redSpec.hp,maxHp:redSpec.hp,team:'red',role:'assault',cool:2+i*.25,phase:i*.8+1,armed:true,speed:redSpec.kind==='tracked'?10+rnd()*2:13.5+rnd()*2.5,flank:i%2===0?-1:1,velocity:new THREE.Vector3(),aaCooldown:(this.difficulty.enemyAaInitialDelay ?? 2)+rnd()*(this.difficulty.enemyAaInitialJitter ?? 5),aaBurstClock:0,aaBurstRemaining:0,aaTarget:null,aaThreatTimer:0,aaFiringPause:0,assaultTarget:blue.position,travel:new THREE.Vector3(),toTarget:new THREE.Vector3(),tangent:new THREE.Vector3(),waypoint:new THREE.Vector3(),separation:new THREE.Vector3(),facing:new THREE.Vector3(),pathDirection:new THREE.Vector3()};
      this.friends.push(blueUnit);this.redUnits.push(redUnit);
      blueUnit.collider={type:'vehicle',mesh:blue,x:bluePos.x,y:bluePos.y,z:bluePos.z,radius:blueSpec.radius,height:blueSpec.totalHeight,velocity:blueUnit.velocity,collisionKey:'combat.collisionFriendlyVehicle',vehicle:blueSpec.name};
      redUnit.collider={type:'vehicle',mesh:red,x:redPos.x,y:redPos.y,z:redPos.z,radius:redSpec.radius,height:redSpec.totalHeight,velocity:redUnit.velocity,collisionKey:'combat.collisionHostileVehicle',vehicle:redSpec.name};
      this.colliders.push(blueUnit.collider,redUnit.collider);
    }
    const convoyOffset=Math.min(2200,Math.max(0,russianSideRoom-russianDepth-700));
    const convoyCenter=this.battleCenter.clone().addScaledVector(
      this.routeForward,
      (supportMission ? 1 : -1) * (russianDepth + convoyOffset),
    );
    const convoySpan=Math.min(
      this.mission.convoyArea || 8200,
      Math.max(1800,frontSpan*.8),
      safeRouteAlignedSquareSpan(convoyCenter,this.routeForward,this.routeRight,theaterHalf),
    );
    for(let i=0;i<this.mission.groundTrucks;i++){
      const truck=createGroundVehicle('ural4320','russian');
      const lateral=(rnd()-.5)*convoySpan;
      const depth=(rnd()-.5)*360;
      const x=convoyCenter.x+this.routeRight.x*lateral+this.routeForward.x*depth;
      const z=convoyCenter.z+this.routeRight.z*lateral+this.routeForward.z*depth;
      const spec=getGroundVehicleSpec('ural4320');
      const dryPoint=nearestDryPoint(this.terrain,x,z);
      if(!dryPoint)continue;
      truck.position.set(dryPoint.x,dryPoint.y,dryPoint.z); truck.rotation.y=heading+(supportMission?Math.PI:0); this.scene.add(truck);
      const convoy={mesh:truck,hp:spec.hp,maxHp:spec.hp,team:'red',role:'logistics',cool:0,phase:rnd()*Math.PI*2,armed:false,speed:12+rnd()*3,flank:1,velocity:new THREE.Vector3(),routeOrigin:truck.position.clone(),routeHeading:this.routeForward.clone(),routeTravel:0,routeLimit:1800,routeSign:1,travel:new THREE.Vector3(),toTarget:new THREE.Vector3(),tangent:new THREE.Vector3(),waypoint:new THREE.Vector3(),separation:new THREE.Vector3(),facing:new THREE.Vector3(),pathDirection:new THREE.Vector3()};
      this.redUnits.push(convoy);
      convoy.collider={type:'vehicle',mesh:truck,x:truck.position.x,z:truck.position.z,y:truck.position.y,radius:spec.radius,height:spec.totalHeight,velocity:convoy.velocity,collisionKey:'combat.collisionHostileVehicle',vehicle:spec.name};
      this.colliders.push(convoy.collider);
    }

    // Finnish Masi (Sisu SA-150) 4x4 supply trucks operate behind the defence
    // line. They are scenery/logistics, not objective targets or combatants.
    const friendlyTruckCount = this.mission.groundFriendlyTrucks ?? 0;
    const supplyCenter = this.battleCenter.clone().addScaledVector(
      this.routeForward,
      (supportMission ? -1 : 1) * (finnishDepth + 1050),
    );
    const supplySpan = Math.min(frontSpan * .78, safeRouteAlignedSquareSpan(
      supplyCenter, this.routeForward, this.routeRight, theaterHalf, 900,
    ));
    for (let i = 0; i < friendlyTruckCount; i++) {
      const truck = createGroundVehicle('sisuSa150', 'finnish');
      const lane = friendlyTruckCount > 1 ? i / (friendlyTruckCount - 1) - .5 : 0;
      const lateral = lane * supplySpan + (rnd() - .5) * 340;
      const depth = (rnd() - .5) * 520;
      const dryPoint = nearestDryPoint(
        this.terrain,
        supplyCenter.x + this.routeRight.x * lateral + this.routeForward.x * depth,
        supplyCenter.z + this.routeRight.z * lateral + this.routeForward.z * depth,
      );
      if (!dryPoint) continue;
      const spec = getGroundVehicleSpec('sisuSa150');
      truck.position.set(dryPoint.x, dryPoint.y, dryPoint.z);
      truck.rotation.y = heading + (supportMission ? 0 : Math.PI);
      this.scene.add(truck);
      const supply = {
        mesh: truck, hp: spec.hp, maxHp: spec.hp, team: 'blue', role: 'logistics',
        cool: 0, phase: rnd() * Math.PI * 2, armed: false, speed: 8 + rnd() * 3,
        flank: 1, velocity: new THREE.Vector3(), routeOrigin: truck.position.clone(),
        routeHeading: this.routeForward.clone(), routeTravel: rnd() * 1200 - 600,
        routeLimit: 0, routeSign: rnd() < .5 ? -1 : 1, travel: new THREE.Vector3(),
        toTarget: new THREE.Vector3(), tangent: new THREE.Vector3(), waypoint: new THREE.Vector3(),
        separation: new THREE.Vector3(), facing: new THREE.Vector3(), pathDirection: new THREE.Vector3(),
      };
      this.friends.push(supply);
      supply.collider = {
        type: 'vehicle', mesh: truck, x: dryPoint.x, y: dryPoint.y, z: dryPoint.z,
        radius: spec.radius, height: spec.totalHeight, velocity: supply.velocity,
        collisionKey: 'combat.collisionFriendlyVehicle', vehicle: spec.name,
      };
      this.colliders.push(supply.collider);
    }

    const addAirDefenseVehicle = (platform, team, index, count, depth, flankSign) => {
      const spec = getGroundVehicleSpec(platform);
      const lane = (index - (count - 1) * 0.5) * Math.min(1500, frontSpan * 0.18) * flankSign;
      const position = nearestDryPoint(
        this.terrain,
        this.battleCenter.x + this.routeRight.x * lane + this.routeForward.x * depth,
        this.battleCenter.z + this.routeRight.z * lane + this.routeForward.z * depth,
      );
      if (!position) return;
      const mesh = createGroundVehicle(platform, team === 'blue' ? 'finnish' : 'russian');
      mesh.position.set(position.x, position.y, position.z);
      mesh.rotation.y = heading + ((team === 'blue') !== supportMission ? Math.PI : 0);
      this.scene.add(mesh);
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
        aaCooldown: (this.difficulty.enemyAaInitialDelay ?? 2) + rnd() * (this.difficulty.enemyAaInitialJitter ?? 5),
        aaBurstClock: 0, aaBurstRemaining: 0,
        samRail: index % 4, samAmmo: 4,
      };
      unit.collider = {
        type: 'vehicle', mesh, x: position.x, y: position.y, z: position.z,
        radius: spec.radius, height: spec.totalHeight, velocity: unit.velocity,
        collisionKey: team === 'blue' ? 'combat.collisionFriendlyVehicle' : 'combat.collisionHostileVehicle',
        vehicle: spec.name,
      };
      (team === 'blue' ? this.friends : this.redUnits).push(unit);
      this.colliders.push(unit.collider);
    };
    for (let i = 0; i < (this.mission.groundIto90Count ?? 0); i++) {
      const depth = supportMission ? -finnishDepth - 720 : finnishDepth + 720;
      addAirDefenseVehicle('ito90', 'blue', i, this.mission.groundIto90Count, depth, 1);
    }
    for (let i = 0; i < (this.mission.groundShilkaCount ?? 0); i++) {
      const depth = supportMission ? russianDepth + 760 : -russianDepth - 760;
      addAirDefenseVehicle('zsu23-4', 'red', i, this.mission.groundShilkaCount, depth, -1);
    }
  }
  update(dt){
    for(let listIndex=0;listIndex<2;listIndex++){
      const list=listIndex===0?this.friends:this.redUnits;
      for(const unit of list){if(unit.dead)continue;
      unit.aaFiringPause=Math.max(0,(unit.aaFiringPause??0)-dt);
      unit.aaThreatTimer = Math.max(0, (unit.aaThreatTimer ?? 0) - dt);
      if (unit.aaThreatTimer <= 0) unit.aaTarget = null;
      if(unit.team==='red')this.updateAntiAir(unit,dt);
      else this.updateFriendlyAntiAir(unit,dt);
      unit.phase+=dt*(unit.armed===false?.38:.25);
      let target=null,nearest=2600;
      if(unit.armed!==false && unit.mesh.userData.platform!=='ito90'){
        const opposing=unit.team==='blue'?this.redUnits:this.friends;
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
        for(const candidate of this.friends){
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
          this.fireGround(unit,target);
          const weapon = spec?.weapon ?? '';
          // Realistic reload/burst pauses let the armoured line exchange fire
          // for a while instead of resolving the whole battle in seconds.
          unit.cool = weapon.includes('120') || weapon.includes('125')
            ? 5.1 + Math.random() * 1.6
            : weapon.includes('30') || weapon.includes('14,5')
              ? 2.8 + Math.random() * 1.25
              : 2.2 + Math.random() * .9;
        }
      }else{
        unit.cool=Math.max(0,unit.cool-dt);
      }

      // Assault vehicles keep advancing through most AA bursts, but some
      // pause briefly to steady their roof-mounted weapons and make their
      // firing posture readable to the player.
      if(unit.team==='red'&&unit.role==='assault'&&unit.aaFiringPause>0)speed=0;

      const healthFactor=THREE.MathUtils.clamp(.58+.42*unit.hp/unit.maxHp,.58,1);
      this.driveGroundUnit(unit,travel,speed*healthFactor,dt);
      }
    }
  }
  updateFriendlyAntiAir(unit,dt){
    if(!this.airDefenseActive||unit.armed===false)return;
    if (unit.mesh.userData.platform === 'ito90') {
      this.updateCrotale(unit, dt);
      return;
    }
    const profile={
      cv9030:{speed:930,maxRange:3300,maxAltitude:2200,spread:.0085,damage:.18,rounds:5,interval:.12,cooldown:7.5,jitter:4.5,muzzle:2.45},
      pasi:{speed:820,maxRange:2200,maxAltitude:1500,spread:.014,damage:.085,rounds:5,interval:.105,cooldown:10,jitter:5.5,muzzle:1.65},
    }[unit.mesh.userData.platform];
    if(!profile)return;
    unit.airAaCooldown=Math.max(0,unit.airAaCooldown-dt);
    let target=unit.airAaTarget;
    if(!target||target.dead||unit.airAaBurstRemaining<=0){
      target=null;
      let nearest=profile.maxRange;
      for(const enemy of this.enemies){
        if(enemy.dead)continue;
        const dx=enemy.mesh.position.x-unit.mesh.position.x;
        const dy=enemy.mesh.position.y-unit.mesh.position.y;
        const dz=enemy.mesh.position.z-unit.mesh.position.z;
        const distance=Math.hypot(dx,dy,dz);
        if(distance>=nearest)continue;
        const agl=enemy.mesh.position.y-this.terrain.sampleHeight(enemy.mesh.position.x,enemy.mesh.position.z);
        if(agl<25||agl>profile.maxAltitude)continue;
        nearest=distance;
        target=enemy;
      }
      unit.airAaTarget=target;
    }
    if(!target){unit.airAaBurstRemaining=0;return;}
    const dx=target.mesh.position.x-unit.mesh.position.x;
    const dy=target.mesh.position.y-unit.mesh.position.y;
    const dz=target.mesh.position.z-unit.mesh.position.z;
    const range=Math.hypot(dx,dy,dz);
    if(range>profile.maxRange||range<250){unit.airAaBurstRemaining=0;return;}
    if(unit.airAaBurstRemaining<=0&&unit.airAaCooldown<=0){
      unit.airAaBurstRemaining=profile.rounds;
      unit.airAaBurstClock=0;
      unit.airAaCooldown=profile.cooldown+Math.random()*profile.jitter;
      this.audio?.playDistantGun(range,'ground');
    }
    unit.airAaBurstClock-=dt;
    while(unit.airAaBurstRemaining>0&&unit.airAaBurstClock<=0){
      this.fireFriendlyAntiAir(unit,target,range,profile);
      unit.airAaBurstRemaining--;
      unit.airAaBurstClock+=profile.interval;
    }
    if(unit.airAaBurstRemaining<=0)unit.airAaTarget=null;
  }
  updateCrotale(unit, dt) {
    if (unit.samAmmo <= 0) return;
    unit.airAaCooldown = Math.max(0, unit.airAaCooldown - dt);
    let target = unit.airAaTarget;
    if (!target || target.dead || target.mesh.position.distanceTo(unit.mesh.position) > 8500) {
      target = null;
      let nearest = 8500;
      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        const distance = enemy.mesh.position.distanceTo(unit.mesh.position);
        if (distance >= nearest) continue;
        const agl = enemy.mesh.position.y - this.terrain.sampleHeight(enemy.mesh.position.x, enemy.mesh.position.z);
        if (agl < 35 || agl > 7200) continue;
        nearest = distance;
        target = enemy;
      }
      unit.airAaTarget = target;
    }
    if (!target) return;
    const range = unit.mesh.position.distanceTo(target.mesh.position);
    if (range < 1000 || range > 8500 || unit.airAaCooldown > 0) return;
    this.fireCrotaleMissile(unit, target, range);
    unit.samAmmo--;
    // A restrained reload keeps the battery useful without solving the air
    // objective for the player. A four-round launcher has finite ready shots.
    unit.samRail = (unit.samRail + 1) % 4;
    unit.airAaCooldown = 23 + Math.random() * 8;
  }
  fireCrotaleMissile(unit, target, range) {
    const traverse = unit.mesh.userData.aaTraverse;
    const mount = unit.mesh.userData.aaMount;
    if (!mount || !traverse) return;
    unit.mesh.updateWorldMatrix(true, false);
    const flightTime = range / 940;
    this.aaAim.copy(target.mesh.position).addScaledVector(target.velocity ?? this.aaLeadPoint.set(0, 0, 0), flightTime * 0.55);
    traverse.parent.updateWorldMatrix(true, false);
    const traverseAim = this.aaLeadPoint.copy(this.aaAim);
    traverse.parent.worldToLocal(traverseAim);
    traverse.rotation.y = Math.atan2(traverseAim.x - traverse.position.x, traverseAim.z - traverse.position.z);
    traverse.updateWorldMatrix(true, false);
    mount.parent.updateWorldMatrix(true, false);
    this.aaAim.copy(target.mesh.position).addScaledVector(target.velocity ?? this.aaLeadPoint.set(0, 0, 0), flightTime * 0.55);
    mount.parent.worldToLocal(this.aaAim).sub(mount.position);
    mount.rotation.y = Math.atan2(this.aaAim.x, this.aaAim.z);
    mount.rotation.x = -Math.atan2(this.aaAim.y, Math.hypot(this.aaAim.x, this.aaAim.z));
    mount.updateWorldMatrix(true, false);
    const railX = unit.samRail % 2 === 0 ? -0.38 : 0.38;
    const railY = unit.samRail < 2 ? 0.4 : 0.78;
    mount.localToWorld(this.aaStart.set(railX, railY, 0.9));

    const missile = createMissile('#c5c8bb');
    const direction = this.aaAim.copy(target.mesh.position)
      .addScaledVector(target.velocity ?? this.aaLeadPoint.set(0, 0, 0), flightTime * 0.55)
      .sub(this.aaStart).normalize();
    missile.position.copy(this.aaStart);
    missile.quaternion.setFromUnitVectors(missileForward, direction);
    if (missile.userData.engineFlame) missile.userData.engineFlame.visible = true;
    this.scene.add(missile);
    const speed = 940;
    this.addFriendlyProjectile({
      projectile: true, missile: true, homing: true, seeker: 'radar', mesh: missile,
      velocity: direction.multiplyScalar(speed), speed, life: 10,
      burnRemaining: 7.5, coastDrag: 0.035, motorBurning: true, guidanceActive: true,
      damage: 2.1, proximityRadius: 34, proximityDamage: 0.95, target,
      targetDomain: 'air', decoyTarget: null, decoyAttempts: new Set(), trail: 0,
      ally: true, sourceUnit: unit,
    });
    this.audio?.playMissileLaunch();
    this.audio?.startMissileFlight(missile.id);
  }
  fireFriendlyAntiAir(unit,target,range,profile){
    const mount=unit.mesh.userData.aaMount;
    if(mount){
      unit.mesh.updateWorldMatrix(true,false);
      const flightTime=range/profile.speed;
      this.aaAim.copy(target.mesh.position).addScaledVector(target.velocity??new THREE.Vector3(),flightTime*.72);
      const traverse=unit.mesh.userData.aaTraverse;
      if(traverse){
        traverse.parent.updateWorldMatrix(true,false);
        const traverseAim=this.aaLeadPoint.copy(this.aaAim);
        traverse.parent.worldToLocal(traverseAim);
        traverse.rotation.y=Math.atan2(traverseAim.x-traverse.position.x,traverseAim.z-traverse.position.z);
        traverse.updateWorldMatrix(true,false);
      }
      mount.parent.updateWorldMatrix(true,false);
      this.aaAim.copy(target.mesh.position).addScaledVector(target.velocity??new THREE.Vector3(),flightTime*.72);
      mount.parent.worldToLocal(this.aaAim).sub(mount.position);
      if(!traverse)mount.rotation.y=Math.atan2(this.aaAim.x,this.aaAim.z);
      mount.rotation.x=-Math.atan2(this.aaAim.y,Math.hypot(this.aaAim.x,this.aaAim.z));
      mount.updateWorldMatrix(true,false);
      mount.localToWorld(this.aaStart.set(0,0,profile.muzzle));
    }else{
      unit.mesh.localToWorld(this.aaStart.set(0,(unit.mesh.userData.vehicleSpec?.totalHeight??3)+.35,.45));
    }
    const flightTime=range/profile.speed;
    const aim=this.aaLeadPoint.copy(target.mesh.position).addScaledVector(target.velocity??new THREE.Vector3(),flightTime);
    const spread=8+range*profile.spread;
    aim.x+=(Math.random()-.5)*spread*2;
    aim.y+=(Math.random()-.5)*spread*.75;
    aim.z+=(Math.random()-.5)*spread*2;
    const direction=aim.sub(this.aaStart).normalize();
    const line=new THREE.Mesh(antiAirShotGeo,antiAirShotMaterial);
    line.position.copy(this.aaStart);
    line.quaternion.setFromUnitVectors(antiAirRoundAxis,direction);
    this.scene.add(line);
    const velocity=direction.multiplyScalar(profile.speed);
    this.fx?.addMovingTracer(this.aaStart,velocity,'#ffd28b',{life:.16,trailTime:.065});
    this.addProjectile({
      projectile:true,groundAA:true,mesh:line,velocity,life:flightTime+.4,
      target,damage:profile.damage,
    });
  }
  updateAntiAir(unit,dt){
    if(!this.airDefenseActive)return;
    const platform=unit.mesh.userData.platform;
    const aa = {
      btr80: { speed: 850, maxRange: 2700, spread: .011, damage: 17, near: 9, rounds: 6, interval: .085, maxAltitude: 1100 },
      t72: { speed: 860, maxRange: 1750, spread: .022, damage: 12, near: 7, rounds: 7, interval: .12, maxAltitude: 900 },
      bmp2: { speed: 900, maxRange: 2900, spread: .012, damage: 23, near: 11, rounds: 7, interval: .075, maxAltitude: 1450 },
      'zsu23-4': { speed: 980, maxRange: 3600, spread: .0075, damage: 24, near: 15, rounds: 13, interval: .075, maxAltitude: 2050 },
    }[platform];
    if(!aa)return;
    unit.aaCooldown=Math.max(0,unit.aaCooldown-dt);
    const dx=this.player.position.x-unit.mesh.position.x,dz=this.player.position.z-unit.mesh.position.z;
    const range=Math.hypot(dx,dz);
    const agl=this.player.position.y-this.terrain.sampleHeight(this.player.position.x,this.player.position.z);
    const difficultyRange = this.difficulty.enemyAaMaxRange ?? 1850;
    const isShilka = platform === 'zsu23-4';
    const rangeLimit = (platform === 'zsu23-4'
      ? Math.min(aa.maxRange, difficultyRange * 1.3)
      : Math.min(difficultyRange, aa.maxRange))
      * (isShilka ? (this.difficulty.enemyShilkaRangeScale ?? 1) : 1);
    const altitudeLimit = aa.maxAltitude
      * (this.difficulty.enemyAaAltitudeScale ?? 1)
      * (isShilka ? (this.difficulty.enemyShilkaAltitudeScale ?? 1) : 1);
    const inEnvelope=range>190&&range<rangeLimit&&agl>20&&agl<altitudeLimit;
    if(!inEnvelope){unit.aaBurstRemaining=0;return;}
    if(unit.aaBurstRemaining<=0&&unit.aaCooldown<=0){
      const burstSize = (this.difficulty.enemyAaBurstRounds ?? 3) + aa.rounds;
      const shilkaBurstScale = platform === 'zsu23-4' ? (this.difficulty.enemyShilkaBurstScale ?? 1) : 1;
      unit.aaBurstRemaining=Math.max(2, Math.round(burstSize * (this.difficulty.enemyAaBurstScale ?? 1) * shilkaBurstScale));
      unit.aaBurstClock=0;
      unit.aaCooldown=(platform === 'zsu23-4'
        ? (this.difficulty.enemyAaCooldown ?? 8) * .8 * (this.difficulty.enemyShilkaCooldownScale ?? 1)
        : (this.difficulty.enemyAaCooldown ?? 8))
        +Math.random()*(this.difficulty.enemyAaCooldownJitter ?? 5);
      if(unit.role==='assault'){
        const stopChance=platform==='t72'
          ? (this.difficulty.enemyAaT72StopToFireChance ?? .68)
          : (this.difficulty.enemyAaStopToFireChance ?? .44);
        if(Math.random()<stopChance){
          unit.aaFiringPause=unit.aaBurstRemaining*aa.interval+.35;
        }
      }
    }
    unit.aaBurstClock-=dt;
    while(unit.aaBurstRemaining>0&&unit.aaBurstClock<=0){
      this.fireAntiAir(unit,range,aa);
      unit.aaBurstRemaining--;
      unit.aaBurstClock+=aa.interval;
    }
  }
  fireAntiAir(unit,range,profile){
    const platform=unit.mesh.userData.platform;
    const spec=unit.mesh.userData.vehicleSpec;
    const mount=unit.mesh.userData.aaMount;
    if (mount) {
      mount.parent.updateWorldMatrix(true, false);
      this.aaAim.copy(this.player.position);
      mount.parent.worldToLocal(this.aaAim).sub(mount.position);
      mount.rotation.y=Math.atan2(this.aaAim.x,this.aaAim.z);
      mount.rotation.x=-Math.atan2(this.aaAim.y,Math.hypot(this.aaAim.x,this.aaAim.z));
      mount.updateWorldMatrix(true,false);
      if (platform === 'zsu23-4') {
        // Alternate between the four real muzzle positions so both tracers
        // and the short flash originate at a barrel instead of the turret axis.
        const barrel = unit.aaBarrelIndex ?? 0;
        unit.aaBarrelIndex = (barrel + 1) % 4;
        mount.localToWorld(this.aaStart.set(
          barrel & 1 ? 0.42 : -0.42,
          barrel & 2 ? 0.74 : 0.3,
          3.96,
        ));
      } else {
        const muzzle = platform === 'bmp2' ? 3.15 : platform === 'btr80' ? 1.8 : 1.0;
        mount.localToWorld(this.aaStart.set(0,0,muzzle));
      }
    } else {
      unit.mesh.localToWorld(this.aaStart.set(0,(spec?.totalHeight??3)+.4,.35));
    }
    const start=this.aaStart;
    const flightTime=range/profile.speed;
    const aim=this.player.position.clone().addScaledVector(this.playerVelocity??new THREE.Vector3(),flightTime);
    const isShilka = platform === 'zsu23-4';
    const dispersionScale = (this.difficulty.enemyAaDispersionScale ?? 1)
      * (isShilka ? (this.difficulty.enemyShilkaDispersionScale ?? 1) : 1);
    const spread=(12+range*profile.spread)*dispersionScale;
    aim.x+=(Math.random()-.5)*spread*2;
    aim.y+=(Math.random()-.5)*spread;
    aim.z+=(Math.random()-.5)*spread*2;
    const direction=aim.sub(start).normalize();
    const shilka = platform === 'zsu23-4';
    const line=new THREE.Mesh(antiAirShotGeo,antiAirShotMaterial);
    line.position.copy(start).addScaledVector(direction, shilka ? .9 : .675);
    if (shilka) line.scale.set(1.28, 1.55, 1.28);
    line.quaternion.setFromUnitVectors(antiAirRoundAxis,direction);
    this.scene.add(line);
    // Brief pooled glow at the muzzle adds a readable firing cue without
    // creating a PointLight or a per-shot mesh/material.
    this.fx?.emitParticle(
      start,
      muzzleFlashVelocity,
      shilka ? shilkaMuzzleGlow : antiAirMuzzleGlow,
      shilka ? 0.075 : 0.06,
      shilka ? 1.7 : 1.15,
      0.92,
      shilka ? 1.6 : 1.35,
    );
    const velocity=direction.multiplyScalar(profile.speed);
    const tracerColor = shilka ? '#fff0b7' : platform === 't72' ? '#ffb46b' : '#ffd18a';
    this.fx?.addMovingTracer(line.position,velocity,tracerColor,shilka ? {life:.68,trailTime:.48} : {life:.34,trailTime:.22});
    this.audio?.playDistantGun(range,'ground');
    unit.aaTarget=this.player;
    unit.aaThreatTimer=3.5;
    this.addProjectile({
      projectile:true,flak:true,mesh:line,velocity,life:flightTime+.35,
      directDamage:profile.damage*(this.difficulty.enemyAaDamageMultiplier??1)*(shilka ? (this.difficulty.enemyShilkaDamageScale ?? 1) : 1),
      nearMissDamage:profile.near*(this.difficulty.enemyAaDamageMultiplier??1)*(shilka ? (this.difficulty.enemyShilkaDamageScale ?? 1) : 1),
      nearMissDamageMin:profile.near*(shilka ? .12 : .45)*(this.difficulty.enemyAaDamageMultiplier??1)*(shilka ? (this.difficulty.enemyShilkaDamageScale ?? 1) : 1),
      nearMissRadius:shilka ? 18 : 42,
      sourceUnit:unit,
    });
  }
  driveGroundUnit(unit,desiredDirection,speed,dt){
    const separation=unit.separation.set(0,0,0);
    for(const other of this.groundUnits){
      if(other===unit||other.dead)continue;
      const dx=unit.mesh.position.x-other.mesh.position.x,dz=unit.mesh.position.z-other.mesh.position.z;
      const distanceSq=dx*dx+dz*dz;
      if(distanceSq>0&&distanceSq<34*34){const distance=Math.sqrt(distanceSq);separation.x+=(dx/distance)*(34-distance)/34;separation.z+=(dz/distance)*(34-distance)/34;}
    }
    if(separation.lengthSq()>0)desiredDirection.addScaledVector(separation,.85).normalize();
    const direction=this.findDryGroundDirection(unit.mesh.position,desiredDirection,unit);
    if(!direction){unit.velocity.multiplyScalar(Math.exp(-4*dt));return;}
    const wantedYaw=Math.atan2(direction.x,direction.z);
    let yawDelta=THREE.MathUtils.euclideanModulo(wantedYaw-unit.mesh.rotation.y+Math.PI,Math.PI*2)-Math.PI;
    const turnRate=unit.mesh.userData.vehicleSpec?.kind==='tracked' ? .82 : 1.12;
    yawDelta=THREE.MathUtils.clamp(yawDelta,-turnRate*dt,turnRate*dt);
    unit.mesh.rotation.y+=yawDelta;
    const facing=unit.facing.set(Math.sin(unit.mesh.rotation.y),0,Math.cos(unit.mesh.rotation.y));
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
  findDryGroundDirection(position,desiredDirection,unit){
    if(desiredDirection.lengthSq()<1e-5)return null;
    const base=Math.atan2(desiredDirection.x,desiredDirection.z);
    const best=unit.pathDirection;
    let bestScore=-Infinity,hasBest=false;
    for(const offset of dryRouteOffsets){
      const angle=base+offset,direction=unit.tangent.set(Math.sin(angle),0,Math.cos(angle));
      if(!this.groundPathIsClear(position,direction,82))continue;
      const score=Math.cos(offset)*100-Math.abs(offset)*2;
      if(score>bestScore){bestScore=score;best.copy(direction);hasBest=true;}
    }
    return hasBest?best:null;
  }
  groundPathIsClear(position,direction,distance){
    const half=this.terrain.worldSize/2-35;
    for(let travelled=14;travelled<=distance;travelled+=14){
      const x=position.x+direction.x*travelled,z=position.z+direction.z*travelled;
      if(Math.abs(x)>half||Math.abs(z)>half
        ||(this.terrain.isPlayableArea&&!this.terrain.isPlayableArea(x,z))
        ||this.terrain.isWater(x,z))return false;
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
    const weapon = unit.mesh.userData.vehicleSpec?.weapon ?? '';
    const dispersion = weapon.includes('120') || weapon.includes('125') ? .006 : weapon.includes('30') ? .013 : .021;
    const miss = Math.max(5, a.distanceTo(b) * dispersion);
    b.x += (Math.random() - .5) * miss * 2;
    b.z += (Math.random() - .5) * miss * 2;
    b.y += (Math.random() - .5) * miss * .45;
    const color=unit.team==='blue'?'#ffd889':'#ff785d';
    this.fx?.addTracer(a,b,color);
    const line=new THREE.Mesh(groundShotGeo,unit.team==='blue'?blueGroundShotMaterial:redGroundShotMaterial);line.position.copy(a);this.scene.add(line);
    const velocity=b.sub(a).normalize().multiplyScalar(280);
    this.addProjectile({projectile:true,ground:true,mesh:line,velocity,life:flightTime,target});
  }

  dispose() {
    for (const unit of this.groundUnits){this.scene.remove(unit.mesh);disposeGroundVehicleVisual(unit.mesh);}
    this.friends.length = 0;
    this.redUnits.length = 0;
    this.groundUnits.length = 0;
    this.colliders.length = 0;
  }
}

function nearestDryPoint(terrain, x, z) {
  const half = (terrain?.worldSize ?? 32000) * .5 - 120;
  x = THREE.MathUtils.clamp(x,-half,half);
  z = THREE.MathUtils.clamp(z,-half,half);
  if (isMappedDryGround(terrain, x, z)) return { x, z, y: terrain.sampleHeight(x, z) };
  for (let step = 1; step <= 100; step++) {
    for (let bearing = 0; bearing < 16; bearing++) {
      const angle = bearing * Math.PI / 8;
      const candidateX = x + Math.cos(angle) * step * 25;
      const candidateZ = z + Math.sin(angle) * step * 25;
      if(Math.abs(candidateX)>half||Math.abs(candidateZ)>half)continue;
      if (isMappedDryGround(terrain, candidateX, candidateZ)) {
        return { x: candidateX, z: candidateZ, y: terrain.sampleHeight(candidateX, candidateZ) };
      }
    }
  }
  return null;
}

function isMappedDryGround(terrain, x, z) {
  return (!terrain.isPlayableArea || terrain.isPlayableArea(x, z)) && !terrain.isWater(x, z);
}

function getGroundWeaponRange(weapon = '') {
  if (weapon.includes('120') || weapon.includes('125')) return 2200;
  if (weapon.includes('30')) return 1500;
  if (weapon.includes('14,5')) return 1250;
  if (weapon.includes('12,7')) return 1000;
  return 900;
}
