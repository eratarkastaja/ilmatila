import * as THREE from 'three';

const roundelWhite = new THREE.MeshBasicMaterial({ color: '#e3e6df' });
const roundelBlue = new THREE.MeshBasicMaterial({ color: '#174577' });
const roundelRaycaster = new THREE.Raycaster();

export function buildF35Asset(plane, aircraftAsset, friendly) {
  const airframe = aircraftAsset.clone(true);
  airframe.position.y = -0.38;
  airframe.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const makeSunlitMaterial = (source) => {
      const cloned = source.clone();
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

  // Place circular Finnish roundels on the upper wing, behind the leading edge.
  for (const side of [-1, 1]) {
    const x=side*3.15, z=-2.05;
    const surfaceY=sampleSurfaceY(plane,airframe,x,z,0.12);
    addFinnishRoundel(plane,x,z,0.42,surfaceY);
  }
  plane.userData.vaporOffsets = [[-4.7, 0.24, -1.85], [4.7, 0.24, -1.85], [-1.25, 0.27, 1.55], [1.25, 0.27, 1.55]];

  if (friendly) {
    const formationLight = new THREE.MeshBasicMaterial({ color: '#55d4e8', toneMapped: false });
    for (const side of [-1, 1]) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.045, 0.28), formationLight);
      light.position.set(side * 4.45, 0.12, -1.72);
      plane.add(light);
    }
  }

  const nozzleMaterial = material('#343d43', 0.38, 0.68);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.56, 0.78, 16, 1, true), nozzleMaterial);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, -0.02, -7.55);
  plane.add(nozzle);
  const nozzleLip = new THREE.Mesh(new THREE.TorusGeometry(0.51, 0.075, 8, 20), material('#59636a', 0.34, 0.72));
  nozzleLip.position.set(0, -0.02, -7.94);
  plane.add(nozzleLip);
  const nozzleInterior = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.42, 0.1, 16), material('#141a1e', 0.56, 0.35));
  nozzleInterior.rotation.x = Math.PI / 2;
  nozzleInterior.position.set(0, -0.02, -7.95);
  plane.add(nozzleInterior);

  const afterburner = createAfterburnerFlame({ radius: 0.42, length: 2.5 });
  afterburner.position.set(0, -0.02, -7.9);
  afterburner.visible = false;
  afterburner.userData.keepSeparate = true;
  plane.add(afterburner);
  plane.userData.afterburner = afterburner;
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
    const flame = createAfterburnerFlame({ radius: 0.48, length: 2.8 });
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
    { radius: radius * 1.12, length, color: '#714cff', opacity: 0.2 },
    { radius: radius * 0.86, length: length * 0.9, color: '#ff4a12', opacity: 0.66 },
    { radius: radius * 0.54, length: length * 0.72, color: '#ff9b24', opacity: 0.92 },
    { radius: radius * 0.27, length: length * 0.46, color: '#fff0bd', opacity: 1 },
  ];
  for (const layer of layers) {
    const material = new THREE.MeshBasicMaterial({
      color: layer.color,
      transparent: true,
      opacity: layer.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(layer.radius, layer.length, 12, 1), material);
    // ConeGeometry points along +Y; turn its bright tip aft along -Z.
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.z = -layer.length * 0.48;
    flame.add(mesh);
  }
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.19, 10, 7),
    new THREE.MeshBasicMaterial({ color: '#fff7d8', blending: THREE.AdditiveBlending, toneMapped: false })
  );
  core.scale.set(1, 1, 1.9);
  core.position.z = -0.08;
  flame.add(core);
  flame.visible = false;
  return flame;
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

function addFinnishRoundel(parent, x, z, radius, surfaceY) {
  const white = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), roundelWhite);
  white.rotation.x = -Math.PI / 2;
  white.position.set(x, surfaceY + 0.008, z);
  parent.add(white);
  const blue = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.6, 32), roundelBlue);
  blue.rotation.x = -Math.PI / 2;
  blue.position.set(x, surfaceY + 0.015, z);
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
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: false, side: THREE.DoubleSide });
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
