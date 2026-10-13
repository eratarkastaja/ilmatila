import * as THREE from 'three';
import { disposeAircraftVisual } from '../aircraft/plane.js';
import { forwardOfHeading, rightOfHeading, wrapAngle } from './air-combat-utils.js';
import { AirSpawnSystem } from './air-spawn-system.js';
import { HostileFighterAI } from './hostile-fighter-ai.js';
import { HelicopterAI } from './helicopter-ai.js';
import { WingmanController } from './wingman-controller.js';
import { AirWeaponAI } from './air-weapon-ai.js';
import { createSeededRandom, DEFAULT_RANDOM_SEED } from './random.js';

const EMPTY_PLAYER_THREAT = Object.freeze({});
// Keep scheduled reinforcements readable on radar before normal combat behavior starts.
const POP_UP_IDENTIFICATION_DELAY = 5;

/** Coordinates air units and advances their behavior in simulation order. */
export class AirBattle {
  constructor({ scene, player, aircraftAsset, mission, terrain, audio, fx, playerVelocity, getPlayerHeading, deployHostileCountermeasures, addHostileProjectile, addPlayerProjectile, onMissileLaunch, onWingmanRadio, onPopUpThreat, onOperationalEvent, canStartHostileMissileAttack, difficulty = {}, random = createSeededRandom(DEFAULT_RANDOM_SEED), spawnRandom = random }) {
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
    this.onPopUpThreat = onPopUpThreat;
    this.onOperationalEvent = onOperationalEvent;
    this.canStartHostileMissileAttack = canStartHostileMissileAttack;
    this.difficulty = difficulty;
    this.random = random;
    // Formation placement has its own deterministic stream so terrain-clamped
    // bearing/range variation cannot shift combat AI or weapon rolls.
    this.spawnRandom = spawnRandom;
    this.reinforcementIdentificationElapsed = 0;
    this.unidentifiedReinforcements = [];
    this._playerForward = new THREE.Vector3();
    this._playerRight = new THREE.Vector3();
    this._nonCombatantVelocity = new THREE.Vector3();
    this.operationalState = {
      identifiedCount: 0,
      contactCount: 0,
      escortElapsed: 0,
    };
    this.enemies = [];
    this.allies = [];
    this.groundUnits = [];
    this.friendlyGroundUnits = [];
    // Strike aircraft keep a stable aim point even if ownship later moves away.
    this.strikeTarget = player.position.clone();
    this.wingmanOrder = mission.wingmanInitialOrder ?? 'attack';
    this.hostilesSpawned = false;
    this.hostileProjectiles = [];
    this.spawnSystem = new AirSpawnSystem();
    this.hostileFighterAI = new HostileFighterAI(random);
    this.helicopterAI = new HelicopterAI(random);
    this.wingmanController = new WingmanController(random);
    this.weaponAI = new AirWeaponAI(random);
    this.spawn();
  }

  spawn() {
    this.spawnSystem.spawn(this);
  }

  spawnHostiles(heading = this.currentPlayerHeading(), playerForward = forwardOfHeading(heading), playerRight = rightOfHeading(heading)) {
    return this.spawnSystem.spawnHostiles(this, heading, playerForward, playerRight);
  }

  spawnEncounter(event) {
    const previousCount = this.enemies.length;
    const spawned = this.spawnSystem.spawnEncounter(this, event);
    if (!spawned) return false;
    this.unidentifiedReinforcements = this.enemies.slice(previousCount);
    for (const enemy of this.unidentifiedReinforcements) {
      enemy.identified = false;
      enemy.popUpContact = true;
    }
    this.reinforcementIdentificationElapsed = 0;
    this.onPopUpThreat?.('newContact', this.unidentifiedReinforcements);
    return true;
  }

