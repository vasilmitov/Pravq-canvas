// background.js — Service worker for pravq go extension
// Handles: side panel lifecycle, periodic backups (alarms), remote sync

const STATE_KEY = 'canvasState';
const BACKUP_PREFIX = 'backup_';
const MAX_BACKUPS = 50;

// Create periodic alarms
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('localBackup', { periodInMinutes: 5 });
  chrome.alarms.create('remoteBackup', { periodInMinutes: 30 });
  // Open side panel on action click
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  console.log('pravq go extension installed');
});

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    const { [STATE_KEY]: canvasState } = await chrome.storage.local.get(STATE_KEY);
    if (!canvasState) return;

    if (alarm.name === 'localBackup') {
      await createBackup(canvasState);
    } else if (alarm.name === 'remoteBackup') {
      const settings = await chrome.storage.sync.get([
        'remoteBackupEnabled',
        'remoteBackupUrl',
        'remoteBackupAuthHeader'
      ]);
      if (settings.remoteBackupEnabled && settings.remoteBackupUrl) {
        await pushRemoteBackup(canvasState, settings);
      }
    }
  } catch (err) {
    console.error('Alarm handler error:', err);
  }
});

async function createBackup(state) {
  const key = BACKUP_PREFIX + Date.now();
  await chrome.storage.local.set({ [key]: state });
  // Prune old backups
  const all = await chrome.storage.local.get(null);
  const backupKeys = Object.keys(all)
    .filter(k => k.startsWith(BACKUP_PREFIX))
    .sort();
  while (backupKeys.length > MAX_BACKUPS) {
    const old = backupKeys.shift();
    await chrome.storage.local.remove(old);
  }
}

async function pushRemoteBackup(state, settings) {
  const res = await fetch(settings.remoteBackupUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.remoteBackupAuthHeader
        ? { Authorization: `Bearer ${settings.remoteBackupAuthHeader}` }
        : {}),
    },
    body: JSON.stringify({
      canvas: state,
      savedAt: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`Remote backup failed: ${res.status}`);
}

// Listen for messages from content scripts (side panel / popup)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_STATE') {
    chrome.storage.local.get(STATE_KEY).then(({ [STATE_KEY]: state }) => {
      sendResponse(state || { nodes: [], edges: [], settings: {} });
    });
    return true; // async
  }
  if (msg.type === 'SAVE_STATE') {
    chrome.storage.local.set({ [STATE_KEY]: msg.state }).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === 'CREATE_BACKUP') {
    chrome.storage.local.get(STATE_KEY).then(({ [STATE_KEY]: state }) => {
      if (state) createBackup(state).then(() => sendResponse({ ok: true }));
      else sendResponse({ ok: false });
    });
    return true;
  }
  if (msg.type === 'PUSH_REMOTE') {
    chrome.storage.local.get(STATE_KEY).then(async ({ [STATE_KEY]: state }) => {
      const settings = await chrome.storage.sync.get([
        'remoteBackupEnabled', 'remoteBackupUrl', 'remoteBackupAuthHeader'
      ]);
      if (state && settings.remoteBackupEnabled && settings.remoteBackupUrl) {
        try {
          await pushRemoteBackup(state, settings);
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      } else {
        sendResponse({ ok: false, error: 'Remote backup not configured' });
      }
    });
    return true;
  }
});
