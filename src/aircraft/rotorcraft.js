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
  for (const side of [-1, 1]) {
    cylinder(aircraft, 0.36, 0.44, 2.45, [side * 0.78, 0.91, -1.85], paintLight, [Math.PI / 2, 0, 0], 10);
    cylinder(aircraft, 0.28, 0.34, 0.32, [side * 0.78, 0.91, -0.48], paintDark, [Math.PI / 2, 0, 0], 10);
  }
  // Deep, tandem armored cockpit glazing and blunt gun-nose fairing.
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.89, 10, 8), paintLight);
  cockpit.scale.set(0.86, 0.72, 1.72);
  cockpit.position.set(0, 0.32, 2.92);
  aircraft.add(cockpit);
  for (const z of [2.45, 3.45]) {
    for (const side of [-1, 1]) {
      box(aircraft, [0.53, 0.43, 0.065], [side * 0.34, 0.62, z], glass,
        [side * -0.12, side * 0.18, side * 0.22]);
    }
  }
  cylinder(aircraft, 0.34, 0.41, 0.62, [0, -0.27, 3.55], steel, [Math.PI / 2, 0, 0], 10);
  box(aircraft, [0.58, 0.14, 0.62], [0, -0.48, 3.4], paintDark);

  // Stub wings and paired rocket pods establish the Hind's attack role.
  box(aircraft, [7.55, 0.22, 1.52], [0, -0.48, -0.9], paintGreen, [0.02, 0, -0.045]);
  for (const side of [-1, 1]) {
    cylinder(aircraft, 0.24, 0.28, 1.65, [side * 2.95, -0.82, -0.82], paintDark);
    for (const z of [-1.28, -0.66]) {
      cylinder(aircraft, 0.085, 0.085, 0.24, [side * 2.95, -0.82, z], steel);
    }
    // Short, tucked wheeled landing gear remains distinct from a jet undercarriage.
    cylinder(aircraft, 0.13, 0.13, 0.92, [side * 0.82, -0.72, 1.65], steel, [0, 0, Math.PI / 2], 8);
    cylinder(aircraft, 0.18, 0.18, 0.17, [side * 1.28, -1.12, 1.65], paintDark, [0, 0, Math.PI / 2], 8);
  }

  // Tapered tail boom, vertical stabilizer and small tail rotor.
  cylinder(aircraft, 0.13, 0.38, 6.25, [0, 0.22, -6.05], paintGreen, [Math.PI / 2, 0, 0], 10);
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

  aircraft.userData.vaporOffsets = [];
  aircraft.userData.aircraftKind = 'attack-helicopter';
  return aircraft;
}
