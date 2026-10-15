import * as THREE from 'three';
import { createSeededRandom, DEFAULT_RANDOM_SEED } from './random.js';

const groundShotGeo = new THREE.SphereGeometry(.75, 5, 4);
const blueGroundShotMaterial = new THREE.MeshBasicMaterial({ color: '#ffd889' });
const redGroundShotMaterial = new THREE.MeshBasicMaterial({ color: '#ff785d' });
const mlrsRocketGeo = new THREE.CylinderGeometry(.11, .16, 2.2, 6);
const mlrsRocketMaterial = new THREE.MeshBasicMaterial({ color: '#f7b66c', toneMapped: false });
const rocketAxis = new THREE.Vector3(0, 1, 0);
const MLRS_ROCKETS_PER_SALVO = 6;
const MLRS_SPEED = 500;
const MLRS_GRAVITY = 16;

/** Builds ground-unit cannon and machine-gun shots. */
export class GroundWeaponSystem {
  constructor(random = createSeededRandom(DEFAULT_RANDOM_SEED)) {
    this.random = random;
    this._start = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._aim = new THREE.Vector3();
    this._direction = new THREE.Vector3();
  }

  fireGround(battle, unit,target) {
    const groundDistance=unit.mesh.position.distanceTo(battle.player.position);
    if(groundDistance<2200)battle.audio?.playDistantGun(groundDistance,'ground');
    const a=this._start.copy(unit.mesh.position);
    a.y+=5;
    const b=target.mesh.position.clone();
    b.y+=3;
    const flightTime=a.distanceTo(b)/280;
    if(target.velocity)b.addScaledVector(target.velocity,flightTime*.72);
    const weapon = unit.mesh.userData.vehicleSpec?.weapon ?? '';
    const dispersion = weapon.includes('120') || weapon.includes('125') ? .006 : weapon.includes('30') ? .013 : .021;
    const miss = Math.max(5, a.distanceTo(b) * dispersion);
    b.x += (this.random() - .5) * miss * 2;
    b.z += (this.random() - .5) * miss * 2;
    b.y += (this.random() - .5) * miss * .45;
    const color=unit.team==='blue'?'#ffd889':'#ff785d';
    battle.fx?.addTracer(a,b,color);
    const line=new THREE.Mesh(groundShotGeo,unit.team==='blue'?blueGroundShotMaterial:redGroundShotMaterial);line.position.copy(a);battle.scene.add(line);
    const velocity=b.sub(a).normalize().multiplyScalar(280);
    battle.addProjectile({projectile:true,ground:true,mesh:line,velocity,life:flightTime,target});
  }

  fireMlrs(battle, unit, target) {
    const distance = unit.mesh.position.distanceTo(target.mesh.position);
    if (distance < 500) return;
    battle.audio?.playDistantGun(distance, 'ground');

    const mount = unit.mesh.userData.mlrsMount;
    this._target.copy(target.mesh.position);
    this._target.y += 3;
    if (target.velocity) this._target.addScaledVector(target.velocity, Math.min(18, distance / MLRS_SPEED) * .68);
    if (mount) {
      unit.mesh.updateWorldMatrix(true, false);
      const localTarget = unit.mesh.worldToLocal(this._target.clone());
      mount.rotation.y = Math.atan2(localTarget.x, localTarget.z);
    }

    for (let index = 0; index < MLRS_ROCKETS_PER_SALVO; index++) {
      const spread = 90 + this.random() * 130;
      this._aim.copy(this._target);
      this._aim.x += (this.random() - .5) * spread * 2;
      this._aim.z += (this.random() - .5) * spread * 2;
      const flightTime = Math.max(2.4, unit.mesh.position.distanceTo(this._aim) / MLRS_SPEED);
      unit.mesh.localToWorld(this._start.set(
        (index % 2 ? .42 : -.42),
        2.95 + (index % 3) * .05,
        -1.05,
      ));
      const velocity = this._direction.copy(this._aim).sub(this._start);
      velocity.y = (this._aim.y - this._start.y + .5 * MLRS_GRAVITY * flightTime ** 2) / flightTime;
      velocity.multiplyScalar(1 / flightTime);
      const rocket = new THREE.Mesh(mlrsRocketGeo, mlrsRocketMaterial);
      rocket.position.copy(this._start);
      rocket.quaternion.setFromUnitVectors(rocketAxis, velocity.clone().normalize());
      battle.scene.add(rocket);
      battle.addFriendlyProjectile({
        projectile: true,
        ground: true,
        ballistic: true,
        canHitGround: true,
        ally: true,
        mlrs: true,
        mesh: rocket,
        velocity,
        gravity: MLRS_GRAVITY,
        life: flightTime + .9,
        target,
        impactPoint: this._aim.clone(),
        damage: 3.5,
        splashDamage: 4.8,
        blastRadius: 260,
        sourceUnit: unit,
      });
    }
  }
}
