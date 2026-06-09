import { listen } from '@tauri-apps/api/event';
import { state } from './state.js';
import { fitAll, splitActive, closePanel, closeTab } from './panel.js';
import { createSession, notifySessionActivity } from './sessions.js';
import { showShortcuts, hideShortcuts } from './shortcuts.js';
import { appWindow, initWindowControls, initSidebarResize } from './window.js';
import { saveState, loadState } from './persist.js';

await listen('pty-output', (event) => {
  const { id, data } = event.payload;
  for (const panel of state.panels.values()) {
    const tab = panel.tabs.get(id);
    if (tab) {
      tab.term.write(data);
      notifySessionActivity(panel.sessionId);
      return;
    }
  }
});

await listen('pty-exited', (event) => {
  const tabId = event.payload;
  for (const [panelId, panel] of state.panels) {
    if (!panel.tabs.has(tabId)) continue;
    const totalTabs = [...state.panels.values()].reduce((n, p) => n + p.tabs.size, 0);
    if (totalTabs === 1) {
      appWindow.close();
    } else {
      closeTab(panelId, tabId, { force: true });
    }
    return;
  }
});

document.getElementById('btn-split-h').addEventListener('click', () => splitActive('horizontal'));
document.getElementById('btn-split-v').addEventListener('click', () => splitActive('vertical'));
document.getElementById('btn-help').addEventListener('click', showShortcuts);
document.getElementById('btn-shortcuts-close').addEventListener('click', hideShortcuts);
document.getElementById('btn-new-session').addEventListener('click', () => createSession());

await initWindowControls();
initSidebarResize();

new ResizeObserver(fitAll).observe(document.getElementById('main'));

window.addEventListener('beforeunload', saveState);

const restored = await loadState();
if (!restored) await createSession('Session 1');
