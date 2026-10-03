import * as THREE from 'three';
import { F35_GUN_MUZZLE_OFFSET, F35_GUN_TRACER_CLEARANCE } from '../aircraft/plane-models.js';
import { createMissile, MISSILE_PROFILES } from './projectiles.js';
import { forward, leadPoint, projectileAxis, zeroVelocity } from './air-combat-utils.js';
import { createSeededRandom, DEFAULT_RANDOM_SEED } from './random.js';

const allyShotGeo = new THREE.SphereGeometry(.12, 5, 4);
const hostileShotGeo = new THREE.CylinderGeometry(.055, .045, .92, 6, 1);
const allyShotMaterial = new THREE.MeshBasicMaterial({ color: '#75dff0' });
const hostileShotMaterial = new THREE.MeshBasicMaterial({ color: '#ffc477', toneMapped: false });
const helicopterRocketGeo = new THREE.CylinderGeometry(0.09, 0.12, 1.25, 6, 1);
const helicopterRocketMaterial = new THREE.MeshBasicMaterial({ color: '#d3d3bd', toneMapped: false });

/** Builds air launched cannon rounds, rockets, and missiles. */
export class AirWeaponAI {
  constructor(random = createSeededRandom(DEFAULT_RANDOM_SEED)) {
    this.random = random;
    this._helicopterMissileStart = new THREE.Vector3();
    this._allyGunMuzzle = new THREE.Vector3();
    this._groundGunMuzzle = new THREE.Vector3();
    this._gunMuzzle = new THREE.Vector3();
    this._spread = new THREE.Vector3();
    this._tracerOptions = {};
  }

  fireHelicopterAirMissile(battle, enemy) {
    const stores = enemy.mesh.userData.airToAirStores ?? [];
    const start = this._helicopterMissileStart;
    let foundStore = false;
    for (const store of stores) {
      if (!store.visible) continue;
      store.visible = false;
      store.getWorldPosition(start);
      foundStore = true;
      break;
    }
    if (!foundStore) enemy.mesh.localToWorld(start.set(0, -0.2, -0.7));
    const speed = 455;
    const predicted = leadPoint(start, battle.player.position, battle.playerVelocity, speed, 8,
      enemy.lead, enemy.leadOffset);
    const aim = predicted.sub(start).normalize();
    const mesh = createMissile('#c5c5bc');
    mesh.scale.setScalar(.72);
    mesh.position.copy(start);
    mesh.quaternion.setFromUnitVectors(forward, aim);
    if (mesh.userData.engineFlame) mesh.userData.engineFlame.visible = true;
    battle.scene.add(mesh);
    battle.addHostileProjectile({
      projectile: true,
      missile: true,
      homing: true,
      seeker: 'ir',
      mesh,
      velocity: aim.multiplyScalar(speed),
      speed,
      burnRemaining: 4.2,
      coastDrag: .12,
      motorBurning: true,
      guidanceActive: true,
      guidanceAfterBurnout: true,
      interceptLeadTime: 8,
      turnRate: 1.0,
      coastTurnScale: .62,
      life: 10,
      damage: 37,
      proximityRadius: 25,
      warningClock: 0,
      decoyTarget: null,
      target: battle.player,
    });
    battle.onMissileLaunch?.(enemy, mesh, 'ir');
    battle.audio?.playMissileLaunch();
    battle.audio?.startMissileFlight(mesh.id);
  }

