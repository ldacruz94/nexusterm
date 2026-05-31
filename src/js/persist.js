import { state } from './state.js';
import { makeSplitter, setActiveTab } from './panel.js';
import { createPanel, addPanelTab } from './terminal.js';
import { renderSessionItem, switchSession } from './sessions.js';

const STORAGE_KEY = 'nexusterm-state';

// ── Serialize ────────────────────────────────────────────────────────────────

function serializeNode(el) {
  if (el.classList.contains('panel')) {
    const panelData = [...state.panels.values()].find((p) => p.el === el);
    const tabs = panelData
      ? [...panelData.tabs.values()].map((t) => ({ scrollback: t.serializeAddon?.serialize() ?? '' }))
      : [{ scrollback: '' }];
    const activeTabIdx = panelData
      ? Math.max(0, [...panelData.tabs.keys()].indexOf(panelData.activeTabId))
      : 0;
    return { type: 'panel', flex: el.style.flex, tabs, activeTabIdx };
  }
  const type = el.classList.contains('split-h') ? 'split-h' : 'split-v';
  const children = [...el.children]
    .filter((c) => !c.classList.contains('splitter'))
    .map(serializeNode);
  return { type, flex: el.style.flex, children };
}

export function saveState() {
  const sessions = [...state.sessions.entries()].map(([id, session]) => ({
    id,
    name: session.name,
    tree: session.el.firstElementChild
      ? serializeNode(session.el.firstElementChild)
      : null,
  }));

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sessions,
      activeSessionId: state.activeSessionId,
    }));
  } catch {
    // localStorage quota exceeded — save names/layout only (drop scrollback)
    const slim = sessions.map((s) => ({
      ...s,
      tree: stripScrollback(s.tree),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sessions: slim,
      activeSessionId: state.activeSessionId,
    }));
  }
}

function stripScrollback(node) {
  if (!node) return node;
  if (node.type === 'panel') return { ...node, tabs: node.tabs?.map((t) => ({ ...t, scrollback: '' })) };
  return { ...node, children: node.children.map(stripScrollback) };
}

// ── Restore ──────────────────────────────────────────────────────────────────

async function restoreNode(node, container, sessionId) {
  if (node.type === 'panel') {
    const panelId = await createPanel(container, sessionId);
    const panel   = state.panels.get(panelId);
    if (node.flex) panel.el.style.flex = node.flex;

    // Restore additional tabs as fresh shells (first already created by createPanel)
    const tabCount = node.tabs?.length ?? 1;
    for (let i = 1; i < tabCount; i++) {
      await addPanelTab(panelId);
    }

    // Restore active tab index
    const tabIds     = [...panel.tabs.keys()];
    const activeTabId = tabIds[node.activeTabIdx ?? 0];
    if (activeTabId) setActiveTab(panelId, activeTabId);

    return;
  } else {
    const splitEl = document.createElement('div');
    splitEl.className = node.type;
    if (node.flex) splitEl.style.flex = node.flex;
    container.appendChild(splitEl);
    for (let i = 0; i < node.children.length; i++) {
      if (i > 0) splitEl.appendChild(makeSplitter());
      await restoreNode(node.children[i], splitEl, sessionId);
    }
  }
}

export async function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;

  let saved;
  try { saved = JSON.parse(raw); } catch { return false; }
  if (!saved?.sessions?.length) return false;

  // Advance counters so new sessions/panels don't reuse restored IDs
  for (const { id } of saved.sessions) {
    const n = parseInt(id.replace('session-', ''));
    if (n) state.sessionCounter = Math.max(state.sessionCounter, n);
  }

  for (const { id, name, tree } of saved.sessions) {
    const el = document.createElement('div');
    el.className = 'session-panels';
    document.getElementById('main').appendChild(el);

    state.sessions.set(id, { name, el, activePanelId: null });
    renderSessionItem(id);

    // Show this container so FitAddon can measure it during panel creation
    for (const s of state.sessions.values()) s.el.style.display = 'none';
    el.style.display = 'flex';
    state.activeSessionId = id;

    if (tree) {
      await restoreNode(tree, el, id);
    } else {
      await createPanel(el, id);
    }
  }

  const targetId = saved.activeSessionId && state.sessions.has(saved.activeSessionId)
    ? saved.activeSessionId
    : state.sessions.keys().next().value;

  await switchSession(targetId);
  return true;
}
