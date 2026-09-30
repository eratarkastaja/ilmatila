import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { disposeAircraftVisual } from '../plane-models.js';
import { disposeGroundVehicleVisual } from '../vehicles.js';

describe('combat model resource lifecycle', () => {
  it('disposes aircraft instance resources but preserves shared aircraft geometry', () => {
    const root = new THREE.Group();
    const sharedAsset = new THREE.Group();
    sharedAsset.userData.sharedAircraftModel = true;
    const sharedGeometry = new THREE.BoxGeometry();
    const ownedGeometry = new THREE.BoxGeometry();
    const ownedMaterial = new THREE.MeshBasicMaterial();
    ownedMaterial.userData.ilmatilaOwned = true;
    const sharedDispose = vi.spyOn(sharedGeometry, 'dispose');
    const ownedDispose = vi.spyOn(ownedGeometry, 'dispose');
    const materialDispose = vi.spyOn(ownedMaterial, 'dispose');
    sharedAsset.add(new THREE.Mesh(sharedGeometry, ownedMaterial));
    root.add(sharedAsset, new THREE.Mesh(ownedGeometry, ownedMaterial));

    disposeAircraftVisual(root);
    disposeAircraftVisual(root);

    expect(sharedDispose).not.toHaveBeenCalled();
    expect(ownedDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it('disposes per-unit vehicle geometry without disposing shared materials', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    root.add(new THREE.Mesh(geometry, material));

    disposeGroundVehicleVisual(root);
    disposeGroundVehicleVisual(root);

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).not.toHaveBeenCalled();
  });
});