  fireHelicopterRocketSalvo(battle, enemy, target, range) {
    const speed = 260;
    const flightTime = range / speed;
    for (const side of [-1, 1]) {
      const start = enemy.mesh.localToWorld(new THREE.Vector3(side * 2.95, -0.7, -0.1));
      const aim = leadPoint(start, target.mesh.position, target.velocity ?? zeroVelocity, speed, flightTime + 1,
        enemy.lead, enemy.leadOffset);
      const horizontal = Math.hypot(aim.x - start.x, aim.z - start.z);
      const dispersion = Math.min(0.11, 0.035 + range * 0.000012);
      aim.x += (this.random() - 0.5) * horizontal * dispersion;
      aim.y += (this.random() - 0.5) * horizontal * dispersion * 0.28;
      aim.z += (this.random() - 0.5) * horizontal * dispersion;
      const direction = aim.sub(start).normalize();
      const rocket = new THREE.Mesh(helicopterRocketGeo, helicopterRocketMaterial);
      rocket.position.copy(start);
      rocket.quaternion.setFromUnitVectors(projectileAxis, direction);
      battle.scene.add(rocket);
      const velocity = direction.multiplyScalar(speed);
      battle.fx?.addMovingTracer(start, velocity, '#f0a36b', { life: 0.22, trailTime: 0.1 });
      battle.addHostileProjectile({
        projectile: true,
        ground: true,
        aircraftStrafe: true,
        damage: 0.62,
        mesh: rocket,
        velocity,
        life: flightTime + 2.2,
        target,
        sourceUnit: enemy,
      });
    }
    battle.audio?.playDistantGun(range, 'air');
  }

  fireAlly(battle, ally, target) {
    battle.audio?.playDistantGun(ally.mesh.position.distanceTo(battle.player.position), 'air');
    // Match the player's GAU-22/A gun port in the F-35A's local coordinates. The
    // gun round starts at the muzzle; FlightFX clips the visible tracer at the
    // barrel opening so it does not draw through the airframe.
    const start = this._allyGunMuzzle.copy(F35_GUN_MUZZLE_OFFSET)
      .applyQuaternion(ally.mesh.quaternion)
      .add(ally.mesh.position);
    const predicted = leadPoint(start, target.mesh.position, target.velocity, 680, 3);
    const aim = predicted.sub(start).normalize();
    const spread=battle.difficulty?.wingman?.aimSpread ?? 1;
    aim.add(this._spread.set(
      (this.random() - .5) * .012 * spread,
      (this.random() - .5) * .009 * spread,
      (this.random() - .5) * .012 * spread,
    )).normalize();
    const velocity = aim.multiplyScalar(680);
    this._tracerOptions.life = .14;
    this._tracerOptions.trailTime = .06;
    this._tracerOptions.gravity = 0;
    this._tracerOptions.ownerAircraft = ally.mesh;
    this._tracerOptions.aircraftForwardClearance = F35_GUN_TRACER_CLEARANCE;
    battle.fx?.addMovingTracer(start, velocity, '#82e7ff', this._tracerOptions);
    const shot = new THREE.Mesh(allyShotGeo, allyShotMaterial);
    shot.position.copy(start);
    battle.scene.add(shot);
    battle.addPlayerProjectile({ mesh: shot, velocity, life: 4, damage: .42 * (battle.difficulty?.wingman?.damage ?? 1), ally: true, sourceUnit: ally });
  }

  fireAllyAirMissile(battle, ally, target) {
    const profile = MISSILE_PROFILES.playerAir;
    const start = ally.mesh.position.clone().add(
      new THREE.Vector3(0, -.08, 3.8).applyQuaternion(ally.mesh.quaternion),
    );
    const predicted = leadPoint(start, target.mesh.position, target.velocity ?? zeroVelocity, profile.speed, 10);
    const aim = predicted.sub(start).normalize();
    const mesh = createMissile('#c8cbc0');
    mesh.position.copy(start);
    mesh.quaternion.setFromUnitVectors(forward, aim);
    battle.scene.add(mesh);
    if (mesh.userData.engineFlame) mesh.userData.engineFlame.visible = true;
    battle.audio?.playMissileLaunch();
    battle.audio?.startMissileFlight(mesh.id);
    battle.addPlayerProjectile({
      projectile: true, missile: true, homing: true, seeker: profile.seeker, mesh,
      velocity: aim.multiplyScalar(profile.speed), speed: profile.speed, turnRate: profile.turnRate, life: profile.life,
      burnRemaining: profile.burnTime, coastDrag: profile.coastDrag, motorBurning: true,
      guidanceActive: true, damage: 3.8, proximityRadius: profile.proximityRadius,
      proximityDamage: profile.proximityDamage, target, targetDomain: 'air', decoyTarget: null,
      decoyAttempts: new Set(), trail: 0, ally: true, sourceUnit: ally,
    });
    battle.onWingmanRadio?.('rifle', ally, { scope: String(target.mesh.id), target });
  }

