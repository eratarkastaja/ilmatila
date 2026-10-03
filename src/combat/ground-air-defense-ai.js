import * as THREE from 'three';
import { createMissile } from './projectiles.js';
import { createSeededRandom, DEFAULT_RANDOM_SEED } from './random.js';

const antiAirShotGeo = new THREE.CylinderGeometry(.075, .055, 1.35, 6, 1);
const antiAirShotMaterial = new THREE.MeshBasicMaterial({ color: '#ffc47a', toneMapped: false });
const shilkaShotMaterial = new THREE.MeshBasicMaterial({ color: '#ff9b42', toneMapped: false });
const antiAirMuzzleGlow = new THREE.Color('#ffd69d');
const shilkaMuzzleGlow = new THREE.Color('#fff0ca');
const muzzleFlashVelocity = new THREE.Vector3(0, 0.35, 0);
const antiAirRoundAxis = new THREE.Vector3(0, 1, 0);
const missileForward = new THREE.Vector3(0, 0, 1);
const stationaryVelocity = new THREE.Vector3();
const FRIENDLY_AA_TRACER_OPTIONS = { life: .16, trailTime: .065 };
const AA_TRACER_OPTIONS = { life: .34, trailTime: .22 };
const SHILKA_TRACER_OPTIONS = { life: .82, trailTime: .6 };
const AA_TRACKING_WARNING_SECONDS = 1.5;
const FRIENDLY_AA_PROFILES = Object.freeze({
  cv9030: { speed: 930, maxRange: 3300, maxAltitude: 2200, spread: .0085, damage: .18, rounds: 5, interval: .12, cooldown: 7.5, jitter: 4.5, muzzle: 2.45 },
  pasi: { speed: 820, maxRange: 2200, maxAltitude: 1500, spread: .014, damage: .085, rounds: 5, interval: .105, cooldown: 10, jitter: 5.5, muzzle: 1.65 },
});
const HOSTILE_AA_PROFILES = Object.freeze({
  btr80: { speed: 850, maxRange: 2700, spread: .011, damage: 17, near: 9, rounds: 6, interval: .085, maxAltitude: 1100 },
  t72: { speed: 860, maxRange: 1750, spread: .022, damage: 12, near: 7, rounds: 7, interval: .12, maxAltitude: 900 },
  bmp2: { speed: 900, maxRange: 2900, spread: .012, damage: 23, near: 11, rounds: 7, interval: .075, maxAltitude: 1450 },
  'zsu23-4': { speed: 980, maxRange: 3200, spread: .01, damage: 20, near: 12, rounds: 9, interval: .075, maxAltitude: 2050 },
});

/** Controls friendly and hostile ground-based air defenses and their weapons. */
export class GroundAirDefenseAI {
  constructor(random = createSeededRandom(DEFAULT_RANDOM_SEED)) {
    this.random = random;
    this.aaAim = new THREE.Vector3();
    this.aaStart = new THREE.Vector3();
    this.aaLeadPoint = new THREE.Vector3();
  }

