import * as THREE from 'three';

const roundelWhite = new THREE.MeshBasicMaterial({ color: '#e3e6df' });
const roundelBlue = new THREE.MeshBasicMaterial({ color: '#174577' });
const roundelRaycaster = new THREE.Raycaster();

// Shared by the F-35A visual gun port and the player's/wingmen's ballistic muzzle.
export const F35_GUN_MUZZLE_OFFSET = Object.freeze({ x: 1.15, y: 0.44, z: 2.65 });
export const F35_GUN_TRACER_CLEARANCE = F35_GUN_MUZZLE_OFFSET.z + 0.05;

function roundedPanel(width, length, radius) {
  const x = width * 0.5, y = length * 0.5, r = Math.min(radius, x, y);
  const shape = new THREE.Shape();
  shape.moveTo(-x + r, -y);
  shape.lineTo(x - r, -y);
  shape.quadraticCurveTo(x, -y, x, -y + r);
  shape.lineTo(x, y - r);
  shape.quadraticCurveTo(x, y, x - r, y);
  shape.lineTo(-x + r, y);
  shape.quadraticCurveTo(-x, y, -x, y - r);
  shape.lineTo(-x, -y + r);
  shape.quadraticCurveTo(-x, -y, -x + r, -y);
  return shape;
}

function addF35GunPort(plane, friendly) {
  const port = new THREE.Group();
  port.name = 'F-35A left wing-root GAU-22/A port';
  port.position.set(F35_GUN_MUZZLE_OFFSET.x, F35_GUN_MUZZLE_OFFSET.y, F35_GUN_MUZZLE_OFFSET.z);

  // The top-left shoulder above the intake slopes outward. Fit the flush port
  // to that local tangent so it reads as a door, not an external gun pod.
  const normal = new THREE.Vector3(0.48, 0.85, 0.22).normalize();
  const forward = new THREE.Vector3(0, 0, 1);
  forward.addScaledVector(normal, -forward.dot(normal)).normalize();
  const across = new THREE.Vector3().crossVectors(forward, normal).normalize();
  port.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, forward, normal));

  const panel = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedPanel(0.14, 0.38, 0.035)),
    material(friendly ? '#829194' : '#6c7b80', 0.74, 0.18),
  );
  panel.position.z = 0.009;
  panel.renderOrder = 3;
  port.add(panel);

  const aperture = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedPanel(0.036, 0.15, 0.012)),
    material('#1e282c', 0.56, 0.22),
  );
  aperture.position.set(0, 0.035, 0.012);
  aperture.renderOrder = 4;
  port.add(aperture);
  plane.add(port);
}

