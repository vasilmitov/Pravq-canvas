// lib/storage.js — Storage adapter for the extension.
// Detects whether we're running inside the Chrome extension context.
// If yes, uses chrome.storage.local via background messages.
// If no (web app), falls back to localStorage (so the same bundle works in a browser).

const STATE_KEY = 'pravqgo_canvasState';

function isExtension() {
  return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
}

export async function saveState(state) {
  if (isExtension()) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'SAVE_STATE', state }, resolve);
    });
  }
  // Web fallback
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export async function loadState() {
  if (isExtension()) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
        resolve(state || { nodes: [], edges: [], settings: {} });
      });
    });
  }
  // Web fallback
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : { nodes: [], edges: [], settings: {} };
  } catch {
    return { nodes: [], edges: [], settings: {} };
  }
}

export async function createBackup(state) {
  if (isExtension()) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'CREATE_BACKUP' }, resolve);
    });
  }
  // Web fallback: keep last 50 in localStorage with timestamp keys
  const key = `${STATE_KEY}_backup_${Date.now()}`;
  localStorage.setItem(key, JSON.stringify(state));
  const keys = Object.keys(localStorage)
    .filter(k => k.startsWith(`${STATE_KEY}_backup_`))
    .sort();
  while (keys.length > 50) {
    localStorage.removeItem(keys.shift());
  }
}

export async function getSettings() {
  if (isExtension()) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        {
          autoBackupEnabled: true, autoBackupIntervalMin: 60,
          remoteBackupEnabled: false, remoteBackupUrl: '',
          remoteBackupAuthHeader: '', remoteBackupIntervalMin: 30,
          remoteBackupOnEveryChange: false,
          openNodesInTabs: false, tabMode: 'pinned', syncTabsToCanvas: true,
          privacyModeOnOpen: false
        },
        resolve
      );
    });
  }
  return {};
}
