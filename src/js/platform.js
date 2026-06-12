export const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
export const modKey = isMac ? 'metaKey' : 'ctrlKey';
export const modLabel = isMac ? '⌘' : 'Ctrl';