export function buildF35Asset(plane, aircraftAsset, friendly) {
  const airframe = aircraftAsset.clone(true);
  airframe.userData.sharedAircraftModel=true;
  airframe.position.y = -0.38;
  airframe.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const makeSunlitMaterial = (source) => {
      const cloned = source.clone();
      cloned.userData.ilmatilaOwned=true;
      if (/canopy|glass/i.test(source.name)) {
        // MeshPhysicalMaterial.copy expects fields that MeshStandardMaterial does
        // not define (such as clearcoatNormalScale), so copy the glTF PBR values
        // through the constructor instead of calling copy() across material types.
        const canopy = new THREE.MeshPhysicalMaterial({
          color: cloned.color?.isColor ? cloned.color : '#547984',
          map: cloned.map ?? null,
          metalness: cloned.metalness ?? 0.38,
          roughness: cloned.roughness ?? 0.12,
          opacity: cloned.opacity ?? 1,
          transparent: cloned.transparent ?? false,
          alphaMap: cloned.alphaMap ?? null,
          side: cloned.side ?? THREE.DoubleSide,
          depthWrite: cloned.depthWrite ?? true,
          emissive: cloned.emissive?.isColor ? cloned.emissive : 0x000000,
          emissiveMap: cloned.emissiveMap ?? null,
          emissiveIntensity: cloned.emissiveIntensity ?? 1,
        });
        canopy.name = source.name;
        canopy.userData.ilmatilaOwned=true;
        canopy.metalness = 0.38;
        canopy.roughness = 0.105;
        canopy.ior = 1.48;
        canopy.clearcoat = 1;
        canopy.clearcoatRoughness = 0.035;
        canopy.envMapIntensity = 2.6;
        canopy.side = THREE.DoubleSide;
        cloned.dispose();
        return canopy;
      }
      // Satin low-visibility paint keeps its texture while catching a broad sky highlight.
      if (cloned.roughness !== undefined) cloned.roughness = Math.min(cloned.roughness, 0.5);
      if (cloned.metalness !== undefined) cloned.metalness = Math.max(cloned.metalness, 0.24);
      if (cloned.envMapIntensity !== undefined) cloned.envMapIntensity = 0.9;
      return cloned;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(makeSunlitMaterial)
      : makeSunlitMaterial(object.material);
    if (friendly) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.color?.multiply(new THREE.Color('#b8c9cc'));
    }
  });
  plane.add(airframe);
  addF35GunPort(plane, friendly);

  // Centers match the two native upper-wing decals in the source texture.
  // The overlay follows the wing surface so neither original decals nor
  // floating edges show through.
  addFinnishRoundel(plane, airframe, -4.007, -2.583, 0.33);
  addFinnishRoundel(plane, airframe, 3.901, -2.583, 0.33);
  plane.userData.vaporOffsets = [[-4.7, 0.24, -1.85], [4.7, 0.24, -1.85], [-1.25, 0.27, 1.55], [1.25, 0.27, 1.55]];

  if (friendly) {
    const formationLight = new THREE.MeshBasicMaterial({ color: '#55d4e8', toneMapped: false });
    formationLight.userData.ilmatilaOwned=true;
    for (const side of [-1, 1]) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.045, 0.28), formationLight);
      light.position.set(side * 4.45, 0.12, -1.72);
      plane.add(light);
    }
  }

  // The imported model has an unclosed aft-fuselage opening. Center the nozzle
  // over that opening, then slightly compress its vertical profile to follow
  // the narrower underside instead of protruding below the airframe.
  const exhaustCenterY = -0.15;
  const exhaustExitZ = -5.47;
  const exhaustAssembly = new THREE.Group();
  exhaustAssembly.name = 'F135 exhaust assembly';
  exhaustAssembly.position.set(0, exhaustCenterY, exhaustExitZ);
  exhaustAssembly.scale.y = 0.9;
  plane.add(exhaustAssembly);

  const nozzleLength = 0.72;
  const nozzleMaterial = material('#343d43', 0.42, 0.62);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.65, nozzleLength, 28, 1, true), nozzleMaterial);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = nozzleLength * 0.5;
  exhaustAssembly.add(nozzle);
  const nozzleLip = new THREE.Mesh(new THREE.TorusGeometry(0.61, 0.05, 8, 28), material('#59636a', 0.38, 0.66));
  exhaustAssembly.add(nozzleLip);
  // The source GLB leaves the rear of the fuselage open. A recessed backing
  // disk seals the nozzle throat while the smaller outer lip stays within the
  // airframe silhouette.
  const nozzleLinerLength = 0.58;
  const nozzleLiner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.63, nozzleLinerLength, 28, 1, true),
    material('#3a4246', 0.58, 0.42),
  );
  nozzleLiner.rotation.x = Math.PI / 2;
  nozzleLiner.position.z = nozzleLinerLength * 0.5;
  exhaustAssembly.add(nozzleLiner);
  const nozzleFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.67, 36),
    material('#30373a', 0.82, 0.24),
  );
  nozzleFace.position.z = 0.035;
  exhaustAssembly.add(nozzleFace);

  // A restrained petal ring gives the F135 outlet a machined nozzle face
  // instead of a featureless black hole, with one draw call for all 16 seams.
  const petalGeometry = new THREE.BoxGeometry(0.018, 0.2, 0.008);
  const petalMaterial = material('#535b5e', 0.62, 0.38);
  const petals = new THREE.InstancedMesh(petalGeometry, petalMaterial, 16);
  const petalTransform = new THREE.Object3D();
  for (let index = 0; index < 16; index++) {
    const angle = index / 16 * Math.PI * 2;
    petalTransform.position.set(
      Math.cos(angle) * 0.52,
      Math.sin(angle) * 0.52,
      0.005,
    );
    petalTransform.rotation.set(0, 0, angle - Math.PI / 2);
    petalTransform.updateMatrix();
    petals.setMatrixAt(index, petalTransform.matrix);
  }
  petals.instanceMatrix.needsUpdate = true;
  exhaustAssembly.add(petals);

  const nozzleHub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.17, 0.045, 20),
    material('#45494a', 0.68, 0.32),
  );
  nozzleHub.rotation.x = Math.PI / 2;
  nozzleHub.position.z = 0.01;
  exhaustAssembly.add(nozzleHub);

  const afterburner = createAfterburnerFlame({ radius: 0.56, length: 4.15 });
  afterburner.position.z = -0.065;
  afterburner.visible = false;
  afterburner.userData.keepSeparate = true;
  exhaustAssembly.add(afterburner);
  plane.userData.afterburner = afterburner;
}

