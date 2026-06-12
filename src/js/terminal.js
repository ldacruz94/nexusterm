import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SerializeAddon } from '@xterm/addon-serialize';
import '@xterm/xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import { state } from './state.js';
import { setActive, fitAll, initPanelDrag, splitActive, closePanel, focusDirection, setActiveTab, closeTab } from './panel.js';
import { showShortcuts } from './shortcuts.js';
import { createSession, deleteSession, showSessionBell } from './sessions.js';
import { modKey, modLabel } from './platform.js';

const DEFAULT_FONT_SIZE = 14;
let currentFontSize = DEFAULT_FONT_SIZE;

export function setFontSize(delta) {
  if (delta === 0) {
    currentFontSize = DEFAULT_FONT_SIZE;
  } else {
    currentFontSize = Math.min(32, Math.max(8, currentFontSize + delta));
  }
  for (const panel of state.panels.values()) {
    for (const tab of panel.tabs.values()) {
      tab.term.options.fontSize = currentFontSize;
    }
  }
  fitAll();
}

export function getFontSize() { return currentFontSize; }

// Sets font size without updating existing terminals — called during restore
// before any terminals exist so the value is picked up by new Terminal().
export function restoreFontSize(size) {
  currentFontSize = Math.min(32, Math.max(8, size));
}

const TERM_OPTIONS = {
  cursorBlink: true,
  fontSize: DEFAULT_FONT_SIZE,
  fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace',
  scrollback: 10_000,
  theme: {
    background:          '#1a1b26',
    foreground:          '#c0caf5',
    cursor:              '#c0caf5',
    cursorAccent:        '#1a1b26',
    selectionBackground: '#283457',
    black:               '#15161e',
    red:                 '#f7768e',
    green:               '#9ece6a',
    yellow:              '#e0af68',
    blue:                '#7aa2f7',
    magenta:             '#bb9af7',
    cyan:                '#7dcfff',
    white:               '#a9b1d6',
    brightBlack:         '#414868',
    brightRed:           '#f7768e',
    brightGreen:         '#9ece6a',
    brightYellow:        '#e0af68',
    brightBlue:          '#7aa2f7',
    brightMagenta:       '#bb9af7',
    brightCyan:          '#7dcfff',
    brightWhite:         '#c0caf5',
  },
};

export async function addPanelTab(panelId) {
  const panel = state.panels.get(panelId);
  if (!panel) return null;

  const tabId = `pty-${++state.panelCounter}`;

  // Tab button
  const tabEl = document.createElement('button');
  tabEl.className = 'panel-tab';

  const tabTitle = document.createElement('span');
  tabTitle.className = 'panel-tab-name';
  tabTitle.textContent = 'bash';
  tabEl.appendChild(tabTitle);

  const tabClose = document.createElement('button');
  tabClose.className = 'panel-tab-close';
  tabClose.textContent = '×';
  tabClose.addEventListener('click', (e) => { e.stopPropagation(); closeTab(panelId, tabId); });
  tabEl.appendChild(tabClose);

  tabEl.addEventListener('click', () => { setActiveTab(panelId, tabId); setActive(panelId); });

  panel.tabsListEl.appendChild(tabEl);

  // Terminal container (hidden until active)
  const termEl = document.createElement('div');
  termEl.className = 'panel-terminal';
  termEl.style.display = 'none';
  panel.contentEl.appendChild(termEl);

  // Terminal instance
  const term          = new Terminal({ ...TERM_OPTIONS, fontSize: currentFontSize });
  const fitAddon      = new FitAddon();
  const serializeAddon = new SerializeAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(serializeAddon);
  term.loadAddon(new WebLinksAddon());
  term.open(termEl);

  termEl.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setFontSize(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  term.onTitleChange((title) => { if (title) tabTitle.textContent = title; });

  term.onBell(() => {
    const panel = state.panels.get(panelId);
    if (panel) showSessionBell(panel.sessionId);
  });

  termEl.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text/plain');
    if (text) { term.paste(text); e.preventDefault(); }
  });

  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    const mod = e[modKey];
    if (mod && !e.shiftKey && e.key === '/') { e.preventDefault(); showShortcuts(); return false; }
    if (mod && !e.shiftKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); setFontSize(1);  return false; }
    if (mod && !e.shiftKey && e.key === '-')                    { e.preventDefault(); setFontSize(-1); return false; }
    if (mod && !e.shiftKey && e.key === '0')                    { e.preventDefault(); setFontSize(0);  return false; }
    if (mod && !e.shiftKey && e.key === 'v') {
      navigator.clipboard.readText().then((text) => { if (text) term.paste(text); });
      return false;
    }
    if (!e.ctrlKey && !e.altKey && e.shiftKey && e.key === 'Enter') {
      invoke('write_to_pty', { id: tabId, data: '\x1b[13;2u' });
      return false;
    }
    if (e.ctrlKey && !e.shiftKey && e.key === 'Enter') {
      invoke('write_to_pty', { id: tabId, data: '\n' });
      return false;
    }
    if (mod && !e.shiftKey && e.key === 'c') {
      const sel = term.getSelection();
      if (sel) { navigator.clipboard.writeText(sel); return false; }
      return true;
    }
    if (mod && !e.shiftKey && e.key === 'd') {
      deleteSession(state.activeSessionId);
      return false;
    }
    if (mod && e.shiftKey) {
      switch (e.key) {
        case 'D':          splitActive('horizontal');        return false;
        case 'E':          splitActive('vertical');          return false;
        case 'T':          addPanelTab(panelId);             return false;
        case 'W':          closeTab(panelId, tabId);         return false;
        case 'S':          createSession();                  return false;
        case 'A':          term.selectAll();                 return false;
        case 'ArrowUp':    focusDirection('up');             return false;
        case 'ArrowDown':  focusDirection('down');           return false;
        case 'ArrowRight': focusDirection('right');          return false;
        case 'ArrowLeft':  focusDirection('left');           return false;
      }
    }
    return true;
  });

  term.onData((data) => invoke('write_to_pty', { id: tabId, data }));
  term.onResize(({ rows, cols }) => invoke('resize_pty', { id: tabId, rows, cols }));

  panel.tabs.set(tabId, { term, fitAddon, serializeAddon, termEl, tabEl });

  setActiveTab(panelId, tabId);

  await invoke('create_pty', { id: tabId, rows: term.rows, cols: term.cols })
    .catch((err) => term.writeln(`\x1b[31mFailed to start shell: ${err}\x1b[0m`));

  return tabId;
}

