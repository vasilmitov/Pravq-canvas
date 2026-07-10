import { getAuthToken, getUserEmail, removeCachedToken } from './lib/gdrive.js';

const KEYS = [
  'autoBackupEnabled', 'autoBackupIntervalMin',
  'openNodesInTabs', 'tabMode', 'syncTabsToCanvas',
  'privacyModeOnOpen', 'googleDriveSyncEnabled'
];

const DEFAULTS = {
  autoBackupEnabled: true, autoBackupIntervalMin: 60,
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
    btn.style.background = '#27272a';
    btn.style.borderColor = '#3f3f46';
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
          updateGDriveUI(email);
        });
      } catch (err) {
        status.textContent = `Connection failed: ${err.message || err}`;
        status.style.color = '#c05050';
        updateGDriveUI('');
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

// ─── Local File Export ───────────────────────────────────────────────────────
document.getElementById('exportCanvas').addEventListener('click', () => {
  const statusEl = document.getElementById('fileBackupStatus');
  statusEl.style.color = '#71717a';
  statusEl.textContent = 'Preparing export...';

  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
    try {
      if (!state || !Array.isArray(state.nodes)) {
        throw new Error('Canvas is empty — nothing to export.');
      }
      // JSON.stringify natively handles all Unicode/Cyrillic code points correctly.
      const json = JSON.stringify(state, null, 2);

      // Blob with explicit UTF-8 charset ensures Cyrillic characters
      // are written correctly to the file (not garbled on Windows).
      const blob = new Blob([json], { type: 'application/json; charset=utf-8' });
      const url  = URL.createObjectURL(blob);

      // Build filename: pravq-canvas-2026-07-10.json
      const today = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href     = url;
      a.download = `pravq-canvas-${today}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Release the object URL after a short delay
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      statusEl.style.color = '#10b981';
      statusEl.textContent = '✓ Exported successfully';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    } catch (err) {
      statusEl.style.color = '#c05050';
      statusEl.textContent = `Export failed: ${err.message}`;
    }
  });
});

// ─── Local File Import ───────────────────────────────────────────────────────
document.getElementById('importCanvas').addEventListener('click', () => {
  const statusEl = document.getElementById('fileBackupStatus');

  // Use a hidden file input so we don't need extra permissions.
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    document.body.removeChild(input);
    if (!file) return;

    if (!confirm(`WARNING: Importing "${file.name}" will completely overwrite your current canvas!\n\nAre you sure you want to continue?`)) {
      input.value = '';
      return;
    }
    const importSettings = confirm(`Do you also want to import the Canvas Settings (colors, grid) from "${file.name}"?\n\nClick OK to import EVERYTHING.\nClick Cancel to import ONLY the notes and edges.`);

    statusEl.style.color = '#71717a';
    statusEl.textContent = 'Reading file...';

    const reader = new FileReader();

    // readAsText with explicit 'UTF-8' argument ensures Cyrillic and all
    // Unicode text is decoded correctly regardless of the OS locale.
    reader.readAsText(file, 'UTF-8');

    reader.onload = (e) => {
      let parsed;
      try {
        parsed = JSON.parse(e.target.result);
      } catch {
        statusEl.style.color = '#c05050';
        statusEl.textContent = 'Import failed: File is not valid JSON.';
        return;
      }

      // Validate that the file is a canvas state and not some random JSON.
      if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        statusEl.style.color = '#c05050';
        statusEl.textContent = 'Import failed: Not a valid pravq canvas file.';
        return;
      }

      const proceedWithImport = (finalState) => {
        statusEl.style.color = '#c9a55c';
        statusEl.textContent = 'Saving backup of current canvas...';

        // Step 1: Save a backup of the CURRENT canvas before overwriting.
        chrome.runtime.sendMessage({ type: 'CREATE_BACKUP' }, () => {

          // Step 2: Write the imported state to storage (also triggers Drive/remote sync).
          statusEl.textContent = 'Importing...';
          chrome.runtime.sendMessage({ type: 'SAVE_STATE', state: finalState }, () => {

            // Step 3: Tell any open new-tab canvas pages to reload their state.
            chrome.runtime.sendMessage({ type: 'NOTIFY_CANVAS_RELOAD' });

            statusEl.style.color = '#10b981';
            statusEl.textContent = '✓ Canvas imported successfully. Reload the canvas tab to see changes.';
            setTimeout(() => { statusEl.textContent = ''; }, 5000);
            if (typeof loadBackups === 'function') loadBackups();
          });
        });
      };

      if (!importSettings) {
        chrome.runtime.sendMessage({ type: 'GET_STATE' }, (currentState) => {
          parsed.settings = currentState.settings || {};
          proceedWithImport(parsed);
        });
      } else {
        proceedWithImport(parsed);
      }
    };

    reader.onerror = () => {
      statusEl.style.color = '#c05050';
      statusEl.textContent = 'Import failed: Could not read the file.';
    };
  });

  input.click();
});

// ─── Internal Backups UI ─────────────────────────────────────────────────────
function loadBackups() {
  chrome.storage.local.get(null, (all) => {
    const backupKeys = Object.keys(all || {})
      .filter(k => k.startsWith('backup_'))
      .sort((a, b) => b.localeCompare(a)); // Sort newest first
    
    const select = document.getElementById('backupSelect');
    const btn = document.getElementById('restoreBackupBtn');
    if (!select || !btn) return;
    
    select.innerHTML = '';
    if (backupKeys.length === 0) {
      select.innerHTML = '<option value="">No backups available</option>';
      btn.disabled = true;
      return;
    }
    
    const uniqueLabels = new Set();
    const filteredItems = [];
    
    backupKeys.forEach(k => {
      const ts = parseInt(k.replace('backup_', ''), 10);
      const d = new Date(ts);
      const dateLabel = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (!uniqueLabels.has(dateLabel)) {
        uniqueLabels.add(dateLabel);
        filteredItems.push({ key: k, label: dateLabel });
      }
    });
    
    filteredItems.slice(0, 15).forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.key;
      opt.textContent = item.label;
      select.appendChild(opt);
    });
    
    btn.disabled = false;
  });
}

loadBackups();

document.getElementById('restoreBackupBtn').addEventListener('click', () => {
  const select = document.getElementById('backupSelect');
  const key = select.value;
  if (!key) return;
  
  if (!confirm("WARNING: This will completely overwrite your current canvas with the selected backup!\n\nAre you absolutely sure you want to restore this backup?")) {
    return;
  }
  
  const statusEl = document.getElementById('fileBackupStatus');
  statusEl.style.color = '#71717a';
  statusEl.textContent = 'Restoring backup...';
  
  chrome.storage.local.get(key, (res) => {
    const backupState = res[key];
    if (backupState) {
      // Step 1: Save a backup of the CURRENT canvas before overwriting
      chrome.runtime.sendMessage({ type: 'CREATE_BACKUP' }, () => {
        // Step 2: Write the restored state
        chrome.runtime.sendMessage({ type: 'SAVE_STATE', state: backupState }, () => {
          chrome.runtime.sendMessage({ type: 'NOTIFY_CANVAS_RELOAD' });
          statusEl.style.color = '#10b981';
          statusEl.textContent = '✓ Backup restored successfully. Reload the canvas tab.';
          setTimeout(() => { statusEl.textContent = ''; }, 5000);
          loadBackups(); // Refresh the list
        });
      });
    }
  });
});