/** Adds a FlightGear Flanker/Fulcrum model in the game's +Z-forward flight axes. */
export function buildImportedEnemyAircraft(plane, aircraftAsset, variant) {
  if (!aircraftAsset) throw new Error(`The ${variant} aircraft model has not been loaded.`);

  const airframe = aircraftAsset.clone(true);
  airframe.userData.sharedAircraftModel=true;
  // The FlightGear AC3D source models use -X as their forward axis. The game
  // uses +Z, with Y up, so rotate the visual once and center it around origin.
  airframe.rotation.y = Math.PI / 2;
  airframe.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(airframe);
  const center = bounds.getCenter(new THREE.Vector3());
  plane.userData.aircraftForwardClearance = Math.max(5.5, bounds.max.z - center.z + .18);
  airframe.position.sub(center);
  airframe.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      if (material.roughness !== undefined) material.roughness = Math.max(material.roughness, 0.38);
      if (material.metalness !== undefined) material.metalness = Math.min(material.metalness, 0.48);
      if (material.envMapIntensity !== undefined) material.envMapIntensity = 0.9;
    }
  });
  plane.add(airframe);

  const isFlanker = variant === 'su27';
  const exhaustZ = isFlanker ? -7.85 : -6.35;
  const engineSpacing = isFlanker ? 0.92 : 0.82;
  const afterburner = new THREE.Group();
  afterburner.visible = false;
  for (const side of [-1, 1]) {
    const flame = createAfterburnerFlame({ radius: 0.34, length: 2.55 });
    flame.position.set(side * engineSpacing, -0.18, exhaustZ - 0.12);
    afterburner.add(flame);
  }
  plane.add(afterburner);
  plane.userData.afterburner = afterburner;

  if (isFlanker) {
    plane.userData.platformName = 'Su-27';
    plane.userData.trailOffsets = [[-0.92, -0.08, -7.85], [0.92, -0.08, -7.85]];
    plane.userData.vaporOffsets = [[-6.2, 0.18, 0.45], [6.2, 0.18, 0.45], [-1.8, 0.2, 2.65], [1.8, 0.2, 2.65]];
  } else {
    plane.userData.platformName = 'MiG-29';
    plane.userData.trailOffsets = [[-0.82, -0.08, -6.35], [0.82, -0.08, -6.35]];
    plane.userData.vaporOffsets = [[-4.15, 0.18, -0.7], [4.15, 0.18, -0.7], [-1.25, 0.2, 2.1], [1.25, 0.2, 2.1]];
  }
}

