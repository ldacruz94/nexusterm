import { invoke } from '@tauri-apps/api/core';
import { state } from './state.js';

// panelId -> { browserId, urlBarEl, sessionId }
const browsers = new Map();
let counter = 0;

export function hasBrowser(panelId) {
  return browsers.has(panelId);
}

export async function openBrowser(panelId) {
  if (browsers.has(panelId)) {
    await closeBrowser(panelId);
    return;
  }

  const panel = state.panels.get(panelId);
  if (!panel) return;

  const browserId = `browser-${++counter}`;
  const defaultUrl = 'https://www.google.com';

  const tabbar   = panel.el.querySelector('.panel-tabbar');
  const tabsList = panel.el.querySelector('.panel-tabs');
  const actions  = panel.el.querySelector('.panel-tabbar-actions');

  tabsList.style.display = 'none';

  const urlBar = document.createElement('input');
  urlBar.className   = 'browser-url-bar';
  urlBar.type        = 'text';
  urlBar.value       = defaultUrl;
  urlBar.spellcheck  = false;
  urlBar.placeholder = 'Enter URL…';
  tabbar.insertBefore(urlBar, actions);

  urlBar.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key !== 'Enter') return;
    let target = urlBar.value.trim();
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = 'https://' + target;
      urlBar.value = target;
    }
    invoke('navigate_browser', { id: browserId, url: target }).catch(console.error);
  });

  const contentEl = panel.el.querySelector('.panel-content');
  const rect = contentEl.getBoundingClientRect();

  try {
    await invoke('create_browser', {
      id: browserId,
      x: rect.left, y: rect.top,
      width: rect.width, height: rect.height,
      url: defaultUrl,
    });
  } catch (e) {
    console.error('Failed to create browser:', e);
    urlBar.remove();
    tabsList.style.display = '';
    return;
  }

  browsers.set(panelId, { browserId, urlBar, sessionId: panel.sessionId });
  setTimeout(() => urlBar.focus(), 50);
}

export async function closeBrowser(panelId) {
  const entry = browsers.get(panelId);
  if (!entry) return;
  browsers.delete(panelId);

  await invoke('close_browser', { id: entry.browserId }).catch(console.error);

  const panel = state.panels.get(panelId);
  if (panel) {
    entry.urlBar.remove();
    const tabsList = panel.el.querySelector('.panel-tabs');
    if (tabsList) tabsList.style.display = '';
  }
}

export async function syncBrowserBounds(panelId) {
  const entry = browsers.get(panelId);
  if (!entry) return;
  const panel = state.panels.get(panelId);
  if (!panel) return;
  const contentEl = panel.el.querySelector('.panel-content');
  if (!contentEl) return;
  const rect = contentEl.getBoundingClientRect();
  await invoke('update_browser_bounds', {
    id: entry.browserId,
    x: rect.left, y: rect.top,
    width: rect.width, height: rect.height,
  }).catch(console.error);
}

export async function syncAllBrowserBounds() {
  for (const [panelId] of browsers) {
    await syncBrowserBounds(panelId);
  }
}

export async function hideBrowsersForSession(sessionId) {
  for (const [, entry] of browsers) {
    if (entry.sessionId === sessionId) {
      await invoke('hide_browser', { id: entry.browserId }).catch(console.error);
    }
  }
}

export async function showBrowsersForSession(sessionId) {
  for (const [panelId, entry] of browsers) {
    if (entry.sessionId === sessionId) {
      await syncBrowserBounds(panelId);
      await invoke('show_browser', { id: entry.browserId }).catch(console.error);
    }
  }
}
