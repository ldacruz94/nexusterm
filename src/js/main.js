import { listen } from '@tauri-apps/api/event';
import { state } from './state.js';
import { fitAll, splitActive, closePanel } from './panel.js';
import { createSession } from './sessions.js';
import { showShortcuts, hideShortcuts } from './shortcuts.js';
import { appWindow, initWindowControls, initSidebarResize } from './window.js';

await listen('pty-output', (event) => {
  state.panels.get(event.payload.id)?.term.write(event.payload.data);
});

await listen('pty-exited', (event) => {
  const id = event.payload;
  if (!state.panels.has(id)) return;
  if (state.panels.size === 1) {
    appWindow.close();
  } else {
    closePanel(id, { force: true });
  }
});

document.getElementById('btn-split-h').addEventListener('click', () => splitActive('horizontal'));
document.getElementById('btn-split-v').addEventListener('click', () => splitActive('vertical'));
document.getElementById('btn-help').addEventListener('click', showShortcuts);
document.getElementById('btn-shortcuts-close').addEventListener('click', hideShortcuts);
document.getElementById('btn-new-session').addEventListener('click', () => createSession());

initWindowControls();
initSidebarResize();

new ResizeObserver(fitAll).observe(document.getElementById('main'));

await createSession('Session 1');