export function buildFlanker(plane, m) {
  // Su-35 family: long nose, broad swept wings, twin nacelles and widely spaced tails.
  addFuselage(plane, m.paint, [
    [-9.2, 0.55, 0.48, 0], [-8.2, 0.95, 0.72, 0], [-6.2, 1.16, 0.88, 0],
    [-3.2, 1.2, 0.88, 0], [0.4, 1.16, 0.82, 0], [3.4, 0.9, 0.69, 0.04],
    [6.3, 0.57, 0.46, 0.03], [8.9, 0.035, 0.05, 0],
  ]);
  addPlanform(plane, m.paint, [
    [-1.4, 3.35], [1.4, 3.35], [7.35, -0.72], [7.85, -1.88], [5.7, -1.25],
    [3.22, -4.72], [-3.22, -4.72], [-5.7, -1.25], [-7.85, -1.88], [-7.35, -0.72],
  ], -0.12, 0.24);
  for (const side of [-1, 1]) {
    addPlanform(plane, m.highlight, [[side * 1.8, 2.9], [side * 7.15, -0.76], [side * 6.74, -1.08], [side * 2.05, 2.1]], 0.125, 0.025);
    addPlanform(plane, m.panel, [[side * 3.35, -4.42], [side * 5.55, -1.42], [side * 7.35, -1.75], [side * 5.35, -2.1]], 0.125, 0.025);
    box(plane, m.dark, [0.12, 0.58, 1.75], [side * 1.05, 0.02, -0.3], [0, 0, side * -0.08]);
    box(plane, m.highlight, [0.12, 0.08, 1.92], [side * 1.07, 0.31, -0.38], [0, 0, side * -0.08]);
    addTailFin(plane, m.panel, side, side * 1.04, -7.82, 3.9);

    const star = starMesh(m.glow);
    star.scale.setScalar(0.42);
    star.position.set(side * 4.0, 0.15, -1.35);
    plane.add(star);
  }
  addCanopy(plane, m.glass, 3.85, 0.74, 1.9, 0.92, 1.55);
  addPlanform(plane, m.paint, [
    [-0.86, -7.15], [-2.55, -8.75], [-2.78, -9.15], [-1.0, -8.65], [1.0, -8.65],
    [2.78, -9.15], [2.55, -8.75], [0.86, -7.15],
  ], -0.15, 0.2);

  const afterburners = new THREE.Group();
  for (const side of [-1, 1]) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.66, 1.0, 12), m.dark);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(side * 0.84, -0.25, -8.8);
    plane.add(nozzle);
    const flame = createAfterburnerFlame({ radius: 0.52, length: 3.0 });
    flame.position.set(side * 0.84, -0.25, -8.95);
    afterburners.add(flame);
  }
  afterburners.visible = false;
  plane.add(afterburners);
  plane.userData.afterburner = afterburners;
}

export function createAfterburnerFlame({ radius = 0.45, length = 2.5 } = {}) {
  const flame = new THREE.Group();
  const layers = [
    {
      radius: radius * 1.12, length: length * 1.18, opacity: 0.25,
      palette: ['#b9eaff', '#fff0c5', '#ff9b25', '#ff4c11', '#861b0c'],
    },
    {
      radius: radius * 0.84, length: length * 0.98, opacity: 0.38,
      palette: ['#fff8dc', '#fff1c0', '#ffbd36', '#fa5d13', '#9b2109'],
    },
    {
      radius: radius * 0.58, length: length * 0.79, opacity: 0.56,
      palette: ['#ffffff', '#fffce9', '#ffe078', '#ff9b20', '#bd3209'],
    },
    {
      radius: radius * 0.31, length: length * 0.58, opacity: 0.72,
      palette: ['#ffffff', '#fffef1', '#fff2b9', '#ffc144', '#e85b16'],
    },
  ];
  for (const layer of layers) {
    const material = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      vertexColors: true,
      transparent: true,
      opacity: layer.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    material.userData.ilmatilaOwned=true;
    const mesh = new THREE.Mesh(createFlameEnvelope(layer.radius, layer.length, layer.palette), material);
    mesh.userData.ilmatilaOwnedGeometry=true;
    flame.add(mesh);
  }
  // A small hot disk makes the plume read as attached to the engine when
  // viewed directly from behind, without adding a light or a particle emitter.
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: '#fff5d6',
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  coreMaterial.userData.ilmatilaOwned=true;
  const core = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.22, 20), coreMaterial);
  core.userData.ilmatilaOwnedGeometry=true;
  core.position.z = -0.015;
  flame.add(core);
  flame.visible = false;
  return flame;
}

