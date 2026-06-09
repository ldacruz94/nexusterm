let count = 0;
const unreadTabs = new Set();

export function markTabUnread(tabId) {
  if (unreadTabs.has(tabId)) return;
  unreadTabs.add(tabId);
  count++;
  renderBadge();
}

export function markTabRead(tabId) {
  if (!unreadTabs.has(tabId)) return;
  unreadTabs.delete(tabId);
  count = Math.max(0, count - 1);
  renderBadge();
}

export function clearBell() {
  unreadTabs.clear();
  count = 0;
  renderBadge();
}

export function initBell() {
  document.getElementById('btn-bell').addEventListener('click', clearBell);
}

function renderBadge() {
  const badge = document.getElementById('bell-badge');
  if (!badge) return;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.style.display = count > 0 ? 'flex' : 'none';
}
