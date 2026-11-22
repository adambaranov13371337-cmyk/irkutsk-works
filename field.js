/* A woven surface projected into the desk. All input and motion use CSS pixels. */
(() => {
  const canvas = document.querySelector('#field');
  const desk = canvas.parentElement;
  const ctx = canvas.getContext('2d', {alpha: false});
  if (!ctx) return;
  const quiet = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const pointer = {x: 0, y: 0, active: false, depth: 0};
  const keyboard = {u: 0.5, v: 0.5};
  let width, height, size, columns, rows, restX, restY, x, y, sheen;
  let backdrop, silk, silver, warp, press = null, pulses = [];
  let frame = 0, previousTime = 0;

  function invalidate() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(paint);
  }

  function build() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    if (!width || !height) return;
    size = Math.min(width, height);
    const ratio = Math.min(devicePixelRatio || 1, 1.65);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    columns = clamp(Math.round(width / 13), 34, 84);
    rows = clamp(Math.round(size / 9), 34, 76);
    const n = (columns + 1) * (rows + 1);
    restX = new Float32Array(n);
    restY = new Float32Array(n);
    x = new Float32Array(n);
    y = new Float32Array(n);
    sheen = new Float32Array(rows + 1);

    // Tilt the loom and curl its edges. A shallow projection lets the far threads
    // disappear behind the ridges when the surface folds over during a pull.
    const sheetHeight = Math.min(height * .77, width * .92);
    for (let row = 0; row <= rows; row++) {
      const v = row / rows;
      sheen[row] = .57 + .39 * Math.sin(v * 3.8 + .17);
      for (let col = 0; col <= columns; col++) {
        const i = row * (columns + 1) + col;
        const u = col / columns;
        const fold = 2 * Math.PI * (.93 * u + .53 * v) - .55;
        const lift = .151 * Math.sin(fold) + .045 * Math.sin(2 * fold + 1.05)
          + .13 * (1 - 2 * v) * Math.cos(3.9 * u + .45);
        restX[i] = width * (.50 + (u - .5) * (.79 + v * .09)
          + (v - .5) * .17 + .026 * Math.sin(fold));
        restY[i] = height * .50 + sheetHeight * ((v - .5) * .91
          - .32 * (u - .5) - lift);
      }
    }
    // Fit the projected silhouette, including its lowest fold, on tall and wide desks.
    const minX = Math.min(...restX), maxX = Math.max(...restX);
    const minY = Math.min(...restY), maxY = Math.max(...restY);
    const fit = Math.min(width * .94 / (maxX - minX), height * .86 / (maxY - minY), 1.15);
    for (let i = 0; i < n; i++) {
      restX[i] = width * .5 + (restX[i] - (maxX + minX) * .5) * fit;
      restY[i] = height * .5 + (restY[i] - (maxY + minY) * .5) * fit;
    }
    backdrop = ctx.createRadialGradient(width*.51, height*.49, 0, width*.51, height*.49, Math.hypot(width, height)*.55);
    backdrop.addColorStop(0, '#1b1c1e');
    backdrop.addColorStop(.67, '#101112');
    backdrop.addColorStop(1, '#090a0b');
    silver = ctx.createLinearGradient(0, 0, width, height * .15);
    [[0,'#44474a'],[.16,'#a9acae'],[.31,'#ebece6'],[.53,'#64696c'],[.69,'#eff0eb'],[.84,'#9b9d9f'],[1,'#515558']]
      .forEach(([stop,color]) => silver.addColorStop(stop,color));
    silk = ctx.createLinearGradient(0, 0, width, height * .18);
    [[0,'#1a1b1d'],[.25,'#36383a'],[.5,'#191a1c'],[.7,'#292d30'],[1,'#15171a']]
      .forEach(([stop,color]) => silk.addColorStop(stop,color));
    warp = ctx.createLinearGradient(0, height, width*.8, 0);
    warp.addColorStop(0,'#656969');
    warp.addColorStop(.52,'#90928d');
    warp.addColorStop(1,'#44484a');
    press = null;
    pulses = [];
    pointer.active = false;
    pointer.depth = 0;
    canvas.classList.remove('holding');
    invalidate();
  }

  function surface(time, elapsed) {
    const target = pointer.active ? 1 : 0;
    pointer.depth += (target - pointer.depth) * (quiet.matches ? 1 : 1 - Math.exp(-elapsed / (target ? 23 : 88)));
    if (Math.abs(pointer.depth - target) < .003) pointer.depth = target;
    if (press?.released) {
      press.gain *= quiet.matches ? 0 : Math.exp(-elapsed / 115);
      if (press.gain < .003) press = null;
    }
    pulses = pulses.filter(p => time - p.start < 1050);
    const radius = size * .23;
    const grabRadius = size * .31;
    const depth = pointer.depth * size * .128;
    const tiltX = clamp(pointer.x / width - .5, -.5, .5) * size * .069 * pointer.depth;
    const tiltY = clamp(pointer.y / height - .5, -.5, .5) * size * .083 * pointer.depth;
    for (let i = 0; i < x.length; i++) {
      const bx = restX[i], by = restY[i];
      let sx = bx + tiltX * (by / height - .5) * 2;
      let sy = by + tiltY * (bx / width - .5) * 2;
      if (depth) {
        const dx = bx - pointer.x, dy = by - pointer.y;
        const influence = Math.exp(-(dx*dx + dy*dy) / (radius*radius*.68)) * pointer.depth;
        sx += dx * .32 * influence;
        sy += dy * .22 * influence + depth * influence;
      }
      if (press) {
        const dx = bx - press.x, dy = by - press.y;
        const pull = Math.exp(-(dx*dx + dy*dy) / (grabRadius*grabRadius)) * press.gain;
        sx += press.dx * pull;
        sy += (press.dy - size * .09) * pull;
      }
      for (const pulse of pulses) {
        const age = (time - pulse.start) / 1000;
        const dx = bx - pulse.x, dy = by - pulse.y;
        const distance = Math.sqrt(dx*dx + dy*dy);
        const ring = (distance / size - age * 1.22) / .094;
        if (Math.abs(ring) > 3) continue;
        const displacement = pulse.power * ring * Math.exp(-ring*ring - 3.6 * age);
        sx += displacement * dx / Math.max(distance, 1) * .34;
        sy += displacement;
      }
      x[i] = sx;
      y[i] = sy;
    }
  }

  function paint(time) {
    frame = 0;
    if (!restX || document.hidden) return;
    const elapsed = clamp(time - previousTime, 1, 48);
    previousTime = time;
    surface(time, elapsed);
    ctx.globalAlpha = 1;
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, width, height);
    const stride = columns + 1;
    for (let r = 0; r <= rows; r++) {
      const start = r * stride, end = start + columns;
      if (r) {
        ctx.beginPath();
        ctx.moveTo(x[start],y[start]);
        for (let i = start + 1; i <= end; i++) ctx.lineTo(x[i],y[i]);
        for (let i = end - stride; i >= start - stride; i--) ctx.lineTo(x[i],y[i]);
        ctx.closePath();
        ctx.globalAlpha = 1;
        ctx.fillStyle = silk;
        ctx.fill();

        ctx.beginPath();
        for (let i = start; i <= end; i++) {
          ctx.moveTo(x[i-stride],y[i-stride]);
          ctx.lineTo(x[i],y[i]);
        }
        ctx.lineWidth = .75;
        ctx.globalAlpha = .83;
        ctx.strokeStyle = warp;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(x[start], y[start]);
      for (let i = start + 1; i <= end; i++) ctx.lineTo(x[i],y[i]);
      ctx.strokeStyle = silver;
      ctx.globalAlpha = sheen[r];
      ctx.lineWidth = r === 0 || r === rows ? 1.45 : 1.12;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (pulses.length || press?.released || pointer.depth !== Number(pointer.active)) invalidate();
  }

  function locate(event) {
    const rect = canvas.getBoundingClientRect();
    return {x:event.clientX - rect.left, y:event.clientY - rect.top};
  }

  function wave(cx, cy, strength = .17) {
    if (quiet.matches) return;
    if (pulses.length === 4) pulses.shift();
    pulses.push({x:cx, y:cy, power:size * strength, start:performance.now()});
  }

  function follow(event) {
    if (!event.isPrimary || (press && !press.released && press.id !== event.pointerId)) return;
    const point = locate(event);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.active = event.pointerType !== 'touch' || Boolean(press && !press.released);
    if (press && !press.released) {
      press.dx = clamp((point.x - press.startX) * .97, -width*.57, width*.57);
      press.dy = clamp((point.y - press.startY) * .97, -height*.52, height*.52);
    }
    invalidate();
  }

  desk.addEventListener('pointermove', follow, {passive:true});
  desk.addEventListener('pointerleave', () => {
    if (!press || press.released) { pointer.active = false; invalidate(); }
  });

  // Capture starts on the fabric only. The project window owns all its controls.
  canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || !restX) return;
    const point = locate(event);
    let nearest = 0, distance = Infinity;
    for (let i = 0; i < x.length; i++) {
      const squared = (point.x - x[i]) ** 2 + (point.y - y[i]) ** 2;
      if (squared < distance) { nearest = i; distance = squared; }
    }
    press = {id:event.pointerId, x:restX[nearest], y:restY[nearest], startX:point.x,
      startY:point.y, dx:0, dy:0, gain:1, released:false};
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('holding');
    follow(event);
  });

  function release(event) {
    if (!press || press.released || press.id !== event.pointerId) return;
    press.released = true;
    if (event.type === 'pointerup') {
      wave(press.x + press.dx, press.y + press.dy, .20 + Math.min(.25, Math.hypot(press.dx,press.dy)/size));
    }
    pointer.active = event.type === 'pointerup' && event.pointerType === 'mouse'
      && pointer.x >= 0 && pointer.y >= 0 && pointer.x <= width && pointer.y <= height;
    canvas.classList.remove('holding');
    invalidate();
  }
  for (const type of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(type, release);
  canvas.addEventListener('keydown', event => {
    const delta = {ArrowLeft:[-.08,0],ArrowRight:[.08,0],ArrowUp:[0,-.08],ArrowDown:[0,.08]}[event.key];
    if (!delta && event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (delta) {
      keyboard.u = clamp(keyboard.u + delta[0],.1,.9);
      keyboard.v = clamp(keyboard.v + delta[1],.12,.88);
    }
    pointer.x = keyboard.u * width;
    pointer.y = keyboard.v * height;
    pointer.active = true;
    if (!delta) wave(pointer.x,pointer.y,.34);
    invalidate();
  });
  canvas.addEventListener('blur', () => { pointer.active = false; invalidate(); });
  quiet.addEventListener('change', () => { pulses = []; invalidate(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      press = null;
      pointer.active = false;
      pulses = [];
      canvas.classList.remove('holding');
    } else invalidate();
  });
  new ResizeObserver(build).observe(canvas);
})();
