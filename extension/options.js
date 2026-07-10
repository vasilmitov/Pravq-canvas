import { getAuthToken, getUserEmail, removeCachedToken } from './lib/gdrive.js';

const KEYS = [
  'autoBackupEnabled', 'autoBackupIntervalMin',
  'remoteBackupEnabled', 'remoteBackupUrl', 'remoteBackupAuthHeader',
  'remoteBackupIntervalMin', 'remoteBackupOnEveryChange',
  'openNodesInTabs', 'tabMode', 'syncTabsToCanvas',
  'privacyModeOnOpen', 'googleDriveSyncEnabled'
];

const DEFAULTS = {
  autoBackupEnabled: true, autoBackupIntervalMin: 5,
  remoteBackupEnabled: false, remoteBackupUrl: '', remoteBackupAuthHeader: '',
  remoteBackupIntervalMin: 30, remoteBackupOnEveryChange: false,
  openNodesInTabs: false, tabMode: 'pinned', syncTabsToCanvas: true,
  privacyModeOnOpen: false,
  googleDriveSyncEnabled: false,
  googleDriveSyncEmail: ''
};

function updateGDriveUI(email) {
  const btn = document.getElementById('gdriveConnect');
  const status = document.getElementById('gdriveStatus');
  if (email) {
    status.textContent = `Connected as: ${email}`;
    status.style.color = '#6a9a6a';
    btn.textContent = 'Disconnect Google Drive';
    btn.style.background = '#8a2a2a';
  } else {
    status.textContent = 'Status: Not connected';
    status.style.color = '#aaa';
    btn.textContent = 'Connect Google Drive';
    btn.style.background = '#3b5998';
  }
}

// Load
chrome.storage.sync.get(DEFAULTS, (vals) => {
  KEYS.forEach(k => {
    const el = document.getElementById(k);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = vals[k];
    else el.value = vals[k];
  });
  updateGDriveUI(vals.googleDriveSyncEmail);
});

// Google Drive Auth Button Handler
document.getElementById('gdriveConnect').addEventListener('click', () => {
  const status = document.getElementById('gdriveStatus');
  chrome.storage.sync.get(DEFAULTS, async (vals) => {
    if (vals.googleDriveSyncEmail) {
      // Disconnect
      status.textContent = 'Disconnecting...';
      try {
        const token = await getAuthToken(false);
        if (token) {
          await removeCachedToken(token);
        }
      } catch (e) {
        // Safe to ignore token cached removal errors on logout
      }
      chrome.storage.sync.set({
        googleDriveSyncEmail: '',
        googleDriveSyncEnabled: false
      }, () => {
        document.getElementById('googleDriveSyncEnabled').checked = false;
        updateGDriveUI('');
      });
    } else {
      // Connect
      status.textContent = 'Connecting...';
      status.style.color = '#c9a55c';
      try {
        const token = await getAuthToken(true);
        const email = await getUserEmail(token);
        chrome.storage.sync.set({
          googleDriveSyncEmail: email,
          googleDriveSyncEnabled: true
        }, () => {
          document.getElementById('googleDriveSyncEnabled').checked = true;
          updateGDriveUI(email);
        });
      } catch (err) {
        status.textContent = `Connection failed: ${err.message || err}`;
        status.style.color = '#c05050';
      }
    }
  });
});

// Save
document.getElementById('save').addEventListener('click', () => {
  chrome.storage.sync.get(DEFAULTS, (current) => {
    const out = { ...current };
    KEYS.forEach(k => {
      const el = document.getElementById(k);
      if (!el) return;
      if (el.type === 'checkbox') out[k] = el.checked;
      else if (el.type === 'number') out[k] = Number(el.value);
      else out[k] = el.value;
    });

    chrome.storage.sync.set(out, () => {
      const s = document.getElementById('saved');
      s.classList.add('show');
      setTimeout(() => s.classList.remove('show'), 1500);
      // Re-create alarms with new intervals
      chrome.runtime.sendMessage({ type: 'RECREATE_ALARMS', settings: out });
    });
  });
});

