import * as THREE from 'three';
import { F35_GUN_MUZZLE_OFFSET, F35_GUN_TRACER_CLEARANCE } from '../aircraft/plane-models.js';
import { createMissile, MISSILE_PROFILES } from './projectiles.js';
import {
  GUN_PROJECTILE_GRAVITY,
  GUN_PROJECTILE_LIFETIME,
  GUN_PROJECTILE_SPEED,
  GUN_ROUNDS_PER_SECOND,
} from './ballistics.js';

const gunTracerRoundGeo = new THREE.CylinderGeometry(.004, .012, .16, 6);
const gunTracerRoundMaterial = new THREE.MeshBasicMaterial({ color: '#ffc45e', toneMapped: false });
const forward = new THREE.Vector3(0, 0, 1);
const localRight = new THREE.Vector3(1, 0, 0);
const localUp = new THREE.Vector3(0, 1, 0);
const localBulletAxis = new THREE.Vector3(0, 1, 0);
const tracerDirection=new THREE.Vector3();

/** Owns trigger cadence, weapon selection gates, ammunition and launch feedback. */
export class WeaponSystem {
  constructor({ player, scene, fx, audio, radar, playerVelocity, addProjectile }) {
    this.player = player;
    this.scene = scene;
    this.fx = fx;
    this.audio = audio;
    this.radar = radar;
    this.playerVelocity = playerVelocity;
    this.addProjectile = addProjectile;
    this.missiles = { air: MISSILE_PROFILES.playerAir.count, ground: MISSILE_PROFILES.playerGround.count };
    this.cooldown = 0;
    this.gunClock = 0;
    this.gunRoundCount = 0;
    this.missilesFired = 0;
    this.freeGunRounds=[];
    this.freeTracerRounds=[];
    this._direction=new THREE.Vector3();
    this._right=new THREE.Vector3();
    this._up=new THREE.Vector3();
    this._muzzleOffset=new THREE.Vector3();
    this._start=new THREE.Vector3();
    this.missileFeedbackKey = null;
    this.missileFeedbackTimer = 0;
  }

