import * as THREE from 'three';
import { disposeAircraftVisual } from '../aircraft/plane.js';
import { forwardOfHeading, rightOfHeading } from './air-combat-utils.js';
import { AirSpawnSystem } from './air-spawn-system.js';
import { HostileFighterAI } from './hostile-fighter-ai.js';
import { HelicopterAI } from './helicopter-ai.js';
import { WingmanController } from './wingman-controller.js';
import { AirWeaponAI } from './air-weapon-ai.js';

/** Coordinates air units and advances their behavior in simulation order. */
export class AirBattle {
  constructor({ scene, player, aircraftAsset, mission, terrain, audio, fx, playerVelocity, getPlayerHeading, deployHostileCountermeasures, addHostileProjectile, addPlayerProjectile, onMissileLaunch, onWingmanRadio, difficulty = {}, random = Math.random }) {
    this.scene = scene;
    this.player = player;
    this.aircraftAssets = aircraftAsset;
    this.mission = mission;
    this.terrain = terrain ?? null;
    this.audio = audio;
    this.fx = fx;
    this.playerVelocity = playerVelocity;
    this.currentPlayerHeading = getPlayerHeading;
    this.deployHostileCountermeasures = deployHostileCountermeasures;
    this.addHostileProjectile = addHostileProjectile;
    this.addPlayerProjectile = addPlayerProjectile;
    this.onMissileLaunch = onMissileLaunch;
    this.onWingmanRadio = onWingmanRadio;
    this.difficulty = difficulty;
    this.random = random;
    this._playerForward = new THREE.Vector3();
    this._playerRight = new THREE.Vector3();
    this.enemies = [];
    this.allies = [];
    this.groundUnits = [];
    this.friendlyGroundUnits = [];
    this.wingmanOrder = 'attack';
    this.hostilesSpawned = false;
    this.spawnSystem = new AirSpawnSystem();
    this.hostileFighterAI = new HostileFighterAI(random);
    this.helicopterAI = new HelicopterAI();
    this.wingmanController = new WingmanController();
    this.weaponAI = new AirWeaponAI(random);
    this.spawn();
  }

  spawn() {
    this.spawnSystem.spawn(this);
  }

  spawnHostiles(heading = this.currentPlayerHeading(), playerForward = forwardOfHeading(heading), playerRight = rightOfHeading(heading)) {
    return this.spawnSystem.spawnHostiles(this, heading, playerForward, playerRight);
  }

  update(dt, playerThreat = {}) {
    const heading = this.currentPlayerHeading();
    const playerForward = forwardOfHeading(heading, this._playerForward);
    const playerRight = rightOfHeading(heading, this._playerRight);
    this.hostileFighterAI.update(this, dt, playerForward, playerRight, playerThreat);
    this.wingmanController.update(this, dt, playerForward, playerRight);
  }

  setFriendlyGroundUnits(units) {
    this.friendlyGroundUnits = units ?? [];
  }

  getWingmanController() {
    this.wingmanController ??= new WingmanController();
    return this.wingmanController;
  }

  setGroundUnits(units) {
    this.getWingmanController().setGroundUnits(this, units);
  }

  issueWingmanOrder(order) {
    return this.getWingmanController().issueWingmanOrder(this, order);
  }

  damageWingman(ally, damage, sourceUnit = null) {
    this.getWingmanController().damageWingman(this, ally, damage, sourceUnit);
  }

  closestWingmanTo(position) {
    return this.getWingmanController().closestWingmanTo(this, position);
  }

  dispose() {
    for (const unit of this.enemies) {
      this.scene.remove(unit.mesh);
      this.fx?.forgetAircraft(unit.mesh);
      disposeAircraftVisual(unit.mesh);
    }
    for (const unit of this.allies) {
      this.scene.remove(unit.mesh);
      this.fx?.forgetAircraft(unit.mesh);
      disposeAircraftVisual(unit.mesh);
    }
    this.enemies.length = 0;
    this.allies.length = 0;
  }
}
