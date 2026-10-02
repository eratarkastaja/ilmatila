import * as THREE from 'three';

function paint(color, roughness = 0.82, metalness = 0.08) {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
  material.userData.ilmatilaOwned = true;
  return material;
}

function box(parent, size, position, material, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, radiusTop, radiusBottom, length, position, material, rotation = [Math.PI / 2, 0, 0], segments = 10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function rotorBladeGeometry(length, chord, thickness, horizontal = false) {
  const shape = new THREE.Shape();
  shape.moveTo(0.28, -chord * 0.43);
  shape.lineTo(length * 0.78, -chord * 0.5);
  shape.lineTo(length * 0.93, -chord * 0.32);
  shape.lineTo(length, -chord * 0.045);
  shape.lineTo(length, chord * 0.045);
  shape.lineTo(length * 0.93, chord * 0.32);
  shape.lineTo(length * 0.78, chord * 0.5);
  shape.lineTo(0.28, chord * 0.43);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: Math.min(chord * 0.045, thickness * 0.18),
    bevelThickness: thickness * 0.2,
    steps: 1,
  });
  geometry.translate(0, 0, -thickness * 0.5);
  if (horizontal) geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/** Compact procedural Mi-24V silhouette, authored in the game's +Z-forward axes. */
export function createMi24AttackHelicopter() {
  const aircraft = new THREE.Group();
  const paintGreen = paint('#59604d');
  const paintLight = paint('#747966');
  const paintDark = paint('#343a34');
  const glass = paint('#14292b', 0.28, 0.16);
  const steel = paint('#555a54', 0.62, 0.24);
  const rotorMaterial = paint('#252a27', 0.72, 0.1);

  aircraft.userData.team = 'hostile';
  aircraft.userData.airframeHealthRatio = 1;
  aircraft.userData.damageSmokeSeverity = 0;
  aircraft.userData.platformName = 'Mi-24V';
  aircraft.userData.aircraftForwardClearance = 5.2;
  aircraft.userData.trailOffsets = [[-0.48, 0.12, -3.35], [0.48, 0.12, -3.35]];
  aircraft.userData.hitZones = [
    { x: 0, y: 0.12, z: -0.5, rx: 0.88, ry: 0.78, rz: 3.55, damage: 1 },
    { x: 0, y: 0.43, z: 3.02, rx: 0.78, ry: 0.56, rz: 1.58, damage: 1.45 },
    { x: -0.78, y: 0.55, z: -1.85, rx: 0.45, ry: 0.42, rz: 1.05, damage: 1.05 },
    { x: 0.78, y: 0.55, z: -1.85, rx: 0.45, ry: 0.42, rz: 1.05, damage: 1.05 },
    { x: 0, y: 1.84, z: -0.25, rx: 0.5, ry: 0.28, rz: 0.55, damage: 0.65 },
  ];

  cylinder(aircraft, 0.72, 0.98, 7.8, [0, 0, -0.15], paintGreen, [Math.PI / 2, 0, 0], 12);
  // Twin TV3-117 engine housings make the Hind's tall, heavy spine legible
  // from the player's normal chase-camera distance.
  for (const side of [-1, 1]) {
    cylinder(aircraft, 0.29, 0.4, 2.9, [side * 0.52, 1.04, -0.48], paintLight,
      [Math.PI / 2, 0, 0], 10);
    cylinder(aircraft, 0.31, 0.34, 0.22, [side * 0.52, 1.04, 1.08], steel,
      [Math.PI / 2, 0, 0], 10);
    cylinder(aircraft, 0.23, 0.25, 0.32, [side * 0.52, 1.04, -2.12], paintDark,
      [Math.PI / 2, 0, 0], 10);
    cylinder(aircraft, 0.16, 0.18, 0.08, [side * 0.52, 1.04, -2.31], steel,
      [Math.PI / 2, 0, 0], 10);
    box(aircraft, [0.045, 0.055, 0.9], [side * 0.52, 1.44, -0.42], paintDark);
  }

  for (const side of [-1, 1]) {
    cylinder(aircraft, 0.36, 0.44, 2.45, [side * 0.78, 0.91, -1.85], paintLight, [Math.PI / 2, 0, 0], 10);
    cylinder(aircraft, 0.28, 0.34, 0.32, [side * 0.78, 0.91, -0.48], paintDark, [Math.PI / 2, 0, 0], 10);
  }
  // Deep, tandem armored cockpit glazing and blunt gun-nose fairing.
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.89, 12, 9), paintLight);
  cockpit.scale.set(0.86, 0.72, 1.72);
  cockpit.position.set(0, 0.32, 2.92);
  aircraft.add(cockpit);
  const gunnerCanopy = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 8), glass);
  gunnerCanopy.scale.set(0.94, 0.68, 1.08);
  gunnerCanopy.position.set(0, 0.58, 3.27);
  aircraft.add(gunnerCanopy);
  const pilotCanopy = new THREE.Mesh(new THREE.SphereGeometry(0.59, 12, 8), glass);
  pilotCanopy.scale.set(0.92, 0.7, 1.16);
  pilotCanopy.position.set(0, 0.72, 2.2);
  aircraft.add(pilotCanopy);
  for (const z of [2.45, 3.45]) {
    for (const side of [-1, 1]) {
      box(aircraft, [0.53, 0.43, 0.065], [side * 0.34, 0.62, z], glass,
        [side * -0.12, side * 0.18, side * 0.22]);
    }
  }
  for (const z of [1.18, 0.42, -0.38, -1.18]) {
    for (const side of [-1, 1]) {
      box(aircraft, [0.065, 0.25, 0.36], [side * 0.82, 0.18, z], glass,
        [0, 0, side * 0.04]);
    }
  }
  const noseTurret = new THREE.Mesh(new THREE.SphereGeometry(0.37, 10, 8), paintDark);
  noseTurret.scale.set(0.92, 0.68, 0.82);
  noseTurret.position.set(0, -0.35, 3.57);
  aircraft.add(noseTurret);
  cylinder(aircraft, 0.34, 0.41, 0.62, [0, -0.27, 3.55], steel, [Math.PI / 2, 0, 0], 10);
  box(aircraft, [0.58, 0.14, 0.62], [0, -0.48, 3.4], paintDark);
  for (const x of [-0.11, -0.035, 0.035, 0.11]) {
    cylinder(aircraft, 0.03, 0.03, 0.82, [x, -0.43, 4.13], steel,
      [Math.PI / 2, 0, 0], 6);
  }

  // Swept stub wings give the Hind its recognizable planform and carry the
  // rocket pods and short-range self-defence missiles.
  const wingPlanform = new THREE.Shape();
  wingPlanform.moveTo(0, 0.9);
  wingPlanform.lineTo(3.78, -0.42);
  wingPlanform.lineTo(3.48, -1.42);
  wingPlanform.lineTo(0, -0.82);
  wingPlanform.lineTo(-3.48, -1.42);
  wingPlanform.lineTo(-3.78, -0.42);
  wingPlanform.closePath();
  const wingGeometry = new THREE.ExtrudeGeometry(wingPlanform, {
    depth: 0.2,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.035,
    bevelThickness: 0.025,
    steps: 1,
  });
  wingGeometry.translate(0, 0, -0.1);
  wingGeometry.rotateX(Math.PI / 2);
  wingGeometry.computeVertexNormals();
  const stubWings = new THREE.Mesh(wingGeometry, paintGreen);
  stubWings.position.set(0, -0.48, -0.9);
  aircraft.add(stubWings);
  box(aircraft, [0.13, 0.12, 0.2], [-3.76, -0.39, -0.9], paint('#bd463b', 0.4, 0.04));
  box(aircraft, [0.13, 0.12, 0.2], [3.76, -0.39, -0.9], paint('#8fcf9d', 0.4, 0.04));
  const airToAirStores = [];
  for (const side of [-1, 1]) {
    cylinder(aircraft, 0.24, 0.28, 1.65, [side * 2.95, -0.82, -0.82], paintDark);
    for (const z of [-1.28, -0.66]) {
      cylinder(aircraft, 0.085, 0.085, 0.24, [side * 2.95, -0.82, z], steel);
    }
    const r60Store = new THREE.Group();
    r60Store.position.set(side * 3.45, -0.82, -0.73);
    cylinder(r60Store, 0.08, 0.105, 1.92, [0, 0, 0], paintLight,
      [Math.PI / 2, 0, 0], 8);
    cylinder(r60Store, 0.025, 0.075, 0.32, [0, 0, 1.12], steel,
      [Math.PI / 2, 0, 0], 8);
    for (const finSide of [-1, 1]) {
      box(r60Store, [0.36, 0.045, 0.38], [finSide * 0.15, 0, -0.65], paintDark);
      box(r60Store, [0.045, 0.36, 0.38], [0, finSide * 0.15, -0.65], paintDark);
    }
    aircraft.add(r60Store);
    airToAirStores.push(r60Store);
    const reserveStore = r60Store.clone(true);
    reserveStore.position.y -= 0.28;
    aircraft.add(reserveStore);
    airToAirStores.push(reserveStore);
    // Short, tucked wheeled landing gear remains distinct from a jet undercarriage.
    cylinder(aircraft, 0.13, 0.13, 0.92, [side * 0.82, -0.72, 1.65], steel, [0, 0, Math.PI / 2], 8);
    cylinder(aircraft, 0.18, 0.18, 0.17, [side * 1.28, -1.12, 1.65], paintDark, [0, 0, Math.PI / 2], 8);
  }

  // Tapered tail boom, vertical stabilizer and small tail rotor.
  cylinder(aircraft, 0.13, 0.38, 6.25, [0, 0.22, -6.05], paintGreen, [Math.PI / 2, 0, 0], 10);
  box(aircraft, [3.2, 0.13, 0.68], [0, 0.2, -7.05], paintGreen, [0, 0, -0.025]);
  box(aircraft, [0.14, 1.64, 1.46], [0, 0.75, -8.55], paintLight, [0.04, 0, 0]);
  const tailRotorAssembly = new THREE.Group();
  tailRotorAssembly.position.set(-0.48, 0.76, -8.56);
  tailRotorAssembly.rotation.y = Math.PI / 2;
  cylinder(tailRotorAssembly, 0.18, 0.18, 0.25, [0, 0, 0], steel, [Math.PI / 2, 0, 0], 8);
  const tailRotor = new THREE.Group();
  const tailBladeGeometry = rotorBladeGeometry(0.74, 0.16, 0.055);
  for (let blade = 0; blade < 3; blade++) {
    const rotorBlade = new THREE.Mesh(tailBladeGeometry, rotorMaterial);
    rotorBlade.rotation.z = blade * Math.PI * 2 / 3;
    tailRotor.add(rotorBlade);
  }
  tailRotorAssembly.add(tailRotor);
  aircraft.add(tailRotorAssembly);
  aircraft.userData.tailRotor = tailRotor;

  const mainRotor = new THREE.Group();
  mainRotor.position.set(0, 1.65, -0.18);
  cylinder(mainRotor, 0.29, 0.38, 0.58, [0, 0.18, 0], paintDark, [0, 0, 0], 10);
  cylinder(mainRotor, 0.12, 0.15, 0.75, [0, -0.29, 0], steel, [0, 0, 0], 8);
  const mainBladeGeometry = rotorBladeGeometry(7.15, 0.42, 0.075, true);
  for (let blade = 0; blade < 5; blade++) {
    const rotorBlade = new THREE.Mesh(mainBladeGeometry, rotorMaterial);
    rotorBlade.position.y = 0.6;
    rotorBlade.rotation.y = blade * Math.PI * 2 / 5;
    mainRotor.add(rotorBlade);
  }
  aircraft.add(mainRotor);
  aircraft.userData.mainRotor = mainRotor;
  aircraft.userData.airToAirStores = airToAirStores;

  aircraft.userData.vaporOffsets = [];
  aircraft.userData.aircraftKind = 'attack-helicopter';
  return aircraft;
}
