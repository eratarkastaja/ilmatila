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
  constructor({ scene, player, playerVelocity, terrain, mission, audio, fx, difficulty = {}, enemies = [], addProjectile, addFriendlyProjectile, random = createSeededRandom(DEFAULT_RANDOM_SEED) }) {
    this.scene = scene;
    this.player = player;
    this.playerVelocity = playerVelocity;
    this.terrain = terrain;
    this.mission = mission;
    this.audio = audio;
    this.fx = fx;
    this.difficulty = difficulty;
    this.random = random;
    this.enemies = enemies;
    this.addProjectile = addProjectile;
    this.addFriendlyProjectile = addFriendlyProjectile;
    this.friends = [];
    this.redUnits = [];
    this.colliders = [];
    this.airDefenseActive = false;
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
    this.battleCenter = player.position.clone().addScaledVector(
      this.routeForward,
      ingressDistance + battlefieldIngressOffset,
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
