// Draw the moving light in a small buffer, then screen it through a fixed dot grid.
// The field belongs to the desk, so selecting and moving windows never resets it.
(() => {
  const desk = document.getElementById('desk');
  const canvas = document.getElementById('field');
  const ctx = canvas.getContext('2d', {alpha: false});
  const dots = document.createElement('canvas');
  const tile = dots.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const pitch = 4;
  const levels = 16;
  dots.width = pitch * levels;
  dots.height = pitch;
  for (let i = 1; i < levels; i++) {
    tile.fillStyle = 'rgb(' + Array(3).fill(162 + i * 5).join(',') + ')';
    tile.beginPath();
    tile.arc(i * pitch + 2, 2, .28 + i / levels * 1.42, 0, Math.PI * 2);
    tile.fill();
  }
  let frame = 0, last = -100, phase = 0;
  let x = .53, y = .48, destX = x, destY = y;
  function draw(time) {
    frame = 0;
    if (document.hidden) return;
    if (time - last >= 40 || reduce.matches) {
      const dt = Math.min(80, time - last);
      last = time;
      if (!reduce.matches) phase += dt * .00012;
      x += (destX - x) * .15;
      y += (destY - y) * .15;
      const w = canvas.width, h = canvas.height, aspect = w / h;
      ctx.fillStyle = '#030303'; ctx.fillRect(0, 0, w, h);
      // Broad folds of light open and close around the pointer.
      const cols = Math.ceil(w / pitch);
      const xx = new Float32Array(cols), warp = new Float32Array(cols);
      for (let col = 0; col < cols; col++) {
        xx[col] = col * pitch / w;
        warp[col] = Math.sin(xx[col] * 5.5 + phase * .8);
      }
      for (let py = 0; py < h; py += pitch) {
        const v = py / h;
        const bend = Math.sin(v * 5.8 + phase);
        const dy = v - y;
        for (let col = 0; col < cols; col++) {
          const u = xx[col], dx = (u - x) * aspect;
          const pull = 1 / (1 + 18 * (dx * dx + dy * dy));
          const ridge = Math.sin(5 * u + 2.6 * bend + pull * 2.1 - phase);
          const fold = Math.cos(4.2 * v + 2.3 * warp[col] + pull * 2.5 + phase * .55);
          const brightness = Math.max(0, (ridge + fold * .83 - .08) * .59);
          const index = Math.min(levels - 1, Math.floor(brightness * levels));
          if (index) ctx.drawImage(dots, index * pitch, 0, pitch, pitch, col * pitch, py, pitch, pitch);
        }
      }
    }
    if (!reduce.matches) frame = requestAnimationFrame(draw);
  }
  function refresh() {
    cancelAnimationFrame(frame);
    const scale = Math.min(1, 880 / Math.max(1, desk.clientWidth));
    canvas.width = Math.max(1, Math.round(desk.clientWidth * scale));
    canvas.height = Math.max(1, Math.round(desk.clientHeight * scale));
    last = -100;
    frame = requestAnimationFrame(draw);
  }
  desk.addEventListener('pointermove', event => {
    const rect = desk.getBoundingClientRect();
    destX = (event.clientX - rect.left) / rect.width;
    destY = (event.clientY - rect.top) / rect.height;
  }, {passive: true});
  desk.addEventListener('pointerleave', () => { destX = .53; destY = .48; });
  new ResizeObserver(refresh).observe(desk);
  reduce.addEventListener('change', refresh);
  document.addEventListener('visibilitychange', refresh);
})();
