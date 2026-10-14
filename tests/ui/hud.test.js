import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  isWorldMarkerOnScreen,
  shouldShowTargetMarker,
  shouldShowWaypointMarker,
} from '../../src/ui/hud.js';

describe('TacticalHud world marker visibility', () => {
  it('keeps a visible projected target on the HUD instead of turning it into an edge arrow', () => {
    const projected = new THREE.Vector3(.93, -.22, .4);

    expect(isWorldMarkerOnScreen(projected, false, 1366, 768)).toBe(true);
  });

  it('uses the edge arrow only when the projected point leaves the viewport', () => {
    expect(isWorldMarkerOnScreen(new THREE.Vector3(1.04, 0, .4), false, 1366, 768)).toBe(false);
    expect(isWorldMarkerOnScreen(new THREE.Vector3(.2, 0, .4), true, 1366, 768)).toBe(false);
  });

  it('keeps a target arrow hidden until its square has been shown once', () => {
    const projected = new THREE.Vector3(-1.04, .1, .4);

    expect(isWorldMarkerOnScreen(projected, false, 1366, 768)).toBe(false);
    expect(shouldShowTargetMarker(false, false)).toBe(false);
    expect(shouldShowTargetMarker(false, true)).toBe(true);
  });

  it('keeps the RTB waypoint visible off-screen while ingress remains gated', () => {
    expect(shouldShowWaypointMarker(false, 'navigation')).toBe(false);
    expect(shouldShowWaypointMarker(false, 'rtb')).toBe(true);
    expect(shouldShowWaypointMarker(false, 'objective')).toBe(true);
    expect(shouldShowWaypointMarker(true, 'navigation')).toBe(true);
  });
});