function createFlameEnvelope(radius, length, palette) {
  const radialSegments = 20;
  const profile = [
    // Alternating expansion and contraction creates restrained shock diamonds
    // in the jet instead of the smooth, candle-like cone silhouette.
    [0, 0.62], [0.045, 0.82], [0.11, 1.02], [0.17, 1.08], [0.24, 0.96],
    [0.32, 0.84], [0.39, 0.92], [0.47, 0.79], [0.56, 0.7], [0.63, 0.76],
    [0.72, 0.59], [0.82, 0.43], [0.92, 0.27], [0.98, 0.12], [1, 0.008],
  ];
  const positions = [];
  const colors = [];
  const indices = [];
  const paletteColors = palette.map(color => new THREE.Color(color));

  for (let ring = 0; ring < profile.length; ring++) {
    const [along, width] = profile[ring];
    const color = sampleFlamePalette(paletteColors, along);
    const tailFade = 1 - smoothFlameStep(0.79, 1, along);
    for (let side = 0; side < radialSegments; side++) {
      const angle = side / radialSegments * Math.PI * 2;
      // Fixed multi-frequency lobes break the perfect cone silhouette without
      // particles, per-frame geometry edits, or additional draw calls.
      const turbulence = 1
        + Math.sin(angle * 3 + ring * 0.72) * 0.062
        + Math.sin(angle * 7 - ring * 0.91) * 0.027
        + Math.sin(angle * 11 + ring * 1.37) * 0.012;
      const ringRadius = radius * width * turbulence;
      positions.push(Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius, -length * along);
      const lightVariation = (0.94 + Math.sin(angle * 4 + ring * 0.8) * 0.045) * tailFade;
      colors.push(color.r * lightVariation, color.g * lightVariation, color.b * lightVariation);
    }
  }

  for (let ring = 0; ring < profile.length - 1; ring++) {
    for (let side = 0; side < radialSegments; side++) {
      const a = ring * radialSegments + side;
      const b = ring * radialSegments + (side + 1) % radialSegments;
      const c = (ring + 1) * radialSegments + side;
      const d = (ring + 1) * radialSegments + (side + 1) % radialSegments;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function sampleFlamePalette(colors, along) {
  const scaled = along * (colors.length - 1);
  const segment = Math.min(colors.length - 2, Math.floor(scaled));
  return colors[segment].clone().lerp(colors[segment + 1], scaled - segment);
}

function smoothFlameStep(min, max, value) {
  const t = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

function addFuselage(parent, material, profile) {
  const sides = 20, positions = [], indices = [];
  for (const [z, width, height, centerY] of profile) {
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2;
      positions.push(Math.cos(angle) * width, centerY + Math.sin(angle) * height, z);
    }
  }
  for (let ring = 0; ring < profile.length - 1; ring++) {
    for (let side = 0; side < sides; side++) {
      const a = ring * sides + side, b = ring * sides + (side + 1) % sides;
      const c = (ring + 1) * sides + side, d = (ring + 1) * sides + (side + 1) % sides;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  parent.add(new THREE.Mesh(geometry, material));
}

function addPlanform(parent, material, outline, baseY, thickness, bevel = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], -outline[0][1]);
  for (const [x, z] of outline.slice(1)) shape.lineTo(x, -z);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: bevel > 0 ? 1 : 0,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, baseY, 0);
  parent.add(new THREE.Mesh(geometry, material));
}

function addTailFin(parent, material, side, x, z, height, cant = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(side * 1.42, 0.14);
  shape.lineTo(side * 1.28, height * 0.79);
  shape.lineTo(side * 0.25, height);
  shape.lineTo(side * 0.06, height * 0.96);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false });
  const fin = new THREE.Mesh(geometry, material);
  fin.position.set(x, 0.24, z);
  fin.rotation.z = -side * cant;
  parent.add(fin);
}

function addCanopy(parent, glass, z, y, length, width, height) {
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(width, height, length);
  canopy.position.set(0, y, z);
  parent.add(canopy);
  for (const side of [-1, 1]) box(parent, material('#343e43', 0.78, 0.1), [0.06, 0.05, length * 1.85], [side * width * 0.84, y + 0.02, z]);
  box(parent, material('#89949a', 0.78, 0.12), [width * 1.35, 0.055, 0.09], [0, y + 0.015, z - length * 0.85]);
}

