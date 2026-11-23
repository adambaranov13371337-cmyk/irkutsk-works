const get = id => document.getElementById(id);
const desk = get('desk');
const pane = get('window');
const handle = get('handle');
const preview = get('preview');
const mobileLayout = matchMedia('(max-width: 700px)');
let project = null;
let drag = null;
let left = 0;
let topEdge = 0;

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
  preview.replaceChildren();
  trigger.setAttribute('aria-expanded', 'false');
  project = null;
  if (restoreFocus) trigger.focus();
}
function sizePreview() {
  const frame = preview.firstElementChild;
  if (!frame || !preview.clientWidth) return;
  const width = Math.max(preview.clientWidth, mobileLayout.matches ? 360 : 1280);
  const scale = preview.clientWidth / width;
  frame.style.width = width + 'px';
  frame.style.height = Math.ceil(preview.clientHeight / scale) + 'px';
  frame.style.transform = 'scale(' + scale + ')';
}
new ResizeObserver(sizePreview).observe(preview);
mobileLayout.addEventListener('change', sizePreview);
function openWindow(next) {
  if (project === next) { get('close').focus({preventScroll:true}); return; }
  closeWindow();
  project = next;
  pane.hidden = false;
  get('select-' + project.id).setAttribute('aria-expanded', 'true');
  get('title').textContent = project.title;
  const url = new URL(project.path, demoRoot).href;
  const frame = document.createElement('iframe');
  frame.title = project.title + ' — интерактивное демо';
  frame.src = url;
  preview.append(frame);
  sizePreview();
  get('visit').href = url;
  get('original').hidden = !project.original;
  if (project.original) get('original').href = project.original;
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
