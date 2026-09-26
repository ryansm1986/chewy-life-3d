(() => {
  // keep the mouse cursor data pointing at the nearest monster by dispatching real mousemove events on the canvas each 100ms
  const cv = G.engine.renderer.domElement;
  window.__aimIv = setInterval(() => {
    const m = R.near(); if (!m) return;
    const [x, y] = R.scr(m.pos);
    cv.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y - 6, bubbles: true }));
  }, 90);
  return 'aim loop on';
})()
