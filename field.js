/* A woven surface projected into the desk. All input and motion use CSS pixels. */
(() => {
  const canvas = document.querySelector('#field');
  const desk = canvas.parentElement;
  const touchSurface = desk.querySelector('#field-touch');
  const reset = desk.querySelector('#reset-field');
  const ctx = canvas.getContext('2d', {alpha: false});
  if (!ctx) return;
  const quiet = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const pointer = {x: 0, y: 0, active: false, depth: 0};
  const keyboard = {u: 0.5, v: 0.5};
  let width, height, size, columns, rows, restX, restY, x, y, sheen;
  let left, top, sheetWidth, sheetHeight, offsetX, offsetY, freedom, rim;
  const pins = [];
  let needsShape = true, resetStart = null, pinScale = 1, nearEdge = null;
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
    sheetWidth = width * .82;
    sheetHeight = Math.min(height * .76, width * .96);
    left = (width - sheetWidth) / 2;
    top = (height - sheetHeight) / 2;
    const spacing = clamp(size / 48, 9, 15);
    columns = clamp(Math.round(sheetWidth / spacing), 18, 92);
    rows = clamp(Math.round(sheetHeight / spacing), 16, 68);
    const n = (columns + 1) * (rows + 1);
    restX = new Float32Array(n);
    restY = new Float32Array(n);
    offsetX = new Float32Array(n);
    offsetY = new Float32Array(n);
    freedom = new Float32Array(n);
    rim = new Float32Array(n);
    x = new Float32Array(n);
    y = new Float32Array(n);
    sheen = new Float32Array(rows + 1);
    for (let row = 0; row <= rows; row++) {
      const by = top + row / rows * sheetHeight;
      sheen[row] = .57 + .39 * Math.sin(row / rows * 3.8 + .17);
      for (let col = 0; col <= columns; col++) {
        const i = row * (columns + 1) + col;
        const bx = left + col / columns * sheetWidth;
        restX[i] = bx;
        restY[i] = by;
        const distance = Math.min(bx-left, left+sheetWidth-bx, by-top, top+sheetHeight-by);
        rim[i] = clamp(distance / (size*.095), 0, 1);
      }
    }
    needsShape = true;
    nearEdge = null;
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

  // Normalized anchor coordinates keep the same material point pinned after a resize.
  // Local inverse-distance weights interpolate the drag while holding every other pin.
  function updateShape() {
    const radius = size * .39;
    for (let i = 0; i < restX.length; i++) {
      let total = 1, dx = 0, dy = 0;
      for (const pin of pins) {
        const nx = restX[i] - (left + pin.u * sheetWidth);
        const ny = restY[i] - (top + pin.v * sheetHeight);
        const d2 = (nx*nx + ny*ny) / (radius*radius);
        if (d2 >= 1) continue;
        const falloff = 1 - d2;
        const weight = falloff * falloff * falloff / Math.max(d2 * 5, 1e-8);
        total += weight;
        dx += pin.dx * width * weight;
        dy += pin.dy * height * weight;
      }
      offsetX[i] = dx / total;
      offsetY[i] = dy / total;
      freedom[i] = 1 / total;
    }
    needsShape = false;
  }

  function setTouchBounds() {
    // Inside the fabric drags can run vertically. The surrounding margins scroll the page.
    let x0=width, y0=height, x1=0, y1=0;
    for (let i=0; i<restX.length; i++) {
      if (rim[i] > .0001) continue;
      const bx = restX[i] + offsetX[i]*pinScale, by = restY[i] + offsetY[i]*pinScale;
      x0 = Math.min(x0,bx); x1 = Math.max(x1,bx);
      y0 = Math.min(y0,by); y1 = Math.max(y1,by);
    }
    const pad = 22;
    touchSurface.style.inset = [Math.max(0,y0-pad),Math.max(0,width-x1-pad),
      Math.max(0,height-y1-pad),Math.max(0,x0-pad)].map(v=>Math.round(v)+'px').join(' ');
  }

  function surface(time, elapsed) {
    const boundsChanged = resetStart !== null || needsShape;
    if (resetStart !== null) {
      const t = quiet.matches ? 1 : clamp((time - resetStart) / 780, 0, 1);
      pinScale = 1 - t*t*(3 - 2*t);
      if (t >= 1) {
        pins.length = 0;
        pinScale = 1;
        resetStart = null;
        needsShape = true;
      }
    }
    if (needsShape) updateShape();
    if (boundsChanged) setTouchBounds();
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
      const bx = restX[i] + offsetX[i] * pinScale;
      const by = restY[i] + offsetY[i] * pinScale;
      // The boundary stays under the cursor on hover, and a pinned point resists waves.
      const flex = 1 - (1 - freedom[i]) * pinScale;
      const hoverFlex = rim[i] * flex;
      let sx = bx + tiltX * (by / height - .5) * 2 * hoverFlex;
      let sy = by + tiltY * (bx / width - .5) * 2 * hoverFlex;
      if (depth) {
        const dx = bx - pointer.x, dy = by - pointer.y;
        const influence = Math.exp(-(dx*dx + dy*dy) / (radius*radius*.68)) * pointer.depth * hoverFlex;
        sx += dx * .32 * influence;
        sy += dy * .22 * influence + depth * influence;
      }
      if (press && !press.edge) {
        const dx = bx - press.x, dy = by - press.y;
        const pull = Math.exp(-(dx*dx + dy*dy) / (grabRadius*grabRadius)) * press.gain * flex;
        sx += press.dx * pull;
        sy += (press.dy - size * .09) * pull;
      }
      for (const pulse of pulses) {
        const age = (time - pulse.start) / 1000;
        const dx = bx - pulse.x, dy = by - pulse.y;
        const distance = Math.sqrt(dx*dx + dy*dy);
        const ring = (distance / size - age * 1.22) / .094;
        if (Math.abs(ring) > 3) continue;
        const displacement = flex * pulse.power * ring * Math.exp(-ring*ring - 3.6 * age);
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
    // Small attachment marks show precisely which parts of the hem will stay put.
    if (pins.length || nearEdge) {
      ctx.lineWidth = 1;
      ctx.fillStyle = '#17191b';
      ctx.strokeStyle = '#e6e5df';
      ctx.globalAlpha = pinScale;
      for (const pin of pins) {
        const cx = left + pin.u * sheetWidth + pin.dx * width * pinScale;
        const cy = top + pin.v * sheetHeight + pin.dy * height * pinScale;
        ctx.beginPath();
        ctx.arc(cx,cy,3.3,0,Math.PI*2);
        ctx.fill();
        ctx.stroke();
      }
      if (nearEdge && !press && resetStart === null) {
        ctx.beginPath();
        ctx.arc(x[nearEdge.i],y[nearEdge.i],4.6,0,Math.PI*2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (resetStart !== null || pulses.length || press?.released || pointer.depth !== Number(pointer.active)) invalidate();
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

  function hitEdge(point, tolerance) {
    let best = null, closest = tolerance * tolerance;
    const stride = columns + 1;
    function segment(col, row, dc, dr) {
      const i = row*stride + col, j = i + dr*stride + dc;
      const vx = x[j]-x[i], vy = y[j]-y[i];
      const t = clamp(((point.x-x[i])*vx + (point.y-y[i])*vy) / Math.max(1e-8,vx*vx+vy*vy),0,1);
      const d = (point.x-x[i]-t*vx)**2 + (point.y-y[i]-t*vy)**2;
      if (d <= closest) {
        closest = d;
        const nearest = t < .5 ? i : j;
        best = {i:nearest, u:(nearest%stride)/columns, v:Math.floor(nearest/stride)/rows};
      }
    }
    for (let col=0; col<columns; col++) { segment(col,0,1,0); segment(col,rows,1,0); }
    for (let row=0; row<rows; row++) { segment(0,row,0,1); segment(columns,row,0,1); }
    return best;
  }

  function follow(event) {
    if (!restX || !event.isPrimary || (press && !press.released && press.id !== event.pointerId)) return;
    if (event.target === reset || reset.contains(event.target)) {
      pointer.active = false;
      nearEdge = null;
      invalidate();
      return;
    }
    const point = locate(event);
    pointer.x = point.x;
    pointer.y = point.y;
    nearEdge = !press && event.target === canvas && event.pointerType !== 'touch'
      ? hitEdge(point, 13) : null;
    pointer.active = !press?.edge && (event.pointerType !== 'touch' || Boolean(press && !press.released));
    if (press && !press.released) {
      if (press.edge) {
        const dx = point.x - press.startX, dy = point.y - press.startY;
        if (!press.moved && Math.hypot(dx,dy) < 3) return;
        if (!press.moved && !pins.includes(press.pin)) pins.push(press.pin);
        press.moved = true;
        press.pin.dx = (clamp(press.edgeX + dx, 5, width - 5) - left - press.pin.u * sheetWidth) / width;
        press.pin.dy = (clamp(press.edgeY + dy, 5, height - 5) - top - press.pin.v * sheetHeight) / height;
        needsShape = true;
      } else {
        press.dx = clamp((point.x - press.startX) * .97, -width*.57, width*.57);
        press.dy = clamp((point.y - press.startY) * .97, -height*.52, height*.52);
      }
    }
    invalidate();
  }

  desk.addEventListener('pointermove', follow, {passive:true});
  desk.addEventListener('pointerleave', () => {
    nearEdge = null;
    if (!press || press.released) pointer.active = false;
    invalidate();
  });

  function stopResetAtCurrentShape() {
    if (resetStart === null) return;
    for (const pin of pins) { pin.dx *= pinScale; pin.dy *= pinScale; }
    pinScale = 1;
    resetStart = null;
    needsShape = true;
  }

  function grab(event) {
    if (!event.isPrimary || event.button !== 0 || !restX) return;
    stopResetAtCurrentShape();
    const point = locate(event);
    const edge = hitEdge(point, event.pointerType === 'touch' ? 23 : 13);
    if (edge) {
      // Prefer a nearby existing attachment so a stretched corner can be repositioned.
      const i = edge.i;
      const existing = pins.find(pin => Math.hypot((pin.u-edge.u)*sheetWidth,(pin.v-edge.v)*sheetHeight)<10);
      const pin = existing || {u:edge.u, v:edge.v, dx:0, dy:0};
      const edgeX = existing ? left + pin.u*sheetWidth + pin.dx*width : x[i];
      const edgeY = existing ? top + pin.v*sheetHeight + pin.dy*height : y[i];
      press = {id:event.pointerId, edge:true, pin, edgeX, edgeY, startX:point.x, startY:point.y,
        moved:false, existing:Boolean(existing), oldDX:pin.dx, oldDY:pin.dy};
    } else {
      press = {id:event.pointerId, edge:false, x:point.x, y:point.y, startX:point.x, startY:point.y,
        dx:0, dy:0, gain:1, released:false};
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    canvas.classList.add('holding');
    nearEdge = null;
    follow(event);
    invalidate();
  }

  function release(event) {
    if (!press || press.released || press.id !== event.pointerId) return;
    if (press.edge) {
      if (event.type === 'pointerup') {
        follow(event);
        if (press.moved) wave(pointer.x,pointer.y,.14);
      } else if (press.moved) {
        if (press.existing) { press.pin.dx = press.oldDX; press.pin.dy = press.oldDY; }
        else pins.splice(pins.indexOf(press.pin),1);
        needsShape = true;
      }
      press = null;
      nearEdge = null;
    } else {
      press.released = true;
      if (event.type === 'pointerup') {
        wave(press.x + press.dx, press.y + press.dy, .20 + Math.min(.25, Math.hypot(press.dx,press.dy)/size));
      }
    }
    pointer.active = false;
    canvas.classList.remove('holding');
    invalidate();
  }
  for (const target of [canvas, touchSurface]) {
    target.addEventListener('pointerdown', grab);
    for (const type of ['pointerup','pointercancel','lostpointercapture']) target.addEventListener(type, release);
  }
  reset.addEventListener('click', () => {
    stopResetAtCurrentShape();
    pointer.active = false;
    nearEdge = null;
    if (press && !press.edge) press.released = true;
    else press = null;
    if (pins.length) resetStart = performance.now();
    canvas.classList.remove('holding');
    invalidate();
  });
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
