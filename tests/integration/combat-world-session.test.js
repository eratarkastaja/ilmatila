import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMissile, disposeMissilePool, releaseMissile } from '../../src/combat/projectiles.js';

class MockElement {
  constructor() {
    this.hidden = false;
    this.textContent = '';
    this.dataset = {};
    this.style = { setProperty() {} };
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this.queriedElements = new Map();
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle: (name, force) => {
        const enabled = force ?? !classes.has(name);
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      },
    };
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  querySelector(selector) {
    if (!this.queriedElements.has(selector)) this.queriedElements.set(selector, new MockElement());
    return this.queriedElements.get(selector);
  }
  closest() { return new MockElement(); }
  querySelectorAll() { return []; }
  append(child) { this.children.push(child); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  remove() { this.removed = true; }
}

class TrackedEventTarget extends EventTarget {
  constructor() {
    super();
    this.listenerRegistry = new Map();
  }
  addEventListener(type, listener, options) {
    const listeners = this.listenerRegistry.get(type) ?? new Set();
    listeners.add(listener);
    this.listenerRegistry.set(type, listeners);
    super.addEventListener(type, listener, options);
  }
  removeEventListener(type, listener, options) {
    this.listenerRegistry.get(type)?.delete(listener);
    super.removeEventListener(type, listener, options);
  }
  listenerCount(type) { return this.listenerRegistry.get(type)?.size ?? 0; }
}

class MockDocument extends TrackedEventTarget {
  constructor() {
    super();
    this.elements = new Map();
    this.documentElement = { lang: 'en' };
    this.title = '';
  }
  querySelector(selector) {
    if (!this.elements.has(selector)) this.elements.set(selector, new MockElement());
    return this.elements.get(selector);
  }
  createElement(tagName) {
    if (tagName !== 'canvas') return new MockElement();
    const gradient = { addColorStop() {} };
    return {
      width: 0,
      height: 0,
      getContext: () => ({
        createRadialGradient: () => gradient,
        fillRect() {},
      }),
    };
  }
  createTextNode(textContent) { return { textContent }; }
}

const originalGlobals = {};

afterEach(() => {
  disposeMissilePool();
  for (const [name, value] of Object.entries(originalGlobals)) {
    if (value === undefined) delete globalThis[name];
    else globalThis[name] = value;
  }
  for (const name of Object.keys(originalGlobals)) delete originalGlobals[name];
});

function installBrowserGlobals() {
  for (const name of ['document', 'window', 'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    originalGlobals[name] = globalThis[name];
  }
  const document = new MockDocument();
  const window = new TrackedEventTarget();
  const values = new Map();
  globalThis.document = document;
  globalThis.window = window;
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  globalThis.requestAnimationFrame = undefined;
  globalThis.cancelAnimationFrame = undefined;
  return { document, window };
}

function createTerrain() {
  return {
    worldSize: 32000,
    operationBounds: { minX: -16000, maxX: 16000, minZ: -16000, maxZ: 16000 },
    sampleHeight: () => 0,
    isPlayableArea: () => true,
    isWater: () => false,
  };
}

function createMission() {
  return {
    id: 'training',
    hostiles: 1,
    deferredHostiles: true,
    hostileSpawnDistance: 4000,
    hostileMinimumSpawnDistance: 4000,
    wingmen: 0,
    groundBattle: true,
    groundPairs: 1,
    groundTrucks: 1,
    departureDuration: 0,
    navigationDistance: 100,
    navigationRadius: 50,
    extractionRadius: 50,
    objectiveReportDuration: 0,
    objective: { type: 'training', duration: 0.2 },
  };
}

function createAircraftAsset() {
  const model = () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(6, 2, 12), new THREE.MeshBasicMaterial()));
    return root;
  };
  return { player: model(), hostiles: { su27: model(), mig29: model() } };
}

