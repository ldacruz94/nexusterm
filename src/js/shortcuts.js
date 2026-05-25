const shortcutsDialog = document.getElementById('shortcuts-dialog');

export function showShortcuts() { shortcutsDialog.showModal(); }
export function hideShortcuts() { shortcutsDialog.close(); }

shortcutsDialog.addEventListener('click', (e) => {
  if (e.target === shortcutsDialog) hideShortcuts();
});
