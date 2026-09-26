// Free GPU resources of a scene that is being thrown away (dungeon floors). Shared/cached textures that get
// disposed here are transparently re-uploaded by three.js the next time they are used.
export function disposeScene(scene, extra = []) {
  const geos = new Set(), mats = new Set(), texs = new Set();
  scene.traverse(o => {
    if (o.geometry) geos.add(o.geometry);
    const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => mats.add(x));
    if (o.customDepthMaterial) mats.add(o.customDepthMaterial);
    if (o.isLight && o.shadow?.map) o.shadow.dispose();
    if (o.isInstancedMesh) o.dispose?.();
  });
  for (const m of mats) {
    for (const k of ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'gradientMap']) if (m[k]?.isTexture) texs.add(m[k]);
    const u = m.userData?.u; if (u) for (const v of Object.values(u)) if (v?.value?.isTexture) texs.add(v.value);
    if (m.uniforms) for (const v of Object.values(m.uniforms)) if (v?.value?.isTexture) texs.add(v.value);
    if (m.userData?.depthMat) mats.add(m.userData.depthMat);
  }
  for (const t of extra) if (t?.isTexture) texs.add(t);
  for (const g of geos) g.dispose();
  for (const m of mats) m.dispose();
  for (const t of texs) t.dispose();
  scene.clear();
  return { geometries: geos.size, materials: mats.size, textures: texs.size };
}
