// Boot-time GPU prewarm for a world scene. The first time the camera zooms out (or pans into a new part of the island)
// everything entering the view for the first time costs a GPU upload (geometry buffers, textures such as the species
// card atlases) and, on ANGLE/D3D, driver-side shader variants built at first draw. Drawing the whole scene once with
// frustum culling off, through the real post pipeline (same render targets, programs and shadow pass as a normal
// frame), pays all of that behind the boot splash instead of in the first zoom-out.
export function prewarmWorld(engine, scene = engine.scene) {
  const t0 = performance.now(), restore = [];
  scene.traverse(o => {
    if (o.isBatchedMesh && o.perObjectFrustumCulled) { o.perObjectFrustumCulled = false; restore.push(() => { o.perObjectFrustumCulled = true; }); }
    if (o.frustumCulled && (o.isMesh || o.isPoints || o.isLine || o.isSprite)) { o.frustumCulled = false; restore.push(() => { o.frustumCulled = true; }); }
  });
  try {
    engine.renderer.compile(scene, engine.camera);
    if (engine.post) engine.post.render(0, engine.time); else engine.renderer.render(scene, engine.camera);
  } catch (e) { console.warn('[prewarm] failed', e); } finally { for (const f of restore) f(); }
  return performance.now() - t0;
}
