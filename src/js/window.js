import { getCurrentWindow } from '@tauri-apps/api/window';
import { fitAll } from './panel.js';
import { syncAllBrowserBounds } from './browser.js';

export const appWindow = getCurrentWindow();

async function syncMaximized() {
  document.documentElement.classList.toggle('maximized', await appWindow.isMaximized());
}

export async function initWindowControls() {
  document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    document.getElementById('app').classList.toggle('sidebar-hidden');
    sidebar.addEventListener('transitionend', () => {
      fitAll();
      syncAllBrowserBounds();
    }, { once: true });
  });

  document.getElementById('btn-minimize').addEventListener('click', () => appWindow.minimize());
  document.getElementById('btn-maximize').addEventListener('click', async () => {
    document.body.classList.add('maximizing');
    await appWindow.toggleMaximize();
  });
  document.getElementById('btn-close').addEventListener('click', () => appWindow.close());

  let lastTitlebarClick = 0;
  document.getElementById('titlebar').addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const now = Date.now();
    if (now - lastTitlebarClick < 300) {
      document.body.classList.add('maximizing');
      appWindow.toggleMaximize();
    } else {
      appWindow.startDragging();
    }
    lastTitlebarClick = now;
  });

  let fitDebounce;
  await appWindow.onResized(async () => {
    await syncMaximized();
    clearTimeout(fitDebounce);
    fitDebounce = setTimeout(() => {
      fitAll();
      document.body.classList.remove('maximizing');
    }, 150);
  });
  await syncMaximized(); // set correct state on launch
}

export function initSidebarResize() {
  const sidebarResizer = document.getElementById('sidebar-resizer');
  const sidebar        = document.getElementById('sidebar');

  sidebarResizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    sidebar.classList.add('no-transition');
    sidebarResizer.classList.add('dragging');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';

    const startX     = e.clientX;
    const startWidth = sidebar.getBoundingClientRect().width;

    const onMove = (ev) => {
      const width = Math.max(120, Math.min(400, startWidth + (ev.clientX - startX)));
      sidebar.style.width = `${width}px`;
    };

    const onUp = () => {
      sidebar.classList.remove('no-transition');
      sidebarResizer.classList.remove('dragging');
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      fitAll();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}