  updateFriendlyAntiAir(battle, unit,dt) {
    if(!battle.airDefenseActive||unit.armed===false)return;
    if (unit.mesh.userData.platform === 'ito90') {
      this.updateCrotale(battle, unit, dt);
      return;
    }
    const profile=FRIENDLY_AA_PROFILES[unit.mesh.userData.platform];
    if(!profile)return;
    unit.airAaCooldown=Math.max(0,unit.airAaCooldown-dt);
    let target=unit.airAaTarget;
    if(!target||target.dead||unit.airAaBurstRemaining<=0){
      target=null;
      let nearest=profile.maxRange;
      for(const enemy of battle.enemies){
        if(enemy.dead)continue;
        const dx=enemy.mesh.position.x-unit.mesh.position.x;
        const dy=enemy.mesh.position.y-unit.mesh.position.y;
        const dz=enemy.mesh.position.z-unit.mesh.position.z;
        const distance=Math.hypot(dx,dy,dz);
        if(distance>=nearest)continue;
        const agl=enemy.mesh.position.y-battle.terrain.sampleHeight(enemy.mesh.position.x,enemy.mesh.position.z);
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
      unit.airAaCooldown=profile.cooldown+this.random()*profile.jitter;
      battle.audio?.playDistantGun(range,'ground');
    }
    unit.airAaBurstClock-=dt;
    while(unit.airAaBurstRemaining>0&&unit.airAaBurstClock<=0){
      this.fireFriendlyAntiAir(battle, unit, target, range, profile);
      unit.airAaBurstRemaining--;
      unit.airAaBurstClock+=profile.interval;
    }
    if(unit.airAaBurstRemaining<=0)unit.airAaTarget=null;
  }

  updateCrotale(battle, unit, dt) {
    if (unit.samAmmo <= 0) return;
    unit.airAaCooldown = Math.max(0, unit.airAaCooldown - dt);
    let target = unit.airAaTarget;
    if (!target || target.dead || target.mesh.position.distanceTo(unit.mesh.position) > 8500) {
      target = null;
      let nearest = 8500;
      for (const enemy of battle.enemies) {
        if (enemy.dead) continue;
        const distance = enemy.mesh.position.distanceTo(unit.mesh.position);
        if (distance >= nearest) continue;
        const agl = enemy.mesh.position.y - battle.terrain.sampleHeight(enemy.mesh.position.x, enemy.mesh.position.z);
        if (agl < 35 || agl > 7200) continue;
        nearest = distance;
        target = enemy;
      }
      unit.airAaTarget = target;
    }
    if (!target) return;
    const range = unit.mesh.position.distanceTo(target.mesh.position);
    if (range < 1000 || range > 8500 || unit.airAaCooldown > 0) return;
    this.fireCrotaleMissile(battle, unit, target, range);
    unit.samAmmo--;
    // A restrained reload keeps the battery useful without solving the air
    // objective for the player. A four-round launcher has finite ready shots.
    unit.samRail = (unit.samRail + 1) % 4;
    unit.airAaCooldown = 23 + this.random() * 8;
  }

  fireCrotaleMissile(battle, unit, target, range) {
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
    battle.scene.add(missile);
    const speed = 940;
    battle.addFriendlyProjectile({
      projectile: true, missile: true, homing: true, seeker: 'radar', mesh: missile,
      velocity: direction.multiplyScalar(speed), speed, turnRate: .48, life: 10,
      burnRemaining: 7.5, coastDrag: 0.035, motorBurning: true, guidanceActive: true,
      damage: 2.1, proximityRadius: 34, proximityDamage: 0.95, target,
      targetDomain: 'air', decoyTarget: null, decoyAttempts: new Set(), trail: 0,
      ally: true, sourceUnit: unit,
    });
    battle.audio?.playMissileLaunch();
    battle.audio?.startMissileFlight(missile.id);
  }

  fireFriendlyAntiAir(battle, unit,target,range,profile) {
    const mount=unit.mesh.userData.aaMount;
    if(mount){
      unit.mesh.updateWorldMatrix(true,false);
      const flightTime=range/profile.speed;
      this.aaAim.copy(target.mesh.position).addScaledVector(target.velocity??stationaryVelocity,flightTime*.72);
      const traverse=unit.mesh.userData.aaTraverse;
      if(traverse){
        traverse.parent.updateWorldMatrix(true,false);
        const traverseAim=this.aaLeadPoint.copy(this.aaAim);
        traverse.parent.worldToLocal(traverseAim);
        traverse.rotation.y=Math.atan2(traverseAim.x-traverse.position.x,traverseAim.z-traverse.position.z);
        traverse.updateWorldMatrix(true,false);
      }
      mount.parent.updateWorldMatrix(true,false);
      this.aaAim.copy(target.mesh.position).addScaledVector(target.velocity??stationaryVelocity,flightTime*.72);
      mount.parent.worldToLocal(this.aaAim).sub(mount.position);
      if(!traverse)mount.rotation.y=Math.atan2(this.aaAim.x,this.aaAim.z);
      mount.rotation.x=-Math.atan2(this.aaAim.y,Math.hypot(this.aaAim.x,this.aaAim.z));
      mount.updateWorldMatrix(true,false);
      mount.localToWorld(this.aaStart.set(0,0,profile.muzzle));
    }else{
      unit.mesh.localToWorld(this.aaStart.set(0,(unit.mesh.userData.vehicleSpec?.totalHeight??3)+.35,.45));
    }
    const flightTime=range/profile.speed;
    const aim=this.aaLeadPoint.copy(target.mesh.position).addScaledVector(target.velocity??stationaryVelocity,flightTime);
    const spread=8+range*profile.spread;
    aim.x+=(this.random()-.5)*spread*2;
    aim.y+=(this.random()-.5)*spread*.75;
    aim.z+=(this.random()-.5)*spread*2;
    const direction=aim.sub(this.aaStart).normalize();
    const line=new THREE.Mesh(antiAirShotGeo,antiAirShotMaterial);
    line.position.copy(this.aaStart);
    line.quaternion.setFromUnitVectors(antiAirRoundAxis,direction);
    battle.scene.add(line);
    const velocity=direction.multiplyScalar(profile.speed);
    battle.fx?.addMovingTracer(this.aaStart,velocity,'#ffd28b',FRIENDLY_AA_TRACER_OPTIONS);
    battle.addProjectile({
      projectile:true,groundAA:true,mesh:line,velocity,life:flightTime+.4,
      target,damage:profile.damage,
    });
  }

  updateAntiAir(battle, unit,dt) {
    if(!battle.airDefenseActive)return;
    const platform=unit.mesh.userData.platform;
    const aa = HOSTILE_AA_PROFILES[platform];
    if(!aa)return;
    unit.aaCooldown=Math.max(0,unit.aaCooldown-dt);
    const dx=battle.player.position.x-unit.mesh.position.x,dz=battle.player.position.z-unit.mesh.position.z;
    const range=Math.hypot(dx,dz);
    const agl=battle.player.position.y-battle.terrain.sampleHeight(battle.player.position.x,battle.player.position.z);
    const difficultyRange = battle.difficulty?.groundAA?.maxRange ?? 1850;
    const isShilka = platform === 'zsu23-4';
    const rangeLimit = (platform === 'zsu23-4'
      ? Math.min(aa.maxRange, difficultyRange * 1.3)
      : Math.min(difficultyRange, aa.maxRange))
      * (isShilka ? (battle.difficulty?.groundAA?.shilka?.rangeScale ?? 1) : 1);
    const altitudeLimit = aa.maxAltitude
      * (battle.difficulty?.groundAA?.altitudeScale ?? 1)
      * (isShilka ? (battle.difficulty?.groundAA?.shilka?.altitudeScale ?? 1) : 1);
    const inEnvelope=range>190&&range<rangeLimit&&agl>20&&agl<altitudeLimit;
    if(!inEnvelope){
      unit.aaBurstRemaining=0;
      unit.aaTrackTimer=null;
      unit.aaPlayerTracking=false;
      return;
    }
    if(unit.aaBurstRemaining<=0){
      let startedTracking=false;
      if(unit.aaTrackTimer==null){
        if(unit.aaCooldown>AA_TRACKING_WARNING_SECONDS)return;
        unit.aaTrackTimer=AA_TRACKING_WARNING_SECONDS;
        unit.aaPlayerTracking=true;
        startedTracking=true;
      }
      this.aimAntiAirAtPlayer(unit,battle.player.position);
      if(!startedTracking)unit.aaTrackTimer=Math.max(0,unit.aaTrackTimer-dt);
      if(unit.aaTrackTimer>0||unit.aaCooldown>0)return;
      unit.aaPlayerTracking=false;
      unit.aaTrackTimer=null;
    }
    if(unit.aaBurstRemaining<=0&&unit.aaCooldown<=0){
      const burstSize = (battle.difficulty?.groundAA?.burstRounds ?? 3) + aa.rounds;
      const shilkaBurstScale = platform === 'zsu23-4' ? (battle.difficulty?.groundAA?.shilka?.burstScale ?? 1) : 1;
      unit.aaBurstRemaining=Math.max(2, Math.round(burstSize * (battle.difficulty?.groundAA?.burstScale ?? 1) * shilkaBurstScale));
      unit.aaBurstClock=0;
      unit.aaCooldown=(platform === 'zsu23-4'
        ? (battle.difficulty?.groundAA?.cooldown ?? 8) * .8 * (battle.difficulty?.groundAA?.shilka?.cooldownScale ?? 1)
        : (battle.difficulty?.groundAA?.cooldown ?? 8))
        +this.random()*(battle.difficulty?.groundAA?.cooldownJitter ?? 5);
      unit.aaPlayerTracking=false;
      unit.aaTrackTimer=null;
      if(unit.role==='assault'){
        const stopChance=platform==='t72'
          ? (battle.difficulty?.groundAA?.t72StopToFireChance ?? .68)
          : (battle.difficulty?.groundAA?.stopToFireChance ?? .44);
        if(this.random()<stopChance){
          unit.aaFiringPause=unit.aaBurstRemaining*aa.interval+.35;
        }
      }
    }
    unit.aaBurstClock-=dt;
    while(unit.aaBurstRemaining>0&&unit.aaBurstClock<=0){
      this.fireAntiAir(battle, unit, range, aa);
      unit.aaBurstRemaining--;
      unit.aaBurstClock+=aa.interval;
    }
  }

  aimAntiAirAtPlayer(unit, targetPosition) {
    const mount=unit.mesh.userData.aaMount;
    if(!mount)return;
    unit.mesh.updateWorldMatrix(true,false);
    mount.parent.updateWorldMatrix(true,false);
    const aim=this.aaAim.copy(targetPosition);
    mount.parent.worldToLocal(aim).sub(mount.position);
    mount.rotation.y=Math.atan2(aim.x,aim.z);
    mount.rotation.x=-Math.atan2(aim.y,Math.hypot(aim.x,aim.z));
    mount.updateWorldMatrix(true,false);
  }

  fireAntiAir(battle, unit,range,profile) {
    const platform=unit.mesh.userData.platform;
    const spec=unit.mesh.userData.vehicleSpec;
    const mount=unit.mesh.userData.aaMount;
    if (mount) {
      mount.parent.updateWorldMatrix(true, false);
      this.aaAim.copy(battle.player.position);
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
    const aim=this.aaAim.copy(battle.player.position).addScaledVector(battle.playerVelocity??stationaryVelocity,flightTime);
    const isShilka = platform === 'zsu23-4';
    const dispersionScale = (battle.difficulty?.groundAA?.dispersionScale ?? 1)
      * (isShilka ? (battle.difficulty?.groundAA?.shilka?.dispersionScale ?? 1) : 1);
    const spread=(12+range*profile.spread)*dispersionScale;
    aim.x+=(this.random()-.5)*spread*2;
    aim.y+=(this.random()-.5)*spread;
    aim.z+=(this.random()-.5)*spread*2;
    const direction=aim.sub(start).normalize();
    const shilka = platform === 'zsu23-4';
    const line=new THREE.Mesh(antiAirShotGeo,shilka ? shilkaShotMaterial : antiAirShotMaterial);
    line.position.copy(start).addScaledVector(direction, shilka ? .9 : .675);
    if (shilka) line.scale.set(1.28, 1.55, 1.28);
    line.quaternion.setFromUnitVectors(antiAirRoundAxis,direction);
    battle.scene.add(line);
    // Brief pooled glow at the muzzle adds a readable firing cue without
    // creating a PointLight or a per-shot mesh/material.
    battle.fx?.emitParticle(
      start,
      muzzleFlashVelocity,
      shilka ? shilkaMuzzleGlow : antiAirMuzzleGlow,
      shilka ? 0.075 : 0.06,
      shilka ? 1.7 : 1.15,
      0.92,
      shilka ? 1.6 : 1.35,
    );
    const velocity=direction.multiplyScalar(profile.speed);
    const tracerColor = shilka ? '#ffb44b' : platform === 't72' ? '#ffb46b' : '#ffd18a';
    battle.fx?.addMovingTracer(line.position,velocity,tracerColor,shilka ? SHILKA_TRACER_OPTIONS : AA_TRACER_OPTIONS);
    battle.audio?.playDistantGun(range,'ground');
    unit.aaTarget=battle.player;
    unit.aaThreatTimer=3.5;
    battle.addProjectile({
      projectile:true,flak:true,mesh:line,velocity,life:flightTime+.35,
      directDamage:profile.damage*(battle.difficulty?.groundAA?.damageMultiplier??1)*(shilka ? (battle.difficulty?.groundAA?.shilka?.damageScale ?? 1) : 1),
      nearMissDamage:profile.near*(battle.difficulty?.groundAA?.damageMultiplier??1)*(shilka ? (battle.difficulty?.groundAA?.shilka?.damageScale ?? 1) : 1),
      nearMissDamageMin:profile.near*(shilka ? .12 : .32)*(battle.difficulty?.groundAA?.damageMultiplier??1)*(shilka ? (battle.difficulty?.groundAA?.shilka?.damageScale ?? 1) : 1),
      nearMissRadius:shilka ? 15 : 28,
      sourceUnit:unit,
    });
  }

  updateFriendly(battle, unit, dt) {
    this.updateFriendlyAntiAir(battle, unit, dt);
  }

  updateHostile(battle, unit, dt) {
    this.updateAntiAir(battle, unit, dt);
  }
}
