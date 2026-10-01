import * as THREE from 'three';
import { createAfterburnerFlame } from '../aircraft/plane.js';

// Game-tuned burn and coast budgets reward a good lock without allowing
// missiles to steer indefinitely or across an entire theater.
export const MISSILE_PROFILES = {
  playerAir: {
    designation: 'AIM-120C · AMRAAM', count: 6, damage: 5, seeker: 'radar',
    speed: 600, burnTime: 10.5, life: 15, coastDrag: 0.1, proximityRadius: 24, proximityDamage: .8,
  },
  playerGround: {
    designation: 'AGM-65D · MAVERICK', count: 4, damage: 9, seeker: 'ir',
    speed: 400, burnTime: 11.5, life: 14, coastDrag: 0.16, proximityRadius: 17, proximityDamage: .82,
  },
  hostile: { speed: 305, burnTime: 10, life: 15, coastDrag: 0.1 },
};

const missileMaterial = (color, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
const missilePool=[];
const missilePoolLimit=64;

export function updateMissileMotor(missile, dt) {
  if (missile.motorBurning) {
    missile.burnRemaining = Math.max(0, missile.burnRemaining - dt);
    if (missile.burnRemaining > 0) return;
    missile.motorBurning = false;
    missile.guidanceActive = false;
    if (missile.mesh?.userData.engineFlame) missile.mesh.userData.engineFlame.visible = false;
  }
  missile.velocity.multiplyScalar(Math.exp(-missile.coastDrag * dt));
}

export function createMissile(color) {
  const pooled=missilePool.pop();
  if(pooled){
    pooled.position.set(0,0,0);
    pooled.rotation.set(0,0,0);
    pooled.scale.set(1,1,1);
    pooled.visible=true;
    pooled.userData.bodyMaterial.color.set(color);
    pooled.userData.engineFlame.visible=false;
    return pooled;
  }

  const missile = new THREE.Group();
  const bodyPaint=missileMaterial(color);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 3.2, 8), bodyPaint);
  body.rotation.x = Math.PI / 2;
  missile.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.75, 8), missileMaterial('#252d32'));
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 1.95;
  missile.add(nose);

  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.7), missileMaterial('#515c60'));
    fin.position.set(side * 0.28, 0, -1.05);
    missile.add(fin);
  }

  const flame = createAfterburnerFlame({ radius: 0.24, length: 1.45 });
  flame.position.z = -1.65;
  flame.visible = false;
  missile.add(flame);
  missile.userData.engineFlame = flame;
  missile.userData.bodyMaterial=bodyPaint;
  missile.userData.pooledMissile=true;
  return missile;
}

export function releaseMissile(missile){
  if(!missile?.userData.pooledMissile)return false;
  missile.removeFromParent();
  missile.visible=false;
  missile.userData.engineFlame.visible=false;
  if(missilePool.length<missilePoolLimit)missilePool.push(missile);
  else disposeMissile(missile);
  return true;
}

export function disposeMissilePool(){
  for(const missile of missilePool)disposeMissile(missile);
  missilePool.length=0;
}

function disposeMissile(missile){
  const geometries=new Set();
  const materials=new Set();
  missile.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material])if(material)materials.add(material);
  });
  for(const geometry of geometries)geometry.dispose();
  for(const material of materials)material.dispose();
}