function sampleSurfaceY(parent, surface, x, z, fallbackY) {
  parent.updateMatrixWorld(true);
  const origin=parent.localToWorld(new THREE.Vector3(x,20,z));
  const down=new THREE.Vector3(0,-1,0).transformDirection(parent.matrixWorld);
  roundelRaycaster.set(origin,down);
  const hit=roundelRaycaster.intersectObject(surface,true)[0];
  return hit?parent.worldToLocal(hit.point.clone()).y:fallbackY;
}

function addFinnishRoundel(parent, surface, x, z, radius) {
  const centerY = sampleSurfaceY(parent, surface, x, z, 0.12);
  const leftY = sampleSurfaceY(parent, surface, x - radius, z, centerY);
  const rightY = sampleSurfaceY(parent, surface, x + radius, z, centerY);
  const nearY = sampleSurfaceY(parent, surface, x, z - radius, centerY);
  const farY = sampleSurfaceY(parent, surface, x, z + radius, centerY);
  const slopeX = (rightY - leftY) / (2 * radius);
  const slopeZ = (farY - nearY) / (2 * radius);
  const makeSurfaceDisc = (discRadius, offset) => {
    const source = new THREE.CircleGeometry(discRadius, 48);
    const sourcePositions = source.getAttribute('position');
    const positions = new Float32Array(sourcePositions.count * 3);
    for (let index = 0; index < sourcePositions.count; index++) {
      const localX = x + sourcePositions.getX(index);
      const localZ = z - sourcePositions.getY(index);
      const localY = centerY + slopeX * (localX - x) + slopeZ * (localZ - z) + offset;
      positions[index * 3] = localX;
      positions[index * 3 + 1] = localY;
      positions[index * 3 + 2] = localZ;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(source.index.clone());
    geometry.computeVertexNormals();
    source.dispose();
    return geometry;
  };

  const white = new THREE.Mesh(makeSurfaceDisc(radius, 0.012), roundelWhite);
  white.renderOrder = 3;
  parent.add(white);
  const blue = new THREE.Mesh(makeSurfaceDisc(radius * 0.6, 0.018), roundelBlue);
  blue.renderOrder = 4;
  parent.add(blue);
}

export function mergeStaticMeshes(parent) {
  const batches = new Map();
  const separate = [];
  for (const child of [...parent.children]) {
    if (!child.isMesh || child.userData.keepSeparate) {
      separate.push(child);
      continue;
    }
    child.updateMatrix();
    let geometry = child.geometry.clone();
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    if (geometry.index) {
      const expanded = geometry.toNonIndexed();
      geometry.dispose();
      geometry = expanded;
    }
    geometry.applyMatrix4(child.matrix);
    const material = child.material;
    let batch = batches.get(material);
    if (!batch) {
      batch = { positions: [], normals: [] };
      batches.set(material, batch);
    }
    batch.positions.push(...geometry.attributes.position.array);
    batch.normals.push(...geometry.attributes.normal.array);
    geometry.dispose();
    child.geometry.dispose();
  }

  parent.clear();
  for (const [material, batch] of batches) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(batch.normals, 3));
    parent.add(new THREE.Mesh(geometry, material));
  }
  for (const child of separate) parent.add(child);
}

function box(parent, material, size, position, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

export function material(color, roughness = 0.8, metalness = 0.1) {
  const result=new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: false, side: THREE.DoubleSide });
  result.userData.ilmatilaOwned=true;
  return result;
}

export function disposeAircraftVisual(root){
  if(!root||root.userData.visualResourcesDisposed)return;
  root.userData.visualResourcesDisposed=true;
  const geometries=new Set();
  const materials=new Set();
  root.traverse(object=>{
    if(object.geometry&&!isSharedAircraftGeometry(object,root))geometries.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(material?.userData?.ilmatilaOwned)materials.add(material);
    }
  });
  for(const geometry of geometries)geometry.dispose();
  for(const material of materials)material.dispose();
}

function isSharedAircraftGeometry(object,root){
  let ancestor=object.parent;
  while(ancestor&&ancestor!==root){
    if(ancestor.userData.sharedAircraftModel)return true;
    ancestor=ancestor.parent;
  }
  return false;
}

function starMesh(material) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? 1 : 0.43;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
