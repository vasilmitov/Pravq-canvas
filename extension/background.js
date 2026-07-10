// background.js — Service worker for pravq go extension
// Handles: side panel lifecycle, periodic backups (alarms), remote sync

import { uploadState, getAuthToken } from './lib/gdrive.js';

const STATE_KEY = 'canvasState';
const BACKUP_PREFIX = 'backup_';
const MAX_BACKUPS = 50;

// Setup alarms dynamically based on settings
async function setupAlarms() {
  try {
    // Clear existing alarms to avoid duplicates or old schedules
    await chrome.alarms.clearAll();

    // Get current settings with defaults
    const settings = await chrome.storage.sync.get({
      autoBackupEnabled: true,
      autoBackupIntervalMin: 5,
      remoteBackupEnabled: false,
      remoteBackupIntervalMin: 30
    });

    if (settings.autoBackupEnabled) {
      chrome.alarms.create('localBackup', { periodInMinutes: settings.autoBackupIntervalMin });
      console.log(`Local backup alarm scheduled every ${settings.autoBackupIntervalMin} minutes.`);
    } else {
      console.log('Local backup alarm is disabled.');
    }

    if (settings.remoteBackupEnabled) {
      chrome.alarms.create('remoteBackup', { periodInMinutes: settings.remoteBackupIntervalMin });
      console.log(`Remote backup alarm scheduled every ${settings.remoteBackupIntervalMin} minutes.`);
    } else {
      console.log('Remote backup alarm is disabled.');
    }
  } catch (err) {
    console.error('Error setting up alarms:', err);
  }
}

// Create periodic alarms on install
chrome.runtime.onInstalled.addListener(async () => {
  await setupAlarms();
  // Open side panel on action click
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  console.log('pravq go extension installed');
});

// Verify alarms exist on startup/activation (lightweight check to avoid re-writing alarms on every wakeup)
chrome.alarms.getAll((alarms) => {
  if (alarms.length === 0) {
    console.log('No alarms found on startup/activation, initializing...');
    setupAlarms();
  }
});

// Watch for settings changes to dynamically re-adjust alarms
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync') {
    const alarmRelatedKeys = [
      'autoBackupEnabled',
      'autoBackupIntervalMin',
      'remoteBackupEnabled',
      'remoteBackupIntervalMin'
    ];
    const changedKeys = Object.keys(changes);
    const hasAlarmChanges = changedKeys.some(key => alarmRelatedKeys.includes(key));
    if (hasAlarmChanges) {
      console.log('Detected settings changes affecting alarms. Re-scheduling...');
      setupAlarms();
    }
  }
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
    chrome.storage.local.set({ [STATE_KEY]: msg.state }).then(async () => {
      sendResponse({ ok: true });

      // Non-blocking background sync operations on change
      try {
        const settings = await chrome.storage.sync.get({
          remoteBackupEnabled: false,
          remoteBackupUrl: '',
          remoteBackupAuthHeader: '',
          remoteBackupOnEveryChange: false,
          googleDriveSyncEnabled: false
        });

        // 1. Remote Backup URL push
        if (settings.remoteBackupEnabled && settings.remoteBackupOnEveryChange && settings.remoteBackupUrl) {
          await pushRemoteBackup(msg.state, settings);
          console.log('State changes pushed to remote backup successfully.');
        }

        // 2. Google Drive AppData sync push
        if (settings.googleDriveSyncEnabled) {
          try {
            const token = await getAuthToken(false);
            if (token) {
              await uploadState(token, msg.state);
              console.log('State changes successfully uploaded to Google Drive AppData.');
            }
          } catch (gdriveErr) {
            console.error('Google Drive auto-save upload failed:', gdriveErr);
          }
        }
      } catch (err) {
        console.error('Failed to run background sync/backup operations:', err);
      }
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
  if (msg.type === 'RECREATE_ALARMS') {
    setupAlarms().then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
});

