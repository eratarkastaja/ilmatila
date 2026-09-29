import * as THREE from 'three';

const LOCAL_RIGHT = new THREE.Vector3(1, 0, 0);
const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class FlightControls {
  constructor(plane, camera, canvas) {
    this.plane = plane;
    this.plane.rotation.order = 'YXZ';
    this.camera = camera;
    this.speed = 235;
    this.heading = 0;
    this.pitch = 0;
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
    addEventListener('keydown', e => {
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (['Space','KeyM','KeyC','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
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
      const pulse = boost ? 1 + Math.sin(this.elapsed * 34) * 0.035 + Math.sin(this.elapsed * 57) * 0.018 : 1;
      plume.scale.setScalar(pulse);
    }
    const targetSpeed = boost ? 410 : 235;
    this.speed = THREE.MathUtils.damp(this.speed, targetSpeed, 1.2, dt);

    // W/Up lowers the nose; S/Down raises it. Arrow keys mirror WASD.
    const noseDown = Math.max(key('KeyW'), key('ArrowUp'));
    const noseUp = Math.max(key('KeyS'), key('ArrowDown'));
    const pitchInput = noseDown - noseUp;
    const left = Math.max(key('KeyA'), key('ArrowLeft'));
    const right = Math.max(key('KeyD'), key('ArrowRight'));
    const rollSpin = key('KeyE') - key('KeyQ');
    // In this aircraft's screen-space roll convention, negative bank is left.
    const bankInput = right - left;
    const turnRate = THREE.MathUtils.lerp(0.45, 1.55, Math.min(this.speed / 410, 1));
    this.updateAttitude();
    this.plane.userData.bankAngle = this.roll;

    // Pitch and Q/E roll are rotations around the aircraft's own axes. Keeping
    // them as incremental quaternion rotations avoids Euler-angle flips when
    // a loop and a barrel roll cross the inverted attitude together.
    const pitchDelta = pitchInput * 0.67 * dt;
    const rollDelta = rollSpin
      ? rollSpin * 2.5 * dt + bankInput * 1.8 * dt
      : pitchInput
        ? bankInput * 1.8 * dt
        : this.levelBankDelta(bankInput, dt);

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
    const cameraOffset = new THREE.Vector3(0, 6.2, 0).addScaledVector(this.forward, -22);
    this.camera.position.lerp(this.plane.position.clone().add(cameraOffset), 1 - Math.exp(-3.2 * dt));
    this.camera.lookAt(this.plane.position.clone().addScaledVector(this.forward, 44));
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
