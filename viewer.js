const get = id => document.getElementById(id);
const desk = get('desk');
const pane = get('window');
const handle = get('handle');
const video = get('movie');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let project = null;
let version = 'design';
let drag = null;
let left = 0;
let topEdge = 0;
let playRequested = !reduceMotion.matches;

function place(x, y) {
  left = Math.max(0, Math.min(x, desk.clientWidth - pane.offsetWidth));
  topEdge = Math.max(0, Math.min(y, desk.clientHeight - pane.offsetHeight));
  pane.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(topEdge) + 'px)';
}
function cancelDrag() {
  if (drag && handle.hasPointerCapture(drag.id)) handle.releasePointerCapture(drag.id);
  drag = null;
}
function closeWindow(restoreFocus = false) {
  if (!project) return;
  const trigger = get('select-' + project.id);
  cancelDrag();
  pane.hidden = true;
  video.pause();
  video.removeAttribute('src');
  video.removeAttribute('poster');
  video.load();
  trigger.setAttribute('aria-expanded', 'false');
  project = null;
  if (restoreFocus) trigger.focus();
}
function setVersion(next) {
  version = next;
  const original = next === 'original';
  const path = 'media/' + project.id + (original ? '-original' : '');
  video.poster = path + '.webp';
  video.src = path + '.mp4';
  const format = project.original ? (original ? 'оригинал' : 'редизайн') : 'сайт';
  video.setAttribute('aria-label', project.title + ', ' + format);
  if (playRequested) video.play().catch(() => {});
  get('visit').href = original ? project.original : new URL(project.path, demoRoot).href;
  get('visit').textContent = {оригинал:'Открыть оригинал', редизайн:'Открыть демо', сайт:'Открыть сайт'}[format];
  for (const button of document.querySelectorAll('[data-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === next));
  }
}
function openWindow(next) {
  if (project === next) { get('close').focus({preventScroll:true}); return; }
  closeWindow();
  project = next;
  pane.hidden = false;
  get('select-' + project.id).setAttribute('aria-expanded', 'true');
  get('title').textContent = project.title;
  pane.querySelector('.modes').hidden = !project.original;
  playRequested = !reduceMotion.matches;
  setVersion('design');
  place((desk.clientWidth - pane.offsetWidth) / 2, (desk.clientHeight - pane.offsetHeight) / 2);
  get('close').focus({preventScroll:true});
}
for (const item of projects) {
  const button = document.createElement('button');
  button.className = 'project';
  button.id = 'select-' + item.id;
  button.setAttribute('aria-controls','window');
  button.setAttribute('aria-haspopup','dialog');
  button.setAttribute('aria-expanded','false');
  const icon = document.createElement('i');
  icon.className = 'folder';
  icon.setAttribute('aria-hidden','true');
  button.append(icon, item.title);
  button.addEventListener('click', () => openWindow(item));
  get('projects').append(button);
}
for (const button of document.querySelectorAll('[data-mode]')) {
  button.addEventListener('click', () => {
    if (version !== button.dataset.mode) {
      playRequested = !video.paused;
      setVersion(button.dataset.mode);
    }
  });
}
get('close').addEventListener('click', () => closeWindow(true));
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.fullscreenElement) closeWindow(true);
});
handle.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !event.isPrimary) return;
  drag = {id:event.pointerId, x:event.clientX - left, y:event.clientY - topEdge};
  handle.setPointerCapture(event.pointerId);
});
handle.addEventListener('pointermove', event => {
  if (drag && drag.id === event.pointerId) place(event.clientX - drag.x, event.clientY - drag.y);
});
for (const name of ['pointerup','pointercancel','lostpointercapture']) {
  handle.addEventListener(name, event => { if (drag?.id === event.pointerId) cancelDrag(); });
}
handle.addEventListener('keydown', event => {
  const step = event.shiftKey ? 40 : 10;
  const delta = {ArrowLeft:[-step,0], ArrowRight:[step,0], ArrowUp:[0,-step], ArrowDown:[0,step]}[event.key];
  if (delta) { event.preventDefault(); place(left + delta[0], topEdge + delta[1]); }
});
new ResizeObserver(() => { if (project) place(left, topEdge); }).observe(desk);
get('works-tab').addEventListener('click', () => closeWindow());
window.addEventListener('hashchange', () => closeWindow());
