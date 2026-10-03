import * as THREE from 'three';
import { createFighter } from '../aircraft/plane.js';
import { createMi24AttackHelicopter } from '../aircraft/rotorcraft.js';
import {
  ENEMY_ATTACK_RUNS, flightDirection, forwardOfHeading,
  getAircraftEdgeMargin, planAirFormation, rightOfHeading, wrapAngle,
} from './air-combat-utils.js';

/** Creates and places player support and hostile aircraft. */
export class AirSpawnSystem {
  spawn(battle) {
    const heading = battle.currentPlayerHeading();
    const playerForward = forwardOfHeading(heading);
    const playerRight = rightOfHeading(heading);
    if (!battle.mission.deferredHostiles) battle.spawnHostiles(heading, playerForward, playerRight);

    for (let i = 0; i < battle.mission.wingmen; i++) {
      const wing = i === 0 ? -1 : 1;
      const jet = createFighter({ friendly: true, aircraftAsset: battle.aircraftAssets?.player });
      jet.position.copy(battle.player.position)
        .addScaledVector(playerRight, wing * 230)
        .addScaledVector(playerForward, -300);
      jet.position.y += wing * 28 + 24;
      jet.rotation.order = 'YXZ';
      jet.rotation.y = heading;
      jet.scale.setScalar(1);
      battle.scene.add(jet);
      battle.allies.push({
        mesh: jet,
        radioId: `wingman${i + 1}`,
        wing,
        fireCooldown: 1.2 + i * .6,
        burstClock: 0,
        burstShots: 0,
        target: null,
        groundTarget: null,
        rescueTimer: 0,
        rescueLockActive: false,
        rescueMissile: null,
        rescueAttacker: null,
        rescueHighlight: false,
        lastEvadedMissile: null,
        targetRefresh: 0,
        groundMissiles: 2,
        groundMissileCooldown: 2 + i * 1.2,
        airMissiles: battle.difficulty?.wingman?.airMissile?.capacity ?? 3,
        airMissileCooldown: 2.5 + i * 1.8,
        threatTarget: null,
        threatTimer: 0,
        groundRoundCount: 0,
        phase: 'formation',
        velocity: flightDirection(heading, 0).multiplyScalar(235),
        heading,
        pitch: 0,
        speed: 235,
        hp: 3.6,
        maxHp: 3.6,
        disengageTimer: 0,
        defensiveTimer: 0,
        evasiveDirection: wing,
        evasiveTimer: 0,
        dead: false,
        waypoint:new THREE.Vector3(),steeringOffset:new THREE.Vector3(),direction:new THREE.Vector3(),
        away:new THREE.Vector3(),separation:new THREE.Vector3(),lead:new THREE.Vector3(),leadOffset:new THREE.Vector3(),
      });
      battle.onWingmanRadio?.('formation', battle.allies[battle.allies.length - 1]);
    }
  }

  spawnHostiles(battle, heading = battle.currentPlayerHeading(), playerForward = forwardOfHeading(heading), playerRight = rightOfHeading(heading)) {
    const hostileAircraftCount = (battle.mission.hostiles ?? 0) + (battle.mission.hostileHelicopters ?? 0);
    if (battle.hostilesSpawned || battle.enemies.length || hostileAircraftCount <= 0) return false;
    battle.hostilesSpawned = true;
    const spawned = this.spawnHostileWave(battle, battle.mission, heading, playerForward, playerRight);
    battle.mission.deferredHostiles = false;
    return spawned;
  }

  spawnEncounter(battle, event) {
    const response = event?.response;
    if (!response || response.hostiles <= 0) return false;
    const mission = {
      ...battle.mission,
      hostiles: response.hostiles,
      hostileHelicopters: 0,
      hostileComposition: response.composition,
      hostileRoles: response.hostileRoles,
      hostileTargetPreference: response.targetPreference,
      hostileGroupId: event.id,
      hostileSpawnDistance: response.spawnDistance ?? battle.mission.hostileSpawnDistance,
      hostileMinimumSpawnDistance: response.minimumSpawnDistance
        ?? battle.mission.hostileMinimumSpawnDistance,
      hostileLateralSpacing: response.lateralSpacing ?? battle.mission.hostileLateralSpacing,
      hostileEntry: response.entry ?? 'scramble',
    };
    const heading = THREE.MathUtils.degToRad(response.bearingDegrees ?? 0);
    return this.spawnHostileWave(
      battle,
      mission,
      heading,
      forwardOfHeading(heading),
      rightOfHeading(heading),
    );
  }

