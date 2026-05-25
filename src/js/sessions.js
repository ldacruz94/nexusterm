import { state } from './state.js';
import { setActive, fitAll } from './panel.js';
import { createPanel } from './terminal.js';

export function renderSessionItem(sessionId) {
  const session = state.sessions.get(sessionId);

  const item = document.createElement('div');
  item.className = 'session-item';
  item.dataset.sessionId = sessionId;

  const icon = document.createElement('span');
  icon.className = 'session-item-icon';
  icon.textContent = '$';
  item.appendChild(icon);

  const nameEl = document.createElement('span');
  nameEl.className = 'session-item-name';
  nameEl.textContent = session.name;
  item.appendChild(nameEl);

  item.addEventListener('click', (e) => {
    if (e.target.tagName === 'INPUT') return;
    switchSession(sessionId);
  });

  nameEl.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startRename(sessionId, item, nameEl);
  });

  document.getElementById('session-list').appendChild(item);
}

export function startRename(sessionId, item, nameEl) {
  const session = state.sessions.get(sessionId);

  const input = document.createElement('input');
  input.value = session.name;
  input.spellcheck = false;
  item.replaceChild(input, nameEl);
  input.focus();
  input.select();

  const finish = (save) => {
    const trimmed = input.value.trim();
    if (save && trimmed) session.name = trimmed;
    nameEl.textContent = session.name;
    item.replaceChild(nameEl, input);
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter')  finish(true);
    if (e.key === 'Escape') finish(false);
  });

  input.addEventListener('blur', () => finish(true));
}

export async function switchSession(id) {
  for (const { el } of state.sessions.values()) el.style.display = 'none';

  const session = state.sessions.get(id);
  session.el.style.display = 'flex';
  state.activeSessionId = id;

  document.querySelectorAll('.session-item').forEach((el) => el.classList.remove('active'));
  document.querySelector(`.session-item[data-session-id="${id}"]`)?.classList.add('active');

  if (session.activePanelId && state.panels.has(session.activePanelId)) {
    setActive(session.activePanelId);
  } else {
    for (const [panelId, panel] of state.panels) {
      if (panel.sessionId === id) { setActive(panelId); break; }
    }
  }

  fitAll();
}

export async function createSession(name) {
  const id = `session-${++state.sessionCounter}`;

  const el = document.createElement('div');
  el.className = 'session-panels';
  document.getElementById('main').appendChild(el);

  state.sessions.set(id, { name: name ?? `Session ${state.sessionCounter}`, el, activePanelId: null });
  renderSessionItem(id);

  await switchSession(id);
  await createPanel(el, id);
}
