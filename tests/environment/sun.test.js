import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SunEffects } from '../../src/environment/sun.js';

describe('night sky stars', () => {
  it('shows stars in clear darkness and hides them under heavy cloud', () => {
    const previousDocument = globalThis.document;
    const gradient = () => ({ addColorStop() {} });
    globalThis.document = {
      createElement: () => ({
        getContext: () => ({
          createLinearGradient: gradient,
          createRadialGradient: gradient,
          fillRect() {},
          save() {},
          restore() {},
          translate() {},
          rotate() {},
          beginPath() {},
          arc() {},
          fill() {},
        }),
      }),
    };
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(62, 1, .1, 22000);
    try {
      const sun = new SunEffects(scene, camera);

      sun.setCloudCoverage(.35);
      sun.setTimeOfDay(23.5);
      sun.update(camera);
      expect(sun.stars.visible).toBe(true);
      expect(sun.starMaterial.uniforms.opacity.value).toBeGreaterThan(.5);
      const starPositions = sun.stars.geometry.attributes.position.array;
      for (let index = 1; index < starPositions.length; index += 3) {
        expect(starPositions[index]).toBeGreaterThanOrEqual(0);
      }

      sun.setCloudCoverage(.98);
      sun.update(camera);
      expect(sun.stars.visible).toBe(false);
      expect(sun.starMaterial.uniforms.opacity.value).toBe(0);
    } finally {
      if (previousDocument) globalThis.document = previousDocument;
      else delete globalThis.document;
    }
  });
});