  fireAllyGround(battle, ally, target) {
    const start = this._groundGunMuzzle.set(-.78, .38, 2.65)
      .applyQuaternion(ally.mesh.quaternion)
      .add(ally.mesh.position);
    const predicted = leadPoint(start, target.mesh.position, target.velocity ?? zeroVelocity, 880, 3);
    const flightTime = Math.min(3, start.distanceTo(predicted) / 880);
    predicted.y += .5 * 9.81 * flightTime * flightTime;
    const aim = predicted.sub(start).normalize();
    aim.add(this._spread.set(
      (this.random() - .5) * .018,
      (this.random() - .5) * .012,
      (this.random() - .5) * .018,
    )).normalize();
    const velocity = aim.multiplyScalar(880).add(ally.velocity);
    battle.audio?.playDistantGun(ally.mesh.position.distanceTo(battle.player.position), 'air');
    ally.groundRoundCount++;
    if (ally.groundRoundCount % 3 === 0) {
      this._tracerOptions.life = .14;
      this._tracerOptions.trailTime = .06;
      this._tracerOptions.gravity = 9.81;
      this._tracerOptions.ownerAircraft = ally.mesh;
      this._tracerOptions.aircraftForwardClearance = 7.2;
      battle.fx?.addMovingTracer(start, velocity, '#ffd282', this._tracerOptions);
    }
    const shot = new THREE.Mesh(allyShotGeo, allyShotMaterial);
    shot.position.copy(start);
    battle.scene.add(shot);
    battle.addPlayerProjectile({
      mesh: shot, velocity, life: 3.3, damage: .42 * (battle.difficulty?.wingman?.damage ?? 1),
      gravity: 9.81, ballistic: true, canHitGround: true, ally: true, sourceUnit: ally,
    });
  }

  fireAllyMaverick(battle, ally, target) {
    const profile = MISSILE_PROFILES.playerGround;
    const start = ally.mesh.position.clone().add(
      new THREE.Vector3(0, -.1, 3.2).applyQuaternion(ally.mesh.quaternion),
    );
    const predicted = leadPoint(start, target.mesh.position, target.velocity ?? zeroVelocity, profile.speed, 6);
    const aim = predicted.sub(start).normalize();
    const mesh = createMissile('#c8cbc0');
    mesh.position.copy(start);
    mesh.quaternion.setFromUnitVectors(forward, aim);
    battle.scene.add(mesh);
    if (mesh.userData.engineFlame) mesh.userData.engineFlame.visible = true;
    battle.audio?.playMissileLaunch();
    battle.audio?.startMissileFlight(mesh.id);
    battle.addPlayerProjectile({
      projectile: true, missile: true, homing: true, seeker: profile.seeker, mesh,
      velocity: aim.multiplyScalar(profile.speed), speed: profile.speed, turnRate: profile.turnRate, life: profile.life,
      burnRemaining: profile.burnTime, coastDrag: profile.coastDrag, motorBurning: true,
      guidanceActive: true, damage: profile.damage, proximityRadius: profile.proximityRadius,
      proximityDamage: profile.proximityDamage, target, targetDomain: 'ground', decoyTarget: null,
      decoyAttempts: new Set(), trail: 0, ally: true, sourceUnit: ally,
    });
    battle.onWingmanRadio?.('rifle', ally, { scope: String(target.mesh.id), target });
  }

