import * as THREE from 'three';

const groundShotGeo = new THREE.SphereGeometry(.75, 5, 4);
const blueGroundShotMaterial = new THREE.MeshBasicMaterial({ color: '#ffd889' });
const redGroundShotMaterial = new THREE.MeshBasicMaterial({ color: '#ff785d' });

/** Builds ground-unit cannon and machine-gun shots. */
export class GroundWeaponSystem {
  fireGround(battle, unit,target) {
    const groundDistance=unit.mesh.position.distanceTo(battle.player.position);
    if(groundDistance<2200)battle.audio?.playDistantGun(groundDistance,'ground');
    const a=unit.mesh.position.clone().add(new THREE.Vector3(0,5,0));
    const b=target.mesh.position.clone().add(new THREE.Vector3(0,3,0));
    const flightTime=a.distanceTo(b)/280;
    if(target.velocity)b.addScaledVector(target.velocity,flightTime*.72);
    const weapon = unit.mesh.userData.vehicleSpec?.weapon ?? '';
    const dispersion = weapon.includes('120') || weapon.includes('125') ? .006 : weapon.includes('30') ? .013 : .021;
    const miss = Math.max(5, a.distanceTo(b) * dispersion);
    b.x += (Math.random() - .5) * miss * 2;
    b.z += (Math.random() - .5) * miss * 2;
    b.y += (Math.random() - .5) * miss * .45;
    const color=unit.team==='blue'?'#ffd889':'#ff785d';
    battle.fx?.addTracer(a,b,color);
    const line=new THREE.Mesh(groundShotGeo,unit.team==='blue'?blueGroundShotMaterial:redGroundShotMaterial);line.position.copy(a);battle.scene.add(line);
    const velocity=b.sub(a).normalize().multiplyScalar(280);
    battle.addProjectile({projectile:true,ground:true,mesh:line,velocity,life:flightTime,target});
  }
}
