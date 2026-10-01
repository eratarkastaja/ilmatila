import * as THREE from 'three';

const LOCAL_RIGHT = new THREE.Vector3(1, 0, 0);
const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const GAME_KEY_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space', 'KeyM', 'KeyR', 'KeyT', 'KeyC',
  'Minus', 'NumpadAdd', 'NumpadSubtract',
]);
const CAMERA_DISTANCE_DEFAULT = 22;
const CAMERA_DISTANCE_MIN = 3.8;
const CAMERA_DISTANCE_MAX = 70;

function flightKeyCode(event) {
  if (event.key === '+' || event.key === 'Add' || event.code === 'NumpadAdd' || (event.code === 'Equal' && event.shiftKey)) return 'ZoomIn';
  if (event.key === '−'
    || event.key === '-' || event.key === 'Subtract' || event.code === 'Minus' || event.code === 'NumpadSubtract') return 'ZoomOut';
  return GAME_KEY_CODES.has(event.code) ? event.code : null;
}

function shapeMouseAxis(value) {
  const magnitude = Math.abs(value);
  const deadZone = .015;
  if (magnitude <= deadZone) return 0;
  const normalized = (magnitude - deadZone) / (1 - deadZone);
  return Math.sign(value) * normalized ** 1.05;
}

export class FlightControls {
  constructor(plane, camera, canvas) {
    this.plane = plane;
    this.plane.rotation.order = 'YXZ';
    this.camera = camera;
    this.canvas = canvas;
    this.speed = 235;
    this.heading = 0;
    this.pitch = 0;
    this.pitchCommand = 0;
    this.roll = 0;
    this.elapsed = 0;
    this.keys = new Set();
    this.enabled = true;
    this.forward = new THREE.Vector3();
    this.aircraftUp = new THREE.Vector3();
    this.levelUp = new THREE.Vector3();
    this.bankCross = new THREE.Vector3();
    this.bankReferenceValid = true;
    this.pitchRotation = new THREE.Quaternion();
    this.rollRotation = new THREE.Quaternion();
    this.yawRotation = new THREE.Quaternion();
    this.cameraDistance = CAMERA_DISTANCE_DEFAULT;
    this.cameraDistanceTarget = CAMERA_DISTANCE_DEFAULT;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.mouseRoll = 0;
    this.mousePitch = 0;
    this.mouseViewportWidth = canvas.clientWidth || innerWidth;
    this.mouseViewportHeight = canvas.clientHeight || innerHeight;
    this.pointerLockActive = false;
    this.cameraOffset = new THREE.Vector3();
    this.cameraFollowOffset = new THREE.Vector3(0, 5, -CAMERA_DISTANCE_DEFAULT);
    this.cameraTarget = new THREE.Vector3();
    this.onKeyDown = event => {
      const code = flightKeyCode(event);
      if (!code) return;
      if (event.ctrlKey || event.altKey || event.metaKey) {
        event.preventDefault();
        return;
      }
      if (!this.enabled) return;
      if (code === 'ZoomIn' || code === 'ZoomOut') {
        event.preventDefault();
        if (code === 'ZoomIn') {
          this.keys.delete('ShiftLeft');
          this.keys.delete('ShiftRight');
        }
        const step = event.repeat ? 1.3 : 4;
        this.adjustCameraZoom(code === 'ZoomIn' ? -step : step);
        return;
      }
      this.keys.add(code);
      event.preventDefault();
    };
    this.onKeyUp = event => {
      const code = flightKeyCode(event);
      if (code) this.keys.delete(code);
    };
    this.onBlur = () => {
      this.keys.clear();
      this.resetMouseAim();
    };
    this.onPointerMove = event => {
      if (!this.enabled || !this.pointerLockActive || event.pointerType !== 'mouse') return;
      const bounds = this.canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      this.mouseViewportWidth = bounds.width;
      this.mouseViewportHeight = bounds.height;
      // Use locked relative motion as a short control input. Accumulating
      // unlocked cursor travel into a virtual stick changes sensitivity at the
      // window edge and makes pause/resume feel different from normal flight.
      this.mouseDeltaX += event.movementX;
      this.mouseDeltaY += event.movementY;
    };
    this.onCanvasPointerDown = event => {
      if (!this.enabled || this.pointerLockActive || event.pointerType !== 'mouse') return;
      this.requestMouseCapture();
    };
    this.onPointerLockChange = () => {
      this.pointerLockActive = document.pointerLockElement === this.canvas;
      this.canvas.classList.toggle('mouse-locked', this.pointerLockActive);
      this.resetMouseAim();
    };
    this.onWheel = event => {
      if (!this.enabled || event.ctrlKey) return;
      event.preventDefault();
      const deltaUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
      this.adjustCameraZoom(event.deltaY * deltaUnit * 0.07);
    };
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onCanvasPointerDown);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    window.addEventListener('wheel', this.onWheel, { passive: false, capture: true });
    this.camera.position.set(0, 75, -22);
    this.camera.lookAt(0, 70, 30);
  }

  update(dt) {
    if (!this.enabled) return;
    this.elapsed += dt;
    const key = code => this.keys.has(code) ? 1 : 0;
    const boost = key('ShiftLeft') || key('ShiftRight');
    this.plane.userData.boosting = Boolean(boost);
    if (this.plane.userData.afterburner) {
      const plume = this.plane.userData.afterburner;
      plume.visible = Boolean(boost);
      const pulse = boost ? 1 + Math.sin(this.elapsed * 34) * 0.07 + Math.sin(this.elapsed * 57) * 0.025 : 1;
      const flutter = boost ? Math.sin(this.elapsed * 23) * 0.018 : 0;
      plume.scale.set(1 + flutter, 1 - flutter * 0.65, pulse);
    }
    const targetSpeed = boost ? 410 : 235;
    this.speed = THREE.MathUtils.damp(this.speed, targetSpeed, 1.2, dt);

    // W/Up lowers the nose; S/Down raises it. Arrow keys mirror WASD.
    const noseDown = Math.max(key('KeyW'), key('ArrowUp'));
    const noseUp = Math.max(key('KeyS'), key('ArrowDown'));
    const mouseDt = Math.max(dt, 1 / 240);
    const mouseXRate = this.pointerLockActive && this.mouseViewportWidth
      ? this.mouseDeltaX * 2 / (this.mouseViewportWidth * mouseDt)
      : 0;
    const mouseYRate = this.pointerLockActive && this.mouseViewportHeight
      ? this.mouseDeltaY * 2 / (this.mouseViewportHeight * mouseDt)
      : 0;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    // Scale cursor speed into bounded control input. Moderate motion remains
    // precise; fast sweeps saturate instead of producing extreme corrections.
    const targetMousePitch = shapeMouseAxis(THREE.MathUtils.clamp(mouseYRate * 0.8, -1, 1)) * 0.68;
    const targetMouseRoll = shapeMouseAxis(THREE.MathUtils.clamp(mouseXRate * 0.8, -1, 1)) * 0.68;
    this.mousePitch = THREE.MathUtils.damp(this.mousePitch, targetMousePitch, 18, dt);
    this.mouseRoll = THREE.MathUtils.damp(this.mouseRoll, targetMouseRoll, 18, dt);
    const pitchInput = THREE.MathUtils.clamp(noseDown - noseUp + this.mousePitch, -1, 1);
    const pitchResponse = this.pointerLockActive ? 14 : 8;
    this.pitchCommand = THREE.MathUtils.damp(this.pitchCommand, pitchInput, pitchInput ? pitchResponse : 12, dt);
    const left = Math.max(key('KeyA'), key('ArrowLeft'));
    const right = Math.max(key('KeyD'), key('ArrowRight'));
    const rollSpin = key('KeyE') - key('KeyQ');
    // In this aircraft's screen-space roll convention, negative bank is left.
    const bankInput = THREE.MathUtils.clamp(right - left + this.mouseRoll, -1, 1);
    const handlingFactor = this.plane.userData.handlingFactor ?? 1;
    const turnRate = THREE.MathUtils.lerp(0.45, 1.55, Math.min(this.speed / 410, 1)) * handlingFactor;
    this.updateAttitude();
    this.plane.userData.bankAngle = this.roll;

    // Pitch and Q/E roll are rotations around the aircraft's own axes. Keeping
    // them as incremental quaternion rotations avoids Euler-angle flips when
    // a loop and a barrel roll cross the inverted attitude together.
    const pitchDelta = this.pitchCommand * 0.52 * handlingFactor * dt;
    const rollDelta = rollSpin
      ? (rollSpin * 2.5 + bankInput * 1.8) * handlingFactor * dt
      : pitchInput
        ? bankInput * 1.8 * handlingFactor * dt
        : this.levelBankDelta(bankInput, dt) * handlingFactor;

    this.pitchRotation.setFromAxisAngle(LOCAL_RIGHT, pitchDelta);
    this.rollRotation.setFromAxisAngle(LOCAL_FORWARD, rollDelta);
    this.plane.quaternion.multiply(this.pitchRotation).multiply(this.rollRotation);

    // Banking bends the flight path around world up. This keeps A/D steering
    // responsive even while the airframe is inverted or recovering from a roll.
    const headingDelta = -Math.sin(this.roll) * turnRate * dt;
    this.yawRotation.setFromAxisAngle(WORLD_UP, headingDelta);
    this.plane.quaternion.premultiply(this.yawRotation).normalize();
    this.updateAttitude();

    this.forward.set(0, 0, 1).applyQuaternion(this.plane.quaternion);
    this.plane.position.addScaledVector(this.forward, this.speed * dt);
    // Keep the ceiling soft, but allow the aircraft to reach terrain and objects.
    // The enlarged envelope lets players climb into the thin, cold air where contrails form.
    this.plane.position.y = Math.min(this.plane.position.y, 8800);
    // Keep the chase view above the airframe instead of banking it sideways with the jet.
    this.cameraDistance = THREE.MathUtils.damp(this.cameraDistance, this.cameraDistanceTarget, 14, dt);
    const cameraHeight = this.cameraDistance < CAMERA_DISTANCE_DEFAULT
      ? THREE.MathUtils.lerp(2.4, 6.2, (this.cameraDistance - CAMERA_DISTANCE_MIN) / (CAMERA_DISTANCE_DEFAULT - CAMERA_DISTANCE_MIN))
      : 6.2 + (this.cameraDistance - CAMERA_DISTANCE_DEFAULT) * .08;
    this.cameraOffset.set(0, cameraHeight, 0)
      .addScaledVector(this.forward, -this.cameraDistance);
    const zooming = Math.abs(this.cameraDistanceTarget - this.cameraDistance) > 0.2;
    const followRate = zooming ? 14 : 10;
    this.cameraFollowOffset.lerp(this.cameraOffset, 1 - Math.exp(-followRate * dt));
    if (this.cameraFollowOffset.lengthSq() > 1e-6) {
      this.cameraFollowOffset.setLength(this.cameraOffset.length());
    } else {
      this.cameraFollowOffset.copy(this.cameraOffset);
    }
    // Smooth only the camera's offset around the jet. Following its world-space
    // position with a spring makes the aircraft outrun the camera at high speed.
    this.cameraTarget.copy(this.plane.position).add(this.cameraFollowOffset);
    this.camera.position.copy(this.cameraTarget);
    this.camera.lookAt(this.cameraTarget.copy(this.plane.position).addScaledVector(this.forward, this.cameraDistance * 2));
  }

  resetMouseAim() {
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.mouseRoll = 0;
    this.mousePitch = 0;
  }

  requestMouseCapture() {
    if (this.pointerLockActive || typeof this.canvas.requestPointerLock !== 'function') return;
    this.resetMouseAim();
    try {
      const request = this.canvas.requestPointerLock();
      request?.catch?.(() => {});
    } catch {
      this.resetMouseAim();
    }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.keys.clear();
      this.resetMouseAim();
      if (this.pointerLockActive || document.pointerLockElement === this.canvas) {
        document.exitPointerLock?.();
      }
    }
  }

  resetCameraZoom() {
    this.cameraDistance = CAMERA_DISTANCE_DEFAULT;
    this.cameraDistanceTarget = CAMERA_DISTANCE_DEFAULT;
    this.cameraOffset.set(0, 6.2, -CAMERA_DISTANCE_DEFAULT);
    this.cameraFollowOffset.set(0, 5, -CAMERA_DISTANCE_DEFAULT);
  }

  adjustCameraZoom(delta) {
    this.cameraDistanceTarget = THREE.MathUtils.clamp(
      this.cameraDistanceTarget + delta,
      CAMERA_DISTANCE_MIN,
      CAMERA_DISTANCE_MAX,
    );
  }

  updateAttitude() {
    this.forward.set(0, 0, 1).applyQuaternion(this.plane.quaternion).normalize();
    this.aircraftUp.set(0, 1, 0).applyQuaternion(this.plane.quaternion).normalize();

    // In this flight model, negative pitch input raises the nose.
    this.pitch = -Math.asin(THREE.MathUtils.clamp(this.forward.y, -1, 1));
    const horizontalForwardSq = this.forward.x * this.forward.x + this.forward.z * this.forward.z;
    if (horizontalForwardSq > 1e-4) this.heading = Math.atan2(this.forward.x, this.forward.z);

    // Bank is the aircraft's up direction relative to the local horizon plane.
    // It is undefined when pointing almost straight up/down, so hold the last
    // stable value through that small region of a loop.
    this.levelUp.copy(WORLD_UP).addScaledVector(this.forward, -this.forward.y);
    if (this.levelUp.lengthSq() > 0.025) {
      this.levelUp.normalize();
      const sinBank = this.bankCross.crossVectors(this.levelUp, this.aircraftUp).dot(this.forward);
      const cosBank = THREE.MathUtils.clamp(this.levelUp.dot(this.aircraftUp), -1, 1);
      this.roll = Math.atan2(sinBank, cosBank);
      this.bankReferenceValid = true;
    } else {
      this.bankReferenceValid = false;
    }
    this.plane.userData.bankAngle = this.roll;
  }

  levelBankDelta(bankInput, dt) {
    // Let the player hold a commanded bank; otherwise gently roll wings level.
    if (!this.bankReferenceValid) return bankInput * 1.8 * dt;
    const targetBank = bankInput * 1.12;
    let difference = THREE.MathUtils.euclideanModulo(targetBank - this.roll + Math.PI, Math.PI * 2) - Math.PI;
    if (Math.abs(difference) < 0.006) difference = 0;
    return THREE.MathUtils.clamp(difference * 3.8 * dt, -1.8 * dt, 1.8 * dt);
  }
}