  fireEnemy(battle, enemy, target = battle.player, domain = 'air') {
    const targetMesh = target === battle.player ? battle.player : target?.mesh;
    if (!targetMesh) return;
    battle.audio?.playDistantGun(enemy.mesh.position.distanceTo(targetMesh.position), 'air');
    const clearance = enemy.mesh.userData.aircraftForwardClearance ?? 7.2;
    const start = enemy.mesh.localToWorld(this._gunMuzzle.set(.42, -.16, Math.max(2.8, clearance * .62)));
    const targetPosition = target === battle.player ? battle.player.position : targetMesh.position;
    const targetVelocity = target === battle.player ? battle.playerVelocity : target.velocity ?? zeroVelocity;
    const predicted = leadPoint(start, targetPosition, targetVelocity, 720, battle.difficulty?.fighter?.gun?.leadTime ?? 4.5);
    const aim = predicted.sub(start).normalize();
    const spread=battle.difficulty?.fighter?.aimSpread ?? 1;
    aim.add(this._spread.set(
      (this.random() - .5) * .018 * spread,
      (this.random() - .5) * .012 * spread,
      (this.random() - .5) * .018 * spread,
    )).normalize();
    const shot = new THREE.Mesh(hostileShotGeo, hostileShotMaterial);
    shot.position.copy(start);
    shot.quaternion.setFromUnitVectors(projectileAxis, aim);
    battle.scene.add(shot);
    const velocity = aim.multiplyScalar(720);
    this._tracerOptions.life = .14;
    this._tracerOptions.trailTime = .045;
    this._tracerOptions.gravity = 0;
    this._tracerOptions.ownerAircraft = enemy.mesh;
    this._tracerOptions.aircraftForwardClearance = clearance;
    battle.fx?.addMovingTracer(start, velocity, '#ffc477', this._tracerOptions);
    battle.addHostileProjectile({
      projectile: true,
      aircraftGun: domain !== 'ground',
      ground: domain === 'ground',
      aircraftStrafe: domain === 'ground',
      damage: domain === 'ground' ? .18 : .85,
      mesh: shot,
      velocity,
      life: 4,
      target: domain === 'ground' ? target : undefined,
      sourceUnit: enemy,
    });
  }

  chooseHostileMissileSeeker() {
    return this.random() < .5 ? 'ir' : 'radar';
  }

  launchEnemyMissile(battle, enemy, seeker = this.chooseHostileMissileSeeker(), target = battle.player) {
    const direction = forward.clone().applyQuaternion(enemy.mesh.quaternion).normalize();
    const start = enemy.mesh.position.clone().addScaledVector(direction, 5);
    const missileProfile = MISSILE_PROFILES.hostile;
    const missileSpeed = battle.difficulty?.fighter?.missile?.projectile?.speed ?? missileProfile.speed;
    const targetPosition = target === battle.player ? battle.player.position : target.mesh.position;
    const targetVelocity = target === battle.player ? battle.playerVelocity : target.velocity ?? zeroVelocity;
    const predicted = leadPoint(
      start,
      targetPosition,
      targetVelocity,
      missileSpeed,
      battle.difficulty?.fighter?.missile?.leadTime ?? 12,
    );
    const aim = predicted.sub(start).normalize();
    const mesh = createMissile('#c5c5bc');
    mesh.position.copy(start);
    mesh.quaternion.setFromUnitVectors(forward, aim);
    battle.scene.add(mesh);
    if (mesh.userData.engineFlame) mesh.userData.engineFlame.visible = true;
    battle.addHostileProjectile({
      projectile: true,
      missile: true,
      homing: true,
      seeker,
      mesh,
      velocity: aim.multiplyScalar(missileSpeed),
      speed: missileSpeed,
      burnRemaining: battle.difficulty?.fighter?.missile?.projectile?.burnTime ?? missileProfile.burnTime,
      coastDrag: battle.difficulty?.fighter?.missile?.projectile?.coastDrag ?? missileProfile.coastDrag,
      motorBurning: true,
      guidanceActive: true,
      guidanceAfterBurnout: true,
      interceptLeadTime: 14,
      turnRate: battle.difficulty?.fighter?.missile?.projectile?.turnRate ?? 1.45,
      coastTurnScale: .58,
      life: battle.difficulty?.fighter?.missile?.projectile?.life ?? missileProfile.life,
      damage: battle.difficulty?.fighter?.missile?.projectile?.damage ?? 62,
      proximityRadius: battle.difficulty?.fighter?.missile?.projectile?.proximityRadius ?? 20,
      warningClock: 0,
      decoyTarget: null,
      target,
    });
    battle.onMissileLaunch?.(enemy, mesh, seeker, target);
    battle.audio?.playMissileLaunch();
    battle.audio?.startMissileFlight(mesh.id);
  }
}