  update(dt, playerThreat = EMPTY_PLAYER_THREAT) {
    const delta = Math.max(0, Number.isFinite(dt) ? dt : 0);
    if (this.unidentifiedReinforcements.length) {
      // The radar return closes on ownship, but both hostile and wingman AI stay gated.
      for (const enemy of this.unidentifiedReinforcements) {
        if (enemy.dead) continue;
        enemy.mesh.position.addScaledVector(enemy.velocity, delta);
      }
      this.reinforcementIdentificationElapsed += delta;
      if (this.reinforcementIdentificationElapsed >= POP_UP_IDENTIFICATION_DELAY) {
        for (const enemy of this.unidentifiedReinforcements) enemy.identified = true;
        const units = this.unidentifiedReinforcements.filter(enemy => !enemy.dead);
        this.unidentifiedReinforcements = [];
        if (units.length) this.onPopUpThreat?.('identified', units);
      }
    }
    const heading = this.currentPlayerHeading();
    const playerForward = forwardOfHeading(heading, this._playerForward);
    const playerRight = rightOfHeading(heading, this._playerRight);
    this.updateNonCombatants(delta, playerForward);
    this.hostileFighterAI.update(this, dt, playerForward, playerRight, playerThreat);
    this.wingmanController.update(this, dt, playerForward, playerRight);
  }

  updateNonCombatants(dt, playerForward) {
    const objective = this.mission.objective;
    if (objective?.type !== 'airPolicing') return;
    let contactCount = 0;
    let identifiedCount = 0;
    let escortedCount = 0;
    const identifyRange = objective.identifyRange ?? 3200;
    const identifyDuration = objective.identifyDuration ?? 3;
    const escortRange = objective.escortRange ?? 4200;

    for (const contact of this.enemies) {
      if (contact.dead || contact.combatant !== false) continue;
      contactCount++;
      const range = contact.mesh.position.distanceTo(this.player.position);
      if (!contact.identified) {
        contact.identificationProgress = range <= identifyRange
          ? Math.min(identifyDuration, (contact.identificationProgress ?? 0) + dt)
          : Math.max(0, (contact.identificationProgress ?? 0) - dt * .5);
        if (contact.identificationProgress >= identifyDuration) {
          contact.identified = true;
          contact.radarTeam = 'neutral';
          this.onOperationalEvent?.('airPolicing.identified', contact);
        }
      }

      if (contact.identified) {
        identifiedCount++;
        // Once inspected, the intruder turns onto a predictable outbound track
        // so the player can hold an arcade-length escort instead of chasing a merge.
        this._nonCombatantVelocity.copy(playerForward).multiplyScalar(255);
        contact.velocity.lerp(this._nonCombatantVelocity, Math.min(1, dt * .7));
        contact.heading = wrapAngle(Math.atan2(contact.velocity.x, contact.velocity.z));
        contact.mesh.rotation.y = contact.heading;
        if (range <= escortRange) escortedCount++;
      }
      contact.mesh.position.addScaledVector(contact.velocity, dt);
    }

    const requiredContacts = Math.min(contactCount, objective.requiredContacts ?? contactCount);
    const escortActive = identifiedCount >= requiredContacts && escortedCount >= requiredContacts;
    this.operationalState.contactCount = contactCount;
    this.operationalState.identifiedCount = identifiedCount;
    this.operationalState.escortElapsed = escortActive
      ? Math.min(objective.escortDuration ?? 15, this.operationalState.escortElapsed + dt)
      : Math.max(0, this.operationalState.escortElapsed - dt);
  }

  getOperationalState(target = {}) {
    target.identifiedCount = this.operationalState.identifiedCount;
    target.contactCount = this.operationalState.contactCount;
    target.escortElapsed = this.operationalState.escortElapsed;
    return target;
  }

  setFriendlyGroundUnits(units) {
    this.friendlyGroundUnits = units ?? [];
    if (!this.friendlyGroundUnits.length) {
      this.strikeTarget.copy(this.player.position);
      return;
    }
    this.strikeTarget.set(0, 0, 0);
    let targetCount = 0;
    for (const unit of this.friendlyGroundUnits) {
      if (unit.dead || unit.armed === false || !unit.mesh?.position) continue;
      this.strikeTarget.add(unit.mesh.position);
      targetCount++;
    }
    if (targetCount > 0) this.strikeTarget.multiplyScalar(1 / targetCount);
    else this.strikeTarget.copy(this.player.position);
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

  setHostileProjectiles(projectiles) {
    this.hostileProjectiles = projectiles ?? [];
  }

  reportWingmanMissileLock(enemy, ally) {
    this.getWingmanController().beginMissileLock(this, ally, enemy);
  }

  clearWingmanMissileLock(enemy, ally) {
    this.getWingmanController().clearMissileLock(ally, enemy);
  }

  reportWingmanMissileInbound(enemy, ally, missile) {
    this.getWingmanController().reportMissileInbound(this, ally, enemy, missile);
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