  spawnHostileWave(battle, mission, heading, playerForward, playerRight) {
    const hostileCount = Math.max(0, mission.hostiles ?? 0);
    const altitudeOffsets = [-110, 95, -45, 145, -160, 65];
    const edgeMargin = getAircraftEdgeMargin(battle);
    const spawnMargin = Math.min(edgeMargin, 1200);
    const lateralSpacing = mission.hostileLateralSpacing ?? 560;
    const formation = planAirFormation({
      origin: battle.player.position,
      forward: playerForward,
      right: playerRight,
      terrain: battle.terrain,
      count: hostileCount,
      requestedDistance: mission.hostileSpawnDistance ?? 12000,
      minimumDistance: mission.hostileMinimumSpawnDistance ?? 10000,
      lateralSpacing,
      forwardLaneSpacing: 90,
      margin: spawnMargin,
    });

    for (let i = 0; i < hostileCount; i++) {
      const aircraftVariant = mission.hostileComposition?.length
        ? mission.hostileComposition[i % mission.hostileComposition.length]
        : i % 2 === 0 ? 'su27' : 'mig29';
      const jet = createFighter({
        enemy: true,
        aircraftAsset: battle.aircraftAssets?.hostiles,
        aircraftVariant,
      });
      const lane = i - (hostileCount - 1) * .5;
      const laneCoordinate = lane / Math.max(.5, (hostileCount - 1) * .5);
      jet.position.copy(formation.positions[i]);
      const missionRole = mission.hostileRoles?.[i] ?? 'sweep';

      const ground = battle.terrain?.sampleHeight(jet.position.x, jet.position.z) ?? -Infinity;
      jet.position.y = Math.max(battle.player.position.y + altitudeOffsets[i % altitudeOffsets.length], ground + 360);
      const stagingOffset = jet.position.clone().sub(battle.player.position);
      // Hold a loose inbound formation through the setup window while closing
      // on the player; the selected difficulty controls when they open fire.
      // Contact aircraft should arrive nose-on instead of coasting away in the
      // player's direction before turning back for their first pass.
      const initialHeading = wrapAngle(Math.atan2(-formation.direction.x, -formation.direction.z));
      const initialPitch = 0;
      jet.rotation.order = 'YXZ';
      jet.rotation.y = initialHeading;
      jet.rotation.x = -initialPitch;
      jet.scale.setScalar(.82);
      battle.scene.add(jet);
      const maxHp = 4 * (battle.difficulty?.fighter?.health ?? 1);

      battle.enemies.push({
        mesh: jet,
        label: jet.userData.platformName,
        identified: true,
        missionRole,
        hp: maxHp,
        maxHp,
        heading: initialHeading,
        pitch: initialPitch,
        speed: 285,
        velocity: flightDirection(initialHeading, initialPitch).multiplyScalar(285),
        // Keep each formation lane distinct while bounding the orbit spread,
        // including larger test formations.
        lane: laneCoordinate || (i % 2 ? 1 : -1),
        altitudeOffset: altitudeOffsets[i % altitudeOffsets.length],
        phase: missionRole === 'strike' || mission.hostileEntry === 'scramble' ? 'inbound' : 'staging',
        phaseClock: 0,
        detectedPlayerTimer: 0,
        radarTrackDisruptionRemaining: 0,
        chaffTrackReevaluationRemaining: 0,
        stagingLane: lane,
        stagingLateral: stagingOffset.dot(playerRight),
        attackPattern: Math.floor(battle.random() * ENEMY_ATTACK_RUNS.length),
        gunCooldown: (battle.difficulty?.fighter?.gun?.cooldown ?? 2.2) + i * .45,
        burstClock: 0,
        burstShots: 0,
        missileClock: (battle.difficulty?.fighter?.missile?.initialDelay ?? 7) + i * 1.1,
        missileLockRemaining: null,
        missileLockSeeker: null,
        missileLockTarget: null,
        missilesFired: 0,
        effectClock: 0,
        countermeasures: battle.difficulty?.fighter?.evasion?.countermeasureCapacity ?? 2,
        countermeasureCooldownBase: battle.difficulty?.fighter?.evasion?.countermeasureCooldown ?? 4.5,
        countermeasureCooldownJitter: Math.min(1.2, (battle.difficulty?.fighter?.evasion?.countermeasureCooldown ?? 4.5) * .2),
        countermeasureCooldown: 0,
        lockResponseTimer: null,
        lockResponseLost: 0,
        lockResponseFollowupTimer: 0,
        lockResponseDone: false,
        lockResponseWillDeploy: false,
        lockResponseWillEvade: false,
        lastDefendedMissile: null,
        evasiveTimer: 0,
        evasiveDuration: 0,
        evasiveDirection: battle.random() < 0.5 ? -1 : 1,
        evasiveClimb: 0,
        tacticalManeuverCooldown: 3 + battle.random() * 5,
        groundStrafeCooldown: 8 + battle.random() * 8,
        targetRefreshTimer: 0,
        engagementTarget: null,
        engagementTargetDomain: 'air',
        burstTarget: null,
        burstTargetDomain: 'air',
        boosting: false,
        dead: false,
        encounterGroupId: mission.hostileGroupId ?? 'primary',
        targetPreference: mission.hostileTargetPreference,
        attackForward: playerForward.clone(),
        attackRight: playerRight.clone(),
        waypoint:new THREE.Vector3(),steeringOffset:new THREE.Vector3(),direction:new THREE.Vector3(),
        away:new THREE.Vector3(),separation:new THREE.Vector3(),lead:new THREE.Vector3(),leadOffset:new THREE.Vector3(),nose:new THREE.Vector3(),
      });
    }
    if (mission.hostileHelicopters) {
      this.spawnAttackHelicopters(battle, playerForward, playerRight, spawnMargin, mission);
    }
    return hostileCount > 0 || (mission.hostileHelicopters ?? 0) > 0;
  }

