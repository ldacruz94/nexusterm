import { listen } from '@tauri-apps/api/event';
import { state } from './state.js';
import { fitAll, closePanel, closeTab } from './panel.js';
import { createSession, notifySessionActivity } from './sessions.js';
import { showShortcuts, hideShortcuts } from './shortcuts.js';
import { appWindow, initWindowControls, initSidebarResize } from './window.js';
import { saveState, loadState } from './persist.js';
import { markTabUnread, markTabRead, clearBell, initBell } from './notifications.js';
import { initStatusBar } from './statusbar.js';

await listen('pty-output', (event) => {
  const { id, data } = event.payload;
  for (const [panelId, panel] of state.panels) {
    const tab = panel.tabs.get(id);
    if (!tab) continue;

    tab.term.write(data);
    notifySessionActivity(panel.sessionId);

    const isActive = panelId === state.activeId && panel.activeTabId === id;
    if (isActive) {
      markTabRead(id);
    } else {
      markTabUnread(id);
    }
    return;
  }
});

await listen('pty-exited', (event) => {
  const tabId = event.payload;
  markTabRead(tabId);
  for (const [panelId, panel] of state.panels) {
    if (!panel.tabs.has(tabId)) continue;
    const totalTabs = [...state.panels.values()].reduce((n, p) => n + p.tabs.size, 0);
    if (totalTabs === 1) {
      appWindow.close();
    } else {
      const isActive = panelId === state.activeId && panel.activeTabId === tabId;
      if (!isActive) markTabUnread(tabId);
      closeTab(panelId, tabId, { force: true });
    }
    return;
  }
});

document.getElementById('btn-help').addEventListener('click', showShortcuts);
document.getElementById('btn-shortcuts-close').addEventListener('click', hideShortcuts);
document.getElementById('btn-new-session').addEventListener('click', () => createSession());

initBell();
initStatusBar();
await initWindowControls();
initSidebarResize();

new ResizeObserver(fitAll).observe(document.getElementById('main'));

window.addEventListener('beforeunload', saveState);

const restored = await loadState();
if (!restored) await createSession('Terminal');
