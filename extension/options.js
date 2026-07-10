    const KEYS = [
      'autoBackupEnabled', 'autoBackupIntervalMin',
      'remoteBackupEnabled', 'remoteBackupUrl', 'remoteBackupAuthHeader',
      'remoteBackupIntervalMin', 'remoteBackupOnEveryChange',
      'openNodesInTabs', 'tabMode', 'syncTabsToCanvas',
      'privacyModeOnOpen'
    ];
    const DEFAULTS = {
      autoBackupEnabled: true, autoBackupIntervalMin: 5,
      remoteBackupEnabled: false, remoteBackupUrl: '', remoteBackupAuthHeader: '',
      remoteBackupIntervalMin: 30, remoteBackupOnEveryChange: false,
      openNodesInTabs: false, tabMode: 'pinned', syncTabsToCanvas: true,
      privacyModeOnOpen: false
    };

    // Load
    chrome.storage.sync.get(DEFAULTS, (vals) => {
      KEYS.forEach(k => {
        const el = document.getElementById(k);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = vals[k];
        else el.value = vals[k];
      });
    });

    // Save
    document.getElementById('save').addEventListener('click', () => {
      const out = {};
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