  spawnAttackHelicopters(battle, playerForward, playerRight, spawnMargin, mission = battle.mission) {
    const count = mission.hostileHelicopters ?? 0;
    if (!count) return;
    const lateralSpacing = battle.mission.hostileHelicopterLateralSpacing ?? 850;
    const formation = planAirFormation({
      origin: battle.player.position,
      forward: playerForward,
      right: playerRight,
      terrain: battle.terrain,
      count,
      requestedDistance: mission.hostileHelicopterSpawnDistance ?? 9500,
      minimumDistance: mission.hostileHelicopterMinimumSpawnDistance ?? 8500,
      lateralSpacing,
      margin: spawnMargin,
    });
    for (let i = 0; i < count; i++) {
      const mesh = createMi24AttackHelicopter();
      mesh.position.copy(formation.positions[i]);
      const ground = battle.terrain?.sampleHeight(mesh.position.x, mesh.position.z) ?? 0;
      mesh.position.y = ground + (mission.hostileHelicopterSpawnAltitude ?? 320) + i * 35;
      mesh.rotation.order = 'YXZ';
      mesh.rotation.y = wrapAngle(Math.atan2(-formation.direction.x, -formation.direction.z));
      mesh.scale.setScalar(0.88);
      battle.scene.add(mesh);
      const health = 3.7 * (battle.difficulty?.fighter?.health ?? 1);
      battle.enemies.push({
        kind: 'attack-helicopter',
        encounterGroupId: mission.hostileGroupId ?? 'primary',
        mesh,
        label: 'Mi-24V',
        hp: health,
        maxHp: health,
        heading: mesh.rotation.y,
        pitch: 0,
        speed: 62,
        velocity: new THREE.Vector3(),
        dead: false,
        phaseClock: 0,
        orbitPhase: i * Math.PI,
        targetRefreshTimer: 0,
        groundTarget: null,
        rocketCooldown: 4 + i * 3,
        airToAirMissilesRemaining: 4,
        airMissileCooldown: 1.8 + i * 1.8,
        airMissileLockRemaining: null,
        waypoint: new THREE.Vector3(),
        steeringOffset: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        lead: new THREE.Vector3(),
        leadOffset: new THREE.Vector3(),
      });
    }
  }
}
