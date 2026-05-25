import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SerializeAddon } from '@xterm/addon-serialize';
import '@xterm/xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import { state } from './state.js';
import { setActive, fitAll, initPanelDrag, splitActive, closePanel, focusDirection } from './panel.js';
import { showShortcuts } from './shortcuts.js';
import { createSession } from './sessions.js';

const TERM_OPTIONS = {
  cursorBlink: true,
  fontSize: 14,
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

export async function createPanel(container, sessionId) {
  const id = `pty-${++state.panelCounter}`;

  const el = document.createElement('div');
  el.className = 'panel';

  const termEl = document.createElement('div');
  termEl.className = 'panel-terminal';
  el.appendChild(termEl);

  const topRight = document.createElement('div');
  topRight.className = 'panel-top-right';

  const dragHandle = document.createElement('div');
  dragHandle.className = 'panel-drag-handle';
  dragHandle.textContent = '⠿';
  dragHandle.title = 'Drag to swap';
  topRight.appendChild(dragHandle);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'panel-close';
  closeBtn.textContent = '×';
  closeBtn.title = 'Close panel (Ctrl+Shift+W)';
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closePanel(id); });
  topRight.appendChild(closeBtn);

  el.appendChild(topRight);

  el.addEventListener('mousedown', () => setActive(id));
  container.appendChild(el);

  const term          = new Terminal(TERM_OPTIONS);
  const fitAddon      = new FitAddon();
  const serializeAddon = new SerializeAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(serializeAddon);
  term.loadAddon(new WebLinksAddon());
  term.open(termEl);

  termEl.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text/plain');
    if (text) { term.paste(text); e.preventDefault(); }
  });

  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    if (e.ctrlKey && !e.shiftKey && e.key === '/') { e.preventDefault(); showShortcuts(); return false; }
    if (e.ctrlKey && !e.shiftKey && e.key === 'v') {
      navigator.clipboard.readText().then((text) => { if (text) term.paste(text); });
      return false;
    }
    if (!e.ctrlKey && !e.altKey && e.shiftKey && e.key === 'Enter') {
      invoke('write_to_pty', { id, data: '\n' });
      return false;
    }
    if (e.ctrlKey && !e.shiftKey && e.key === 'c') {
      const sel = term.getSelection();
      if (sel) { navigator.clipboard.writeText(sel); return false; }
      return true; // no selection → send ^C (SIGINT) to shell
    }
    if (e.ctrlKey && e.shiftKey) {
      switch (e.key) {
        case 'D':          splitActive('horizontal');  return false;
        case 'E':          splitActive('vertical');    return false;
        case 'W':          closePanel(id);             return false;
        case 'S':          createSession();            return false;
        case 'A':          term.selectAll();           return false;
        case 'ArrowUp':    focusDirection('up');       return false;
        case 'ArrowDown':  focusDirection('down');     return false;
        case 'ArrowRight': focusDirection('right');    return false;
        case 'ArrowLeft':  focusDirection('left');     return false;
      }
    }
    return true;
  });

  term.onData((data) => invoke('write_to_pty', { id, data }));
  term.onResize(({ rows, cols }) => invoke('resize_pty', { id, rows, cols }));

  state.panels.set(id, { term, fitAddon, serializeAddon, el, sessionId });
  initPanelDrag(el);
  fitAll();

  await invoke('create_pty', { id, rows: term.rows, cols: term.cols })
    .catch((err) => term.writeln(`\x1b[31mFailed to start shell: ${err}\x1b[0m`));

  setActive(id);
  return id;
}
