import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FlightControls } from '../../src/input/controls.js';
import { FuelSystem } from '../../src/combat/fuel-system.js';

function makeControls() {
  vi.stubGlobal('addEventListener', vi.fn());
  vi.stubGlobal('document', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    pointerLockElement: null,
  });
  vi.stubGlobal('window', { addEventListener: vi.fn() });

  const canvas = {
    clientWidth: 1280,
    clientHeight: 720,
    addEventListener: vi.fn(),
    classList: {
      classes: new Set(),
      toggle(name, force) {
        const enabled = force ?? !this.classes.has(name);
        if (enabled) this.classes.add(name);
        else this.classes.delete(name);
      },
      contains(name) { return this.classes.has(name); },
    },
    getBoundingClientRect: () => ({ width: 1280, height: 720 }),
  };
  const controls = new FlightControls(new THREE.Object3D(), new THREE.PerspectiveCamera(), canvas);
  return { controls, canvas };
}

function lockMouse(controls, canvas) {
  document.pointerLockElement = canvas;
  controls.onPointerLockChange();
}

afterEach(() => vi.unstubAllGlobals());

describe('FlightControls', () => {
  it('ignores cursor travel when pointer lock is not active', () => {
    const { controls } = makeControls();
    controls.setEnabled(true);

    controls.onPointerMove({ pointerType: 'mouse', movementX: 210, movementY: -160 });
    for (let frame = 0; frame < 12; frame++) controls.update(1 / 60);

    expect(controls.pointerLockActive).toBe(false);
    expect(controls.mouseDeltaX).toBe(0);
    expect(controls.mouseDeltaY).toBe(0);
    expect(controls.plane.quaternion.angleTo(new THREE.Quaternion())).toBe(0);
  });

  it('uses locked relative motion for smooth pitch and roll input', () => {
    const { controls, canvas } = makeControls();
    controls.setEnabled(true);
    lockMouse(controls, canvas);

    controls.onPointerMove({ pointerType: 'mouse', movementX: 14, movementY: 30 });
    expect(controls.mouseDeltaX).toBe(14);
    expect(controls.mouseDeltaY).toBe(30);
    for (let frame = 0; frame < 12; frame++) controls.update(1 / 60);

    expect(controls.plane.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.001);
    expect(controls.mouseDeltaX).toBe(0);
    expect(controls.mouseDeltaY).toBe(0);
  });

  it('clears residual mouse input when pointer lock is released for pause', () => {
    const { controls, canvas } = makeControls();
    controls.setEnabled(true);
    lockMouse(controls, canvas);
    controls.onPointerMove({ pointerType: 'mouse', movementX: 32, movementY: 24 });

    document.pointerLockElement = null;
    controls.onPointerLockChange();

    expect(controls.pointerLockActive).toBe(false);
    expect(controls.mouseDeltaX).toBe(0);
    expect(controls.mouseDeltaY).toBe(0);
    expect(controls.mouseRoll).toBe(0);
    expect(controls.mousePitch).toBe(0);
  });

  it('shows the cursor after unlock and hides it again when the canvas recaptures the mouse', async () => {
    const { controls, canvas } = makeControls();
    controls.setEnabled(true);
    canvas.requestPointerLock = vi.fn(() => {
      document.pointerLockElement = canvas;
      controls.onPointerLockChange();
      return Promise.resolve();
    });

    lockMouse(controls, canvas);
    expect(canvas.classList.contains('mouse-locked')).toBe(true);

    document.pointerLockElement = null;
    controls.onPointerLockChange();
    expect(canvas.classList.contains('mouse-locked')).toBe(false);

    controls.onCanvasPointerDown({ pointerType: 'mouse' });
    await expect(controls.mouseCaptureRequest).resolves.toBe(true);
    expect(canvas.classList.contains('mouse-locked')).toBe(true);
  });

  it('confirms mouse capture only after the browser locks the canvas', async () => {
    const { controls, canvas } = makeControls();
    canvas.requestPointerLock = vi.fn(() => {
      document.pointerLockElement = canvas;
      controls.onPointerLockChange();
      return Promise.resolve();
    });

    await expect(controls.requestMouseCapture()).resolves.toBe(true);
    expect(controls.pointerLockActive).toBe(true);
  });

  it('reports a rejected pointer lock request to the sortie', async () => {
    const { controls, canvas } = makeControls();
    canvas.requestPointerLock = vi.fn(() => Promise.reject(new Error('pointer lock denied')));

    await expect(controls.requestMouseCapture()).resolves.toBe(false);
    expect(controls.pointerLockActive).toBe(false);
  });

  it('keeps keyboard nose-down input available after pause', () => {
    const { controls } = makeControls();
    controls.setEnabled(false);
    controls.setEnabled(true);
    controls.keys.add('KeyW');
    controls.update(1 / 60);
    controls.forward.set(0, 0, 1).applyQuaternion(controls.plane.quaternion);

    expect(controls.forward.y).toBeLessThan(0);
  });

  it('uses the sortie fuel reserve for afterburner and keeps a depleted aircraft gliding', () => {
    const { controls } = makeControls();
    const fuel = new FuelSystem({ enduranceMinutes: 1, afterburnerMultiplier: 5 });
    controls.keys.add('ShiftLeft');

    for (let second = 0; second < 12; second++) controls.update(1, fuel);
    expect(fuel.remainingSeconds).toBe(0);
    expect(controls.plane.userData.boosting).toBe(true);

    controls.update(.1, fuel);
    expect(controls.plane.userData.boosting).toBe(false);
    expect(controls.speed).toBeLessThan(410);
    expect(controls.speed).toBeGreaterThan(170);
  });
});
