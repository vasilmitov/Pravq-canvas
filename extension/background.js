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
      autoBackupIntervalMin: 60
    });

    if (settings.autoBackupEnabled) {
      chrome.alarms.create('localBackup', { periodInMinutes: settings.autoBackupIntervalMin });
      console.log(`Local backup alarm scheduled every ${settings.autoBackupIntervalMin} minutes.`);
    } else {
      console.log('Local backup alarm is disabled.');
    }
  } catch (err) {
    console.error('Error setting up alarms:', err);
  }
}

// Create periodic alarms and context menu on install
chrome.runtime.onInstalled.addListener(async () => {
  await setupAlarms();
  chrome.contextMenus.create({
    id: "open-canvas",
    title: "📝 Open pravq go Canvas",
    contexts: ["all"]
  });
  console.log('pravq go extension installed');
});

async function openCanvasTab() {
  const url = chrome.runtime.getURL('canvas.html');
  const tabs = await chrome.tabs.query({});
  const canvasTab = tabs.find(t => t.url && t.url.startsWith(url));
  
  if (canvasTab) {
    // Focus existing tab
    await chrome.tabs.update(canvasTab.id, { active: true });
    await chrome.windows.update(canvasTab.windowId, { focused: true });
  } else {
    // Create new tab
    await chrome.tabs.create({ url });
  }
}

chrome.action.onClicked.addListener(() => {
  openCanvasTab();
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "open-canvas") {
    openCanvasTab();
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "_execute_action") {
    openCanvasTab();
  }
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
      'autoBackupIntervalMin'
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
          googleDriveSyncEnabled: false
        });

        // 1. Google Drive AppData sync push
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

  if (msg.type === 'RECREATE_ALARMS') {
    setupAlarms().then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === 'NOTIFY_CANVAS_RELOAD') {
    // Broadcast a reload signal to all open extension pages (new tab, side panel).
    // The canvas listens for this and calls load() to refresh its state.
    chrome.runtime.sendMessage({ type: 'CANVAS_STATE_UPDATED' });
    sendResponse({ ok: true });
    return true;
  }
});