describe('CombatWorld sortie lifecycle', () => {
  it('repeats the gameplay simulation from the same sortie seed, independent of visual effects', async () => {
    installBrowserGlobals();
    const { CombatWorld } = await import('../../src/combat/world.js');
    const run = (seed, addVisualEffects = false) => {
      const scene = new THREE.Scene();
      const player = new THREE.Group();
      player.position.set(0, 100, 0);
      const mission = {
        ...createMission(),
        id: 'support',
        hostiles: 3,
        hostileHelicopters: 1,
        deferredHostiles: false,
        hostileSpawnDistance: 5200,
        hostileMinimumSpawnDistance: 4700,
        wingmen: 1,
        groundPairs: 2,
        groundTrucks: 2,
        groundIto90Count: 1,
        groundShilkaCount: 1,
        departureDuration: 1000,
        objective: { type: 'training', duration: 1000 },
      };
      const world = new CombatWorld(
        scene, player, createTerrain(), null, createAircraftAsset(), mission,
        null, vi.fn(), 'standard', null, seed,
      );
      for (let frame = 0; frame < 180; frame++) {
        world.update(1 / 60);
        if (addVisualEffects && frame % 3 === 0) {
          world.combatEffects.addExplosion(new THREE.Vector3(300 + frame, 100, 900), .8);
        }
      }
      const vector = value => value.toArray().map(component => Number(component.toFixed(5)));
      const snapshot = {
        enemies: world.enemies.map(enemy => ({
          position: vector(enemy.mesh.position), velocity: vector(enemy.velocity), phase: enemy.phase,
          attackPattern: enemy.attackPattern, evasiveDirection: enemy.evasiveDirection,
          tacticalManeuverCooldown: enemy.tacticalManeuverCooldown,
          targetRefreshTimer: enemy.targetRefreshTimer, missilesFired: enemy.missilesFired,
        })),
        allies: world.allies.map(ally => ({
          position: vector(ally.mesh.position), velocity: vector(ally.velocity),
          airMissiles: ally.airMissiles, burstShots: ally.burstShots, fireCooldown: ally.fireCooldown,
        })),
        ground: [...world.friends, ...world.redUnits].map(unit => ({
          position: vector(unit.mesh.position), velocity: vector(unit.velocity),
          hp: unit.hp, speed: unit.speed, cool: unit.cool, aaCooldown: unit.aaCooldown,
        })),
        projectiles: [...world.projectileSystem.playerShots, ...world.projectileSystem.hostiles].map(shot => ({
          position: vector(shot.mesh.position), velocity: vector(shot.velocity), life: shot.life,
        })),
      };
      world.dispose();
      return snapshot;
    };

    const baseline = run(0x1234abcd);
    expect(run(0x1234abcd, true)).toEqual(baseline);
    expect(run(0x1234abce)).not.toEqual(baseline);
  });

  it('publishes Support defender health from live ground-unit damage and losses', async () => {
    installBrowserGlobals();
    const { CombatWorld } = await import('../../src/combat/world.js');
    const scene = new THREE.Scene();
    const player = new THREE.Group();
    player.position.set(0, 100, 0);
    const mission = {
      ...createMission(),
      id: 'support',
      groundPairs: 3,
      groundTrucks: 0,
      groundFriendlyTrucks: 1,
      objective: { type: 'support' },
    };
    const world = new CombatWorld(
      scene, player, createTerrain(), null, createAircraftAsset(), mission, null, vi.fn(), 'standard', null, 0x51,
    );

    try {
      const defenders = world.friends.filter(unit => unit.role === 'defender');
      const maximumHealth = defenders.reduce((total, unit) => total + unit.maxHp, 0);
      const damagedDefender = defenders[0];
      expect(defenders.length).toBeGreaterThan(0);
      expect(world.hudState.supportForce).toMatchObject({
        active: true,
        fraction: 1,
        unitsAlive: defenders.length,
        unitsTotal: defenders.length,
      });

      damagedDefender.hp = damagedDefender.maxHp / 2;
      world.refreshHudState();
      expect(world.hudState.supportForce.fraction).toBeCloseTo(
        1 - (damagedDefender.maxHp / 2) / maximumHealth,
      );
      expect(world.hudState.supportForce.unitsAlive).toBe(defenders.length);

      damagedDefender.dead = true;
      damagedDefender.hp = 0;
      world.refreshHudState();
      expect(world.hudState.supportForce.fraction).toBeCloseTo(
        (maximumHealth - damagedDefender.maxHp) / maximumHealth,
      );
      expect(world.hudState.supportForce.unitsAlive).toBe(defenders.length - 1);
    } finally {
      world.dispose();
    }
  });

  it('records a lost Intercept installation without ending the sortie', async () => {
    installBrowserGlobals();
    const { CombatWorld } = await import('../../src/combat/world.js');
    const { MISSIONS } = await import('../../src/mission/missions.js');
    const scene = new THREE.Scene();
    const player = new THREE.Group();
    player.position.set(0, 100, 0);
    const world = new CombatWorld(
      scene, player, createTerrain(), null, createAircraftAsset(), MISSIONS.intercept,
      null, vi.fn(), 'standard', null, 0x4a11,
    );

    try {
      world.airBattle.spawnHostiles();
      const installationObjective = world.optionalObjectiveTracker.objectives
        .find(objective => objective.type === 'interceptBeforeZone');
      const strike = world.enemies[installationObjective.target.index];
      expect(strike.missionRole).toBe('strike');
      strike.mesh.position.copy(world.missionFlow.home);

      const radioEmit = vi.spyOn(world.radio, 'emit');
      world.update(0);

      expect(world.optionalObjectiveTracker.results.find(result => result.id === installationObjective.id))
        .toMatchObject({
          status: 'failed',
          detailKey: 'mission.optionalObjective.result.zoneReached',
        });
      expect(world.radio.current.key).toBe('radio.protectedSiteLost');
      expect(world.missionSystem.outcome).toBe('active');
      expect(world.missionFlow.outcome).toBe('active');

      world.update(0);
      expect(radioEmit.mock.calls.filter(([event]) => event === 'mission.protectedSiteLost')).toHaveLength(1);

      for (const enemy of world.enemies) {
        enemy.dead = true;
        enemy.hp = 0;
      }
      world.missionSystem.activate();
      world.update(0);
      expect(world.missionSystem.objectiveSatisfied).toBe(true);
      world.update(4);

      expect(world.debriefData.outcome).toBe('complete');
      expect(world.debriefData.optionalObjectives.find(result => result.id === installationObjective.id))
        .toMatchObject({
          status: 'failed',
          detailKey: 'mission.optionalObjective.result.zoneReached',
        });
    } finally {
      world.dispose();
    }
  });

  it('binds C to chaff and keeps F on flare deployment', async () => {
    const { document, window } = installBrowserGlobals();
    const { CombatWorld } = await import('../../src/combat/world.js');
    const scene = new THREE.Scene();
    const player = new THREE.Group();
    player.position.set(0, 100, 0);
    const world = new CombatWorld(
      scene, player, createTerrain(), null, createAircraftAsset(), createMission(), null, vi.fn(), 'standard',
    );
    expect(world.countermeasureSystem.chaff).toBe(15);
    expect(world.countermeasureSystem.flares).toBe(15);
    expect(world.weaponSystem.missiles).toEqual({ air: 10, ground: 10 });
    expect(world.weaponSystem.gunAmmoRemaining).toBe(3500);
    world.update(0);
    expect(document.querySelector('#fuel-gauge').hidden).toBe(false);
    expect(document.querySelector('#fuel-value').textContent).toBe('100%');
    expect(document.querySelector('#fuel-gauge').dataset.level).toBe('green');
    expect(document.querySelector('#chaff-count').textContent).toBe('15');
    expect(document.querySelector('#flare-count').textContent).toBe('15');
    expect(document.querySelector('#gun-ammo-count').textContent).toBe('3,500');
    world.fuelSystem.update(4 * 60 * 60, false);
    world.updateHud();
    expect(document.querySelector('#fuel-value').textContent).toBe('50%');
    expect(document.querySelector('#fuel-gauge').dataset.level).toBe('yellow');
    expect(document.querySelector('#fuel-gauge').getAttribute('aria-valuenow')).toBe('50');
    world.fuelSystem.update(3 * 60 * 60, false);
    world.updateHud();
    expect(document.querySelector('#fuel-gauge').dataset.level).toBe('red');
    const press = code => {
      const event = new Event('keydown');
      Object.defineProperty(event, 'code', { value: code });
      window.dispatchEvent(event);
    };

    press('KeyC');
    world.update(.016);
    expect(world.countermeasureSystem.chaff).toBe(14);
    expect(world.countermeasureSystem.flares).toBe(15);
    expect(document.querySelector('#chaff-count').textContent).toBe('14');
    expect(document.querySelector('#flare-count').textContent).toBe('15');

    world.countermeasureSystem.tick(2);
    press('KeyF');
    world.update(.016);
    expect(world.countermeasureSystem.flares).toBe(14);
    expect(world.countermeasureSystem.decoys[0].type).toBe('ir');
    expect(document.querySelector('#flare-count').textContent).toBe('14');

    const enemyMesh = new THREE.Group();
    enemyMesh.position.set(0, 100, 1000);
    scene.add(enemyMesh);
    const enemy = {
      mesh: enemyMesh,
      phase: 'staging',
      detectedPlayerTimer: .2,
      dead: false,
    };
    world.enemies.push(enemy);
    world.updateHud();
    expect(document.querySelector('#radar-warning').dataset.state).toBe('search');

    enemy.phase = 'inbound';
    enemy.engagementTarget = player;
    world.updateHud();
    expect(document.querySelector('#radar-warning').dataset.state).toBe('track');

    world.countermeasureSystem.tick(2);
    world.countermeasureSystem.random = () => 0;
    expect(world.countermeasureSystem.deployChaff()).toBe(true);
    world.updateHud();
    expect(enemy.radarTrackDisruptionRemaining).toBeGreaterThan(0);
    expect(document.querySelector('#radar-warning').dataset.state).toBe('disrupted');

    world.onMissileLaunch(enemy, null, 'radar');
    world.updateHud();
    expect(document.querySelector('#threat-warning-label').textContent).toBe('RADAR MISSILE LAUNCH → CHAFF [C]');
    expect(document.querySelector('#combat-feedback').querySelector('b').textContent).toBe('RADAR MISSILE LAUNCH → CHAFF [C]');
    world.missileLaunchAlertCooldown = 0;
    world.onMissileLaunch(enemy, null, 'ir');
    world.updateHud();
    expect(document.querySelector('#threat-warning-label').textContent).toBe('IR MISSILE LAUNCH → FLARES [F]');
    expect(document.querySelector('#combat-feedback').querySelector('b').textContent).toBe('IR MISSILE LAUNCH → FLARES [F]');

    world.dispose();
    expect(scene.children).toHaveLength(0);
    expect(document.querySelector('#radar-warning').hidden).toBe(true);
    const easy = new CombatWorld(
      scene, player, createTerrain(), null, createAircraftAsset(), createMission(), null, vi.fn(), 'easy',
    );
    easy.update(0);
    expect(document.querySelector('#fuel-gauge').hidden).toBe(true);
    easy.dispose();
  });

  it('runs a training mission through RTB and debrief, saves its record, and releases listeners between sorties', async () => {
    const { document, window } = installBrowserGlobals();
    const animationFrames = new Map();
    let nextFrameId = 0;
    const cancelFrame = vi.fn(frameId => animationFrames.delete(frameId));
    globalThis.requestAnimationFrame = callback => {
      const frameId = ++nextFrameId;
      animationFrames.set(frameId, callback);
      return frameId;
    };
    globalThis.cancelAnimationFrame = cancelFrame;
    const { CombatWorld } = await import('../../src/combat/world.js');
    const { CareerProgress } = await import('../../src/mission/progression.js');
    const storage = globalThis.localStorage;
    const career = new CareerProgress(storage);
    const scene = new THREE.Scene();
    const player = new THREE.Group();
    player.position.set(0, 100, 0);
    const terrain = createTerrain();
    const aircraftAsset = createAircraftAsset();
    const mission = createMission();
    const onMissionEnd = vi.fn((outcome, result) => career.recordMission({ ...result, outcome }));

    const first = new CombatWorld(scene, player, terrain, null, aircraftAsset, mission, null, onMissionEnd, 'hard');
    const attacker = {};
    expect(first.airBattle.canStartHostileMissileAttack(attacker, player)).toBe(true);
    first.encounterDirector.events.push({ status: 'warning' });
    expect(first.airBattle.canStartHostileMissileAttack(attacker, player)).toBe(false);
    first.encounterDirector.events.pop();
    expect(first.fuelSystem.capacitySeconds).toBe(4 * 60 * 60);
    expect(first.fuelSystem.fraction).toBe(1);
    expect(first.weaponSystem.missiles).toEqual({ air: 6, ground: 6 });
    expect(first.weaponSystem.gunAmmoRemaining).toBe(2000);
    expect(first.countermeasureSystem.flares).toBe(10);
    expect(first.countermeasureSystem.chaff).toBe(10);
    expect(window.listenerCount('keydown')).toBe(1);
    expect(window.listenerCount('keyup')).toBe(1);
    expect(window.listenerCount('blur')).toBe(1);
    expect(window.listenerCount('pointerup')).toBe(1);
    expect(document.listenerCount('ilmatila:languagechange')).toBe(1);
    expect(first.redUnits.filter(unit => unit.armed !== false)).toHaveLength(1);
    expect(first.friends.length).toBeGreaterThan(0);

    first.update(0.1);
    expect(first.missionFlow.phase).toBe('navigation');
    player.position.copy(first.missionFlow.ingress);
    first.update(0.1);
    expect(first.missionFlow.phase).toBe('contact');
    expect(first.enemies).toHaveLength(1);
    expect(first.enemies[0].phase).toBe('staging');
    first.update(3);
    expect(first.enemies[0].phase).toBe('inbound');
    expect(first.missionSystem.objectiveSatisfied).toBe(true);
    expect(first.missionFlow.phase).toBe('rtb');
    const staleNoticeFrameId = first.missionSystem.noticeFrame;
    const staleNoticeFrame = animationFrames.get(staleNoticeFrameId);
    const missionNotice = document.querySelector('#mission-complete');
    expect(staleNoticeFrame).toBeTypeOf('function');
    expect(first.missionSystem.noticeTimer).not.toBeNull();
    player.position.copy(first.missionFlow.home);
    first.update(0.1);

    expect(first.debriefData).toMatchObject({ missionId: 'training', outcome: 'complete' });
    expect(onMissionEnd).toHaveBeenCalledOnce();
    expect(career.getBest('training', 'hard')).toMatchObject({ completed: true, score: 1250 });
    expect(new CareerProgress(storage).getBest('training', 'hard')).toMatchObject({ completed: true });
    expect(first.missionFlow.phase).toBe('debrief');
    const staleEnemy = first.enemies[0];
    const staleProjectile = { target: staleEnemy };
    first.incomingAircraftMissiles.push(staleProjectile);
    first.missileLaunchSource = staleEnemy;
    first.missileLaunchSeeker = 'radar';
    first.missileLaunchTimer = 2;
    first.projectileSystem.missileThreat = staleProjectile;
    first.projectileSystem.incomingMissile = true;
    first.setTelemetry({ sortie: 1 });
    const collectUnitMeshes = world => [
      ...world.enemies, ...world.allies, ...world.friends, ...world.redUnits,
    ].map(unit => unit.mesh);
    const firstMeshes = collectUnitMeshes(first);

    first.dispose();
    expect(first.missionSystem.noticeTimer).toBeNull();
    expect(first.missionSystem.noticeFrame).toBeNull();
    expect(cancelFrame).toHaveBeenCalledWith(staleNoticeFrameId);
    staleNoticeFrame(0);
    expect(missionNotice.classList.contains('visible')).toBe(false);
    expect(first.radio.current).toBeNull();
    expect(first.radio.queue).toHaveLength(0);
    expect(first.radio.cooldowns.size).toBe(0);
    expect(first.radar.tracks.size).toBe(0);
    expect(first.projectileSystem.playerShots).toHaveLength(0);
    expect(first.projectileSystem.hostiles).toHaveLength(0);
    expect(first.projectileSystem.missileThreat).toBeNull();
    expect(first.projectileSystem.incomingMissile).toBe(false);
    expect(first.projectileSystem.telemetry).toBeNull();
    expect(first.countermeasureSystem.telemetry).toBeNull();
    expect(first.incomingAircraftMissiles).toHaveLength(0);
    expect(first.missileLaunchSource).toBeNull();
    expect(first.missileLaunchSeeker).toBeNull();
    expect(first.missileLaunchTimer).toBe(0);
    expect(first.airBattle.enemies).toHaveLength(0);
    expect(first.airBattle.allies).toHaveLength(0);
    expect(first.groundBattle.groundUnits).toHaveLength(0);
    expect(first.combatEffects.activeEffects).toHaveLength(0);
    expect(first.combatEffects.sparkPool).toHaveLength(0);
    expect(first.combatEffects.explosionPool).toHaveLength(0);
    expect(window.listenerCount('keydown')).toBe(0);
    expect(window.listenerCount('keyup')).toBe(0);
    expect(window.listenerCount('blur')).toBe(0);
    expect(window.listenerCount('pointerup')).toBe(0);
    expect(document.listenerCount('ilmatila:languagechange')).toBe(0);
    expect(scene.children).toHaveLength(0);

    const previousMeshes = new Set(firstMeshes);
    const inputEvents = ['keydown', 'keyup', 'blur', 'pointerup'];
    for (let sortieNumber = 2; sortieNumber <= 10; sortieNumber++) {
      const audio = sortieNumber === 10
        ? {
            playExplosion: vi.fn(), playRadioSquelch: vi.fn(),
            setGunFiring: vi.fn(), stopMissileFlight: vi.fn(),
          }
        : null;
      const next = new CombatWorld(
        scene, player, terrain, null, aircraftAsset, mission, audio, vi.fn(), 'hard', null, sortieNumber,
      );
      next.airBattle.spawnHostiles();
      next.radar.updateContacts(0, 0, {
        airFriendly: next.allies,
        airHostile: next.enemies,
        groundFriendly: next.friends,
        groundHostile: next.redUnits,
      });
      const currentMeshes = collectUnitMeshes(next);
      expect(currentMeshes.every(mesh => !previousMeshes.has(mesh))).toBe(true);
      for (const mesh of currentMeshes) previousMeshes.add(mesh);
      expect(next.missionFlow.phase).toBe('departure');
      expect(next.missionSystem.outcome).toBe('active');
      expect(next.scoreSystem.score).toBe(0);
      expect(next.radar.tracks.size).toBeGreaterThan(0);
      for (const type of inputEvents) expect(window.listenerCount(type)).toBe(1);
      expect(document.listenerCount('ilmatila:languagechange')).toBe(1);
      expect(next.restartButton.listeners.get('click').size).toBe(1);

      const radarNodes = [...next.radar.tracks.values()].map(track => track.node);
      let missileMesh;
      let groundGeometryDispose;
      let sparkMaterialDispose;
      let explosionMaterialDispose;
      if (sortieNumber === 10) {
        missileMesh = createMissile('#d3d9d2');
        scene.add(missileMesh);
        next.projectileSystem.addPlayerProjectile({
          missile: true, homing: true, mesh: missileMesh,
          velocity: new THREE.Vector3(0, 0, 650), target: next.enemies[0], life: 20,
        });
        next.combatEffects.addSpark(new THREE.Vector3(0, 100, 0));
        next.combatEffects.addExplosion(new THREE.Vector3(0, 100, 0));
        const spark = next.combatEffects.activeEffects.find(effect => effect.kind === 'spark');
        const explosion = next.combatEffects.activeEffects.find(effect => effect.kind === 'explosion');
        sparkMaterialDispose = vi.spyOn(spark.material, 'dispose');
        explosionMaterialDispose = vi.spyOn(explosion.fireball.material, 'dispose');
        next.groundBattle.groundUnits[0].mesh.traverse(object => {
          if (!groundGeometryDispose && object.geometry) {
            groundGeometryDispose = vi.spyOn(object.geometry, 'dispose');
          }
        });
        next.combatEffects.update(2);
        expect(next.combatEffects.sparkPool).toHaveLength(1);
        expect(next.combatEffects.explosionPool).toHaveLength(1);
      }

      next.dispose();
      expect(scene.children).toHaveLength(0);
      expect(currentMeshes.every(mesh => mesh.parent === null)).toBe(true);
      expect(radarNodes.every(node => node.removed)).toBe(true);
      for (const type of inputEvents) expect(window.listenerCount(type)).toBe(0);
      expect(document.listenerCount('ilmatila:languagechange')).toBe(0);
      expect(next.restartButton.listeners.get('click').size).toBe(0);
      expect(next.radar.tracks.size).toBe(0);
      expect(next.radio.current).toBeNull();
      expect(next.radio.queue).toHaveLength(0);
      expect(next.groundBattle.groundUnits).toHaveLength(0);
      expect(next.projectileSystem.playerShots).toHaveLength(0);
      expect(next.combatEffects.sparkPool).toHaveLength(0);
      expect(next.combatEffects.explosionPool).toHaveLength(0);
      if (sortieNumber === 10) {
        expect(groundGeometryDispose).toHaveBeenCalledOnce();
        expect(sparkMaterialDispose).toHaveBeenCalledOnce();
        expect(explosionMaterialDispose).toHaveBeenCalledOnce();
        expect(audio.stopMissileFlight).toHaveBeenCalledOnce();
        expect(missileMesh.parent).toBeNull();
        expect(missileMesh.visible).toBe(false);
        const reusedMissile = createMissile('#c5c8bb');
        expect(reusedMissile).toBe(missileMesh);
        releaseMissile(reusedMissile);
      }
    }
  });
});
