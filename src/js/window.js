import { getCurrentWindow } from '@tauri-apps/api/window';
import { fitAll } from './panel.js';

export const appWindow = getCurrentWindow();

export function initWindowControls() {
  document.getElementById('btn-minimize').addEventListener('click', () => appWindow.minimize());
  document.getElementById('btn-maximize').addEventListener('click', () => appWindow.toggleMaximize());
  document.getElementById('btn-close').addEventListener('click', () => appWindow.close());

  document.getElementById('titlebar').addEventListener('mousedown', (e) => {
    if (e.button === 0 && !e.target.closest('button')) appWindow.startDragging();
  });
}

export function initSidebarResize() {
  const sidebarResizer = document.getElementById('sidebar-resizer');
  const sidebar        = document.getElementById('sidebar');

  sidebarResizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
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