export async function createPanel(container, sessionId) {
  const panelId = `panel-${++state.panelCounter}`;

  const el = document.createElement('div');
  el.className = 'panel';

  // ── Tabbar ──────────────────────────────────────────────────────────────
  const tabbar = document.createElement('div');
  tabbar.className = 'panel-tabbar';

  const tabsList = document.createElement('div');
  tabsList.className = 'panel-tabs';
  tabbar.appendChild(tabsList);

  const actions = document.createElement('div');
  actions.className = 'panel-tabbar-actions';

  const addBtn = document.createElement('button');
  addBtn.className = 'panel-tab-add';
  addBtn.title = `New tab (${modLabel}+Shift+T)`;
  addBtn.textContent = '+';
  addBtn.addEventListener('click', (e) => { e.stopPropagation(); addPanelTab(panelId); });
  actions.appendChild(addBtn);

  const splitHBtn = document.createElement('button');
  splitHBtn.className = 'panel-split-btn';
  splitHBtn.title = `Split right (${modLabel}+Shift+D)`;
  splitHBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="5" height="12" rx="1" fill="currentColor" opacity="0.5"/>
    <rect x="8" y="1" width="5" height="12" rx="1" fill="currentColor"/>
  </svg>`;
  splitHBtn.addEventListener('click', (e) => { e.stopPropagation(); splitActive('horizontal'); });
  actions.appendChild(splitHBtn);

  const splitVBtn = document.createElement('button');
  splitVBtn.className = 'panel-split-btn';
  splitVBtn.title = `Split down (${modLabel}+Shift+E)`;
  splitVBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="12" height="5" rx="1" fill="currentColor" opacity="0.5"/>
    <rect x="1" y="8" width="12" height="5" rx="1" fill="currentColor"/>
  </svg>`;
  splitVBtn.addEventListener('click', (e) => { e.stopPropagation(); splitActive('vertical'); });
  actions.appendChild(splitVBtn);

  const dragHandle = document.createElement('div');
  dragHandle.className = 'panel-drag-handle';
  dragHandle.textContent = '⠿';
  dragHandle.title = 'Drag to swap';
  actions.appendChild(dragHandle);

  tabbar.appendChild(actions);
  el.appendChild(tabbar);

  // ── Content area ─────────────────────────────────────────────────────────
  const contentEl = document.createElement('div');
  contentEl.className = 'panel-content';
  el.appendChild(contentEl);

  el.addEventListener('mousedown', () => setActive(panelId));
  container.appendChild(el);

  state.panels.set(panelId, {
    el,
    sessionId,
    tabs:        new Map(),
    activeTabId: null,
    contentEl,
    tabsListEl:  tabsList,
    get fitAddon()      { return this.tabs.get(this.activeTabId)?.fitAddon; },
    get serializeAddon(){ return this.tabs.get(this.activeTabId)?.serializeAddon; },
    get term()          { return this.tabs.get(this.activeTabId)?.term; },
  });

  initPanelDrag(el);
  await addPanelTab(panelId);

  fitAll();
  setActive(panelId);
  return panelId;
}
