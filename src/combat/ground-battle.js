import * as THREE from 'three';
import { disposeGroundVehicleVisual } from '../ground/vehicles.js';
import { GroundSpawnSystem } from './ground-spawn-system.js';
import { GroundUnitAI } from './ground-unit-ai.js';
import { GroundMovementAI } from './ground-movement-ai.js';
import { GroundWeaponSystem } from './ground-weapon-system.js';
import { GroundAirDefenseAI } from './ground-air-defense-ai.js';
import { createSeededRandom, DEFAULT_RANDOM_SEED } from './random.js';

// Beyond 8 km even a 10 m vehicle is about one pixel tall at the default 1080p FOV.
const GROUND_VEHICLE_RENDER_DISTANCE = 8_000;
const GROUND_VISIBILITY_UPDATE_INTERVAL = 0.25;

/** Owns battlefield state and coordinates ground-unit simulation updates. */
export class GroundBattle {
  constructor({ scene, player, playerVelocity, terrain, mission, audio, fx, difficulty = {}, enemies = [], addProjectile, addFriendlyProjectile, random = createSeededRandom(DEFAULT_RANDOM_SEED), spawnRandom = random, onOperationalEvent = () => {} }) {
    this.scene = scene;
    this.player = player;
    this.playerVelocity = playerVelocity;
    this.terrain = terrain;
    this.mission = mission;
    this.audio = audio;
    this.fx = fx;
    this.difficulty = difficulty;
    this.random = random;
    this.spawnRandom = spawnRandom;
    this.enemies = enemies;
    this.addProjectile = addProjectile;
    this.addFriendlyProjectile = addFriendlyProjectile;
    this.onOperationalEvent = onOperationalEvent;
    this.friends = [];
    this.redUnits = [];
    this.colliders = [];
    this.airDefenseActive = false;
    this.mlrsSalvosTotal = mission.groundMlrsManual ? 2 : 0;
    this.mlrsSalvosUsed = 0;
    this.mlrsPending = null;
    this.routeForward = new THREE.Vector3(0, 0, 1).applyQuaternion(player.quaternion);
    this.routeForward.y = 0;
    if (this.routeForward.lengthSq() < 1e-6) this.routeForward.set(0, 0, 1);
    else this.routeForward.normalize();
    this.routeRight = new THREE.Vector3(1, 0, 0).applyQuaternion(player.quaternion);
    this.routeRight.y = 0;
    if (this.routeRight.lengthSq() < 1e-6) this.routeRight.set(1, 0, 0);
    else this.routeRight.normalize();
    const theaterHalf = (this.terrain?.worldSize ?? 32000) * .5;
    const ingressDistance = Math.min(
      mission.navigationDistance ?? 4200,
      Math.max(900, theaterHalf * .55),
    );
    // Leave a short setup leg between the ingress waypoint and the front.
    const battlefieldIngressOffset = Math.max(0, mission.battlefieldIngressOffset ?? 0);
    const campaignFrontOffset = mission.campaignDefenseFrontOffset ?? 0;
    this.battleCenter = player.position.clone().addScaledVector(
      this.routeForward,
      ingressDistance + battlefieldIngressOffset + campaignFrontOffset,
    );
    this.spawnSystem = new GroundSpawnSystem();
    this.unitAI = new GroundUnitAI(random);
    this.movementAI = new GroundMovementAI();
    this.weaponAI = new GroundWeaponSystem(random);
    this.airDefenseAI = new GroundAirDefenseAI(random);
    this.spawn();
    this.groundUnits = [...this.friends, ...this.redUnits];
    this.groundVisibilityElapsed = GROUND_VISIBILITY_UPDATE_INTERVAL;
  }

  setAirDefenseActive(active = true) {
    this.airDefenseActive = Boolean(active);
  }

  spawn() {
    this.spawnSystem.spawn(this);
  }

  update(dt) {
    this.updateMlrsSupport(dt);
    this.unitAI.update(this, dt);
    this.groundVisibilityElapsed += Math.max(0, dt);
    if (this.groundVisibilityElapsed < GROUND_VISIBILITY_UPDATE_INTERVAL) return;
    this.groundVisibilityElapsed %= GROUND_VISIBILITY_UPDATE_INTERVAL;

    const maxDistanceSq = GROUND_VEHICLE_RENDER_DISTANCE ** 2;
    for (const unit of this.groundUnits) {
      if (unit.dead) continue;
      const shouldRender = unit.mesh.position.distanceToSquared(this.player.position) <= maxDistanceSq;
      if (unit.mesh.visible !== shouldRender) unit.mesh.visible = shouldRender;
    }
  }

  getSupportState() {
    return {
      mlrsReady: this.mlrsSalvosTotal > 0 && this.mlrsSalvosUsed < this.mlrsSalvosTotal,
      mlrsSalvosUsed: this.mlrsSalvosUsed,
      mlrsSalvosTotal: this.mlrsSalvosTotal,
      mlrsPending: Boolean(this.mlrsPending),
    };
  }

  requestMlrsFire(target) {
    if (this.mlrsSalvosTotal <= 0) return { accepted: false, reasonKey: 'combat.mlrsRequestUnavailable' };
    if (this.mlrsPending) return { accepted: false, reasonKey: 'combat.mlrsRequestPending' };
    if (this.mlrsSalvosUsed >= this.mlrsSalvosTotal) return { accepted: false, reasonKey: 'combat.mlrsRequestEmpty' };
    const unit = this.friends.find(candidate => (
      !candidate.dead && candidate.role === 'artillery' && candidate.armed !== false
    ));
    if (!unit) return { accepted: false, reasonKey: 'combat.mlrsUnitLost' };
    if (!target || target.dead || target.team !== 'red' || target.armed === false) {
      return { accepted: false, reasonKey: 'combat.mlrsInvalidTarget' };
    }
    if (unit.mesh.position.distanceTo(target.mesh.position) > 18_000) {
      return { accepted: false, reasonKey: 'combat.mlrsOutOfRange' };
    }
    this.mlrsPending = { unit, target, remaining: 2.4 };
    this.onOperationalEvent('mlrs.requested', { unit, target });
    return { accepted: true };
  }

  updateMlrsSupport(dt) {
    if (!this.mlrsPending) return;
    this.mlrsPending.remaining -= Math.max(0, Number.isFinite(dt) ? dt : 0);
    if (this.mlrsPending.remaining > 0) return;
    const { unit, target } = this.mlrsPending;
    this.mlrsPending = null;
    if (unit.dead || target.dead || target.team !== 'red' || target.armed === false) {
      this.onOperationalEvent('mlrs.failed', { unit, target });
      return;
    }
    this.weaponAI.fireMlrs(this, unit, target);
    this.mlrsSalvosUsed++;
    this.onOperationalEvent('mlrs.fired', { unit, target, salvosRemaining: this.mlrsSalvosTotal - this.mlrsSalvosUsed });
  }

  dispose() {
    for (const unit of this.groundUnits) {
      this.scene.remove(unit.mesh);
      disposeGroundVehicleVisual(unit.mesh);
    }
    this.friends.length = 0;
    this.redUnits.length = 0;
    this.groundUnits.length = 0;
    this.colliders.length = 0;
  }
}
