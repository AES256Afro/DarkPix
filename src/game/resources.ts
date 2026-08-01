import * as THREE from "three";

export function disposeSceneResources(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((object) => {
    const renderable = object as THREE.Mesh;
    if (renderable.geometry instanceof THREE.BufferGeometry) geometries.add(renderable.geometry);
    const objectMaterials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
    for (const objectMaterial of objectMaterials) {
      if (!(objectMaterial instanceof THREE.Material)) continue;
      materials.add(objectMaterial);
      for (const value of Object.values(objectMaterial)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });

  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
