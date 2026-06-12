import { modLabel } from './platform.js';

const shortcutsDialog = document.getElementById('shortcuts-dialog');

const SHORTCUTS = [
  { group: 'Panels & Tabs' },
  { label: 'Split right',           keys: ['mod', 'Shift', 'D'] },
  { label: 'Split down',            keys: ['mod', 'Shift', 'E'] },
  { label: 'New tab',               keys: ['mod', 'Shift', 'T'] },
  { label: 'Close tab',             keys: ['mod', 'Shift', 'W'] },
  { group: 'Focus' },
  { label: 'Focus up',              keys: ['mod', 'Shift', '↑'] },
  { label: 'Focus down',            keys: ['mod', 'Shift', '↓'] },
  { label: 'Focus left',            keys: ['mod', 'Shift', '←'] },
  { label: 'Focus right',           keys: ['mod', 'Shift', '→'] },
  { group: 'Clipboard' },
  { label: 'Copy (with selection)', keys: ['mod', 'C'] },
  { label: 'Paste',                 keys: ['mod', 'V'] },
  { label: 'Select all',            keys: ['mod', 'Shift', 'A'] },
  { group: 'Sessions' },
  { label: 'New session',           keys: ['mod', 'Shift', 'S'] },
  { label: 'Delete session',        keys: ['mod', 'D'] },
  { label: 'Rename session',        text: 'Double-click name' },
  { group: 'General' },
  { label: 'Show shortcuts',        keys: ['mod', '/'] },
  { label: 'Close this dialog',     keys: ['Esc'] },
];

function buildShortcutsTable() {
  const tbody = shortcutsDialog.querySelector('.shortcuts-table tbody');
  tbody.innerHTML = '';

  for (const entry of SHORTCUTS) {
    const tr = document.createElement('tr');

    if (entry.group) {
      tr.className = 'group-label';
      const td = document.createElement('td');
      td.colSpan = 2;
      td.textContent = entry.group;
      tr.appendChild(td);
    } else {
      const labelTd = document.createElement('td');
      labelTd.textContent = entry.label;
      tr.appendChild(labelTd);

      const keysTd = document.createElement('td');
      if (entry.text) {
        keysTd.textContent = entry.text;
      } else {
        for (const k of entry.keys) {
          const kbd = document.createElement('kbd');
          kbd.textContent = k === 'mod' ? modLabel : k;
          keysTd.appendChild(kbd);
        }
      }
      tr.appendChild(keysTd);
    }

    tbody.appendChild(tr);
  }
}

buildShortcutsTable();

export function showShortcuts() { shortcutsDialog.showModal(); }
export function hideShortcuts() { shortcutsDialog.close(); }

shortcutsDialog.addEventListener('click', (e) => {
  if (e.target === shortcutsDialog) hideShortcuts();
});
