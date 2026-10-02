import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FlightFX } from '../../src/effects/fx.js';

describe('FlightFX missile trails', () => {
  it('samples a smooth trail at a fixed interval when frame times do not align', () => {
    const scene = new THREE.Scene();
    const fx = new FlightFX(scene);
    const camera = new THREE.PerspectiveCamera();
    const mesh = new THREE.Group();
    scene.add(mesh);
    const missile = { homing: true, motorBurning: true, mesh };

    fx.emitMissileTrails(1 / 60, [missile], camera);
    mesh.position.z = 10;
    fx.emitMissileTrails(1 / 60, [missile], camera);
    mesh.position.z = 20;
    fx.emitMissileTrails(1 / 60, [missile], camera);

    const trail = fx.missileTrailStates.get(missile);
    expect(trail.count).toBe(2);
    const sampledRearZ = trail.positions[5];
    expect(sampledRearZ).toBeCloseTo(13.15, 1);

    fx.dispose();
  });
});
