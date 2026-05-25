import { invoke } from '@tauri-apps/api/core';
import { state } from './state.js';
import { createPanel } from './terminal.js';

export function setActive(id) {
  document.querySelectorAll('.panel').forEach((el) => el.classList.remove('active'));
  const panel = state.panels.get(id);
  if (!panel) return;
  panel.el.classList.add('active');
  panel.term.focus();
  state.activeId = id;
  const session = state.sessions.get(panel.sessionId);
  if (session) session.activePanelId = id;
}

export function focusDirection(direction) {
  if (!state.activeId) return;
  const active = state.panels.get(state.activeId);
  if (!active) return;

  const ar  = active.el.getBoundingClientRect();
  const acx = ar.left + ar.width  / 2;
  const acy = ar.top  + ar.height / 2;

  let bestId = null, bestDist = Infinity;

  for (const [id, panel] of state.panels) {
    if (id === state.activeId || panel.sessionId !== state.activeSessionId) continue;
    const r   = panel.el.getBoundingClientRect();
    const cx  = r.left + r.width  / 2;
    const cy  = r.top  + r.height / 2;

    const inDir =
      direction === 'up'    ? r.bottom <= ar.top    :
      direction === 'down'  ? r.top    >= ar.bottom :
      direction === 'left'  ? r.right  <= ar.left   :
   /* right */                r.left   >= ar.right;

    if (!inDir) continue;
    const dist = Math.hypot(cx - acx, cy - acy);
    if (dist < bestDist) { bestDist = dist; bestId = id; }
  }

  if (bestId) setActive(bestId);
}

export function fitAll() {
  for (const [, panel] of state.panels) {
    if (panel.sessionId === state.activeSessionId) panel.fitAddon.fit();
  }
}

export function swapPanelElements(el1, el2) {
  const p1 = el1.parentElement;
  const p2 = el2.parentElement;

  const placeholder = document.createComment('');
  p1.insertBefore(placeholder, el1);

  const f1 = el1.style.flex;
  el1.style.flex = el2.style.flex;
  el2.style.flex = f1;

  p2.insertBefore(el1, el2);
  p1.insertBefore(el2, placeholder);
  placeholder.remove();
}

export function initPanelDrag(panelEl) {
  const handle = panelEl.querySelector('.panel-drag-handle');

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = panelEl.getBoundingClientRect();

    const ghost = document.createElement('div');
    ghost.className    = 'drag-ghost';
    ghost.style.width  = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left   = `${rect.left}px`;
    ghost.style.top    = `${rect.top}px`;
    document.body.appendChild(ghost);

    panelEl.classList.add('dragging');
    document.body.style.cursor     = 'grabbing';
    document.body.style.userSelect = 'none';

    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    let dropTarget = null;

    const onMove = (ev) => {
      ghost.style.left = `${ev.clientX - offsetX}px`;
      ghost.style.top  = `${ev.clientY - offsetY}px`;

      ghost.style.visibility = 'hidden';
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      ghost.style.visibility = '';

      const hovered = under?.closest('.panel');
      if (dropTarget) dropTarget.classList.remove('drag-over');
      dropTarget = (hovered && hovered !== panelEl) ? hovered : null;
      if (dropTarget) dropTarget.classList.add('drag-over');
    };

    const onUp = () => {
      ghost.remove();
      panelEl.classList.remove('dragging');
      if (dropTarget) dropTarget.classList.remove('drag-over');
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);

      if (dropTarget) {
        swapPanelElements(panelEl, dropTarget);
        fitAll();
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

export function makeSplitter() {
  const splitter = document.createElement('div');
  splitter.className = 'splitter';

  splitter.addEventListener('mousedown', (e) => {
    e.preventDefault();

    const container = splitter.parentElement;
    const isH       = container.classList.contains('split-h');
    const prev      = splitter.previousElementSibling;
    const next      = splitter.nextElementSibling;

    splitter.classList.add('dragging');
    document.body.style.cursor     = isH ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    const prevSize  = isH ? prev.getBoundingClientRect().width  : prev.getBoundingClientRect().height;
    const nextSize  = isH ? next.getBoundingClientRect().width  : next.getBoundingClientRect().height;
    const startPos  = isH ? e.clientX : e.clientY;
    const total     = prevSize + nextSize;

    const onMove = (ev) => {
      const delta     = (isH ? ev.clientX : ev.clientY) - startPos;
      const newPrev   = Math.max(50, Math.min(total - 50, prevSize + delta));
      prev.style.flex = String(newPrev / total);
      next.style.flex = String((total - newPrev) / total);
    };

    const onUp = () => {
      splitter.classList.remove('dragging');
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      fitAll();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });

  return splitter;
}

export async function splitActive(direction) {
  if (!state.activeId) return;
  const panel = state.panels.get(state.activeId);
  if (!panel) return;

  const { el, sessionId } = panel;
  const parent = el.parentElement;

  const splitEl = document.createElement('div');
  splitEl.className = direction === 'horizontal' ? 'split-h' : 'split-v';

  parent.replaceChild(splitEl, el);
  el.style.flex = '';
  splitEl.appendChild(el);
  splitEl.appendChild(makeSplitter());

  fitAll();
  await createPanel(splitEl, sessionId);
}

export async function closePanel(id, { force = false } = {}) {
  const panel = state.panels.get(id);
  if (!panel) return;

  const sessionPanels = [...state.panels.values()].filter((p) => p.sessionId === panel.sessionId);
  if (!force && sessionPanels.length === 1) return;

  const { el } = panel;
  const parent = el.parentElement;

  panel.term.dispose();
  state.panels.delete(id);
  invoke('kill_pty', { id }).catch(() => {});

  const prevSib = el.previousElementSibling;
  const nextSib = el.nextElementSibling;
  el.remove();
  if (prevSib?.classList.contains('splitter'))      prevSib.remove();
  else if (nextSib?.classList.contains('splitter')) nextSib.remove();

  if (parent.classList.contains('split-h') || parent.classList.contains('split-v')) {
    if (parent.children.length === 1) {
      const child = parent.children[0];
      child.style.flex = '';
      parent.replaceWith(child);
    }
  }

  if (state.activeId === id) {
    const remaining = [...state.panels.entries()].filter(([, p]) => p.sessionId === panel.sessionId);
    if (remaining.length) setActive(remaining[remaining.length - 1][0]);
  }

  fitAll();
}