  update(dt, { gunFiring = false, missileRequested = false } = {}) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.missileFeedbackTimer = Math.max(0, this.missileFeedbackTimer - dt);
    this.audio?.setGunFiring(gunFiring);
    if (gunFiring) {
      this.gunClock -= dt;
      let roundsThisFrame = 0;
      while (this.gunClock <= 0 && roundsThisFrame < 3) {
        this.fireGun();
        this.gunClock += 1 / GUN_ROUNDS_PER_SECOND;
        roundsThisFrame++;
      }
    } else {
      this.gunClock = 0;
    }
    if (missileRequested) this.requestMissile();
  }

  stopGun() {
    this.audio?.setGunFiring(false);
    this.gunClock = 0;
  }

  clearFeedback() {
    this.missileFeedbackKey = null;
    this.missileFeedbackTimer = 0;
  }

  showFeedback(key, duration) {
    this.missileFeedbackKey = key;
    this.missileFeedbackTimer = duration;
    this.audio?.playWeaponNoLock();
  }

  fireGun() {
    const attitude = this.player.quaternion;
    const direction = this._direction.copy(forward).applyQuaternion(attitude).normalize();
    const right = this._right.copy(localRight).applyQuaternion(attitude).normalize();
    const up = this._up.copy(localUp).applyQuaternion(attitude).normalize();
    direction
      .addScaledVector(right, (Math.random() - .5) * .0009)
      .addScaledVector(up, (Math.random() - .5) * .0009)
      .normalize();
    const muzzleOffset = this._muzzleOffset.set(
      F35_GUN_MUZZLE_OFFSET.x,
      F35_GUN_MUZZLE_OFFSET.y,
      F35_GUN_MUZZLE_OFFSET.z,
    ).applyQuaternion(attitude);
    const start = this._start.copy(this.player.position).add(muzzleOffset);
    const tracer = this.gunRoundCount++ % 4 === 0;
    const pool=tracer?this.freeTracerRounds:this.freeGunRounds;
    const shot=pool.pop()??{
      mesh:tracer?new THREE.Mesh(gunTracerRoundGeo,gunTracerRoundMaterial):new THREE.Object3D(),
      velocity:new THREE.Vector3(),pool,
    };
    shot.tracer=tracer;
    shot.ballistic=true;
    shot.gravity=GUN_PROJECTILE_GRAVITY;
    shot.life=GUN_PROJECTILE_LIFETIME;
    shot.damage=.34;
    shot.ally=false;
    shot.target=null;
    shot.mesh.position.copy(start);
    const velocity = shot.velocity.copy(direction).multiplyScalar(GUN_PROJECTILE_SPEED).add(this.playerVelocity);
    if (tracer) {
      const shotDirection=tracerDirection.copy(velocity).normalize();
      shot.mesh.quaternion.setFromUnitVectors(localBulletAxis,shotDirection);
      this.scene.add(shot.mesh);
      // Keep the visible streak at the barrel opening while clipping any part
      // that has not yet cleared the airframe. Projectile physics still start
      // at the exact muzzle position.
      this.fx?.addMovingTracer(start, velocity, '#ffd282', {
        life: .14,
        trailTime: .06,
        gravity: GUN_PROJECTILE_GRAVITY,
        ownerAircraft: this.player,
        aircraftForwardClearance: F35_GUN_TRACER_CLEARANCE,
      });
    }
    this.addProjectile(shot);
  }

  fireMissile() {
    if (!this.radar.target || this.radar.target.dead) return false;
    const targetDomain = this.radar.targetDomain;
    const missileProfile = targetDomain === 'ground' ? MISSILE_PROFILES.playerGround : MISSILE_PROFILES.playerAir;
    this.missiles[targetDomain]--;
    this.missilesFired++;
    this.cooldown = 2.8;
    this.clearFeedback();
    const direction = forward.clone().applyQuaternion(this.player.quaternion).normalize();
    const mesh = createMissile('#d3d9d2');
    mesh.position.copy(this.player.position).addScaledVector(direction, 5);
    mesh.quaternion.setFromUnitVectors(forward, direction);
    this.scene.add(mesh);
    this.audio?.playMissileLaunch();
    this.audio?.startMissileFlight(mesh.id);
    if (mesh.userData.engineFlame) mesh.userData.engineFlame.visible = true;
    this.addProjectile({
      mesh,
      velocity: direction.clone().multiplyScalar(missileProfile.speed),
      speed: missileProfile.speed,
      turnRate: missileProfile.turnRate,
      life: missileProfile.life,
      burnRemaining: missileProfile.burnTime,
      coastDrag: missileProfile.coastDrag,
      motorBurning: true,
      guidanceActive: true,
      damage: missileProfile.damage,
      proximityRadius: missileProfile.proximityRadius,
      proximityDamage: missileProfile.proximityDamage,
      homing: true,
      target: this.radar.target,
      targetDomain,
      seeker: missileProfile.seeker,
      decoyTarget: null,
      decoyAttempts: new Set(),
      trail: 0,
    });
    return true;
  }

  requestMissile() {
    const mode = this.radar.mode;
    if (this.cooldown > 0 || this.missiles[mode] <= 0) {
      this.audio?.playWeaponNoLock();
      return false;
    }
    if (!this.radar.target || this.radar.target.dead) {
      this.showFeedback('combat.aimAtHostile', 1.5);
      return false;
    }
    if (!this.radar.targetInSensorRange) {
      this.showFeedback('combat.sensorReacquire', 1.5);
      return false;
    }
    if (!this.radar.inLockEnvelope) {
      this.showFeedback('combat.outOfRange', 1.5);
      return false;
    }
    if (!this.radar.lockCueConfirmed) {
      this.showFeedback('combat.lockNotReady', 1.3);
      return false;
    }
    return this.fireMissile();
  }
}
