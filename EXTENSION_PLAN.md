# Plan: pravq go — Chrome Extension

## Overview

Convert the pravq go infinite canvas into a **Manifest V3 Chrome Extension**. The canvas becomes a persistent workspace accessible from a side panel, a new-tab page, or a popup — configurable per user preference.

---

## 1. Architecture

```
extension/
├── manifest.json              # Manifest V3
├── background.js              # Service worker (side panel lifecycle, alarms for backup)
├── sidepanel.html             # Side panel entry (primary surface)
├── newtab.html                # New-tab override (optional surface)
├── popup.html                 # Toolbar popup (quick actions + open canvas)
├── options.html               # Settings page (backup URL, tab behavior, theme)
├── content/                   # Built canvas app (static bundle)
│   ├── _next/                 # Next.js static export (or Vite bundle)
│   ├── assets/
│   └── ...
├── lib/
│   ├── storage.js             # chrome.storage.local wrapper (replaces /tmp/canvas-data)
│   ├── sync-storage.js        # chrome.storage.sync for settings
│   ├── remote-backup.js       # Optional remote backup (fetch to user URL)
│   └── tab-manager.js         # "Pinned tab per node" feature
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### Build strategy

The current Next.js app is **server-dependent** (API routes for save/load). For the extension:

1. **Option A (recommended): Vite build of the canvas React components**
   - Extract `src/components/workspace/*`, `src/store/*`, `src/types/*`
   - Replace API-route persistence with `chrome.storage.local` calls
   - Vite bundles to a single static HTML+JS+CSS → loads in side panel
   - No server needed; everything runs client-side in the extension

2. **Option B: Next.js static export**
   - `next build && next export` → static HTML
   - Replace API routes with storage adapter
   - Heavier bundle, more complex config

→ **Choose Option A** (Vite) — lighter, simpler, fits extension constraints (no server-side code allowed in MV3).

---

## 2. manifest.json (Manifest V3)

```json
{
  "manifest_version": 3,
  "name": "pravq go — Infinite Canvas",
  "version": "1.0.0",
  "description": "A ComfyUI-inspired infinite canvas workspace for notes, markdown, rich text, and media.",
  "permissions": [
    "sidePanel",
    "storage",
    "tabs",
    "alarms",
    "unlimitedStorage"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "chrome_url_overrides": {
    "newtab": "newtab.html"
  },
  "options_page": "options.html",
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### Permissions explained

| Permission | Why |
|---|---|
| `sidePanel` | Primary canvas surface (Chrome 114+) |
| `storage` | `chrome.storage.local` for canvas state, `chrome.storage.sync` for settings |
| `tabs` | "Pinned tab per node" feature (open/close/focus node tabs) |
| `alarms` | Periodic auto-backup (replaces `setInterval`) |
| `unlimitedStorage` | Canvas state can grow large with many nodes |
| `<all_urls>` | Remote backup to user-configured URL + media node loading external images |

---

## 3. Settings (options.html)

User-configurable settings stored in `chrome.storage.sync` (synced across devices):

### 3.1 Auto Online & Remote Backup

| Setting | Type | Default | Description |
|---|---|---|---|
| `autoBackupEnabled` | boolean | `true` | Enable periodic local backups (chrome.storage.local) |
| `autoBackupIntervalMin` | number | `5` | Minutes between local backups |
| `remoteBackupEnabled` | boolean | `false` | Enable remote backup to user URL |
| `remoteBackupUrl` | string | `""` | PUT/POST endpoint URL (e.g., a Gist API, custom server, or Supabase) |
| `remoteBackupAuthHeader` | string | `""` | Optional Bearer token / API key |
| `remoteBackupIntervalMin` | number | `30` | Minutes between remote syncs |
| `remoteBackupOnEveryChange` | boolean | `false` | Debounced push after each edit (2s) |

**Remote backup protocol:**
```
PUT {remoteBackupUrl}
Authorization: Bearer {remoteBackupAuthHeader}
Content-Type: application/json

{ "canvas": { "nodes": [...], "edges": [...], "settings": {...} }, "savedAt": "..." }
```

Response: `200 OK` with `{ "ok": true }`. On failure, queue retry with exponential backoff.

**Restore:** On extension install/open, fetch from remote URL → if newer than local → prompt user to restore.

### 3.2 Node Tab Behavior

| Setting | Type | Default | Description |
|---|---|---|---|
| `openNodesInTabs` | boolean | `false` | Open each node in its own pinned Chrome tab |
| `tabMode` | `"pinned" \| "popup" \| "normal"` | `"pinned"` | How node tabs appear |
| `syncTabsToCanvas` | boolean | `true` | Edits in a node tab sync back to canvas |

**"Pinned tab per node" flow:**
1. User enables setting → all existing nodes get a pinned tab
2. Each tab URL: `chrome-extension://[id]/node.html?nodeId=[uuid]`
3. Tab title = node title; tab favicon = node-type icon
4. Closing a tab does NOT delete the node (just closes the tab view)
5. Creating a new node → optionally opens its tab automatically
6. Editing in a tab → `chrome.storage.local` update → canvas side panel reflects change live (via storage event)

### 3.3 Other settings

| Setting | Default | Description |
|---|---|---|
| `theme` | `"dark"` | Dark/light (currently dark-only) |
| `gridPattern` | `"dots"` | Canvas grid |
| `defaultViewport` | `null` | Startup camera position |
| `showConnections` | `true` | Toggle spaghetti edges |
| `privacyModeOnOpen` | `false` | Auto-enable privacy mode on launch |

---

## 4. Storage Adapter

Replace the 3 API routes (`/api/canvas/save|load|backup`) with a storage adapter:

```js
// lib/storage.js
const STATE_KEY = 'canvasState';
const BACKUP_PREFIX = 'backup_';

export async function saveState(state) {
  await chrome.storage.local.set({ [STATE_KEY]: state });
}

export async function loadState() {
  const { [STATE_KEY]: state } = await chrome.storage.local.get(STATE_KEY);
  return state || { nodes: [], edges: [], settings: {} };
}

export async function createBackup(state) {
  const key = BACKUP_PREFIX + Date.now();
  await chrome.storage.local.set({ [key]: state });
  // Prune: keep only last 50 backups
  const all = await chrome.storage.local.get(null);
  const backupKeys = Object.keys(all).filter(k => k.startsWith(BACKUP_PREFIX)).sort();
  while (backupKeys.length > 50) {
    const old = backupKeys.shift();
    await chrome.storage.local.remove(old);
  }
}
```

The Zustand store's `save()`/`load()`/`backup()` methods swap their `fetch()` calls for these adapter calls. No other code changes needed.

---

## 5. Background Service Worker

```js
// background.js
chrome.alarms.create('localBackup', { periodInMinutes: 5 });
chrome.alarms.create('remoteBackup', { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const { canvasState } = await chrome.storage.local.get('canvasState');
  if (!canvasState) return;

  if (alarm.name === 'localBackup') {
    await createBackup(canvasState);
  } else if (alarm.name === 'remoteBackup') {
    const settings = await chrome.storage.sync.get([
      'remoteBackupEnabled', 'remoteBackupUrl', 'remoteBackupAuthHeader'
    ]);
    if (settings.remoteBackupEnabled && settings.remoteBackupUrl) {
      await pushRemoteBackup(canvasState, settings);
    }
  }
});

// Side panel: open on action click
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
```

---

## 6. Migration Path (web → extension)

1. **Extract canvas components** — copy `src/components/workspace/*`, `src/store/*`, `src/types/*` into `extension/src/`
2. **Create storage adapter** — `lib/storage.js` (chrome.storage version)
3. **Patch Zustand store** — swap `fetch('/api/canvas/...')` → adapter calls (one-line changes in `save`/`load`/`backup`/`initAutoSave`)
4. **Vite config** — entry `sidepanel.html`, output to `extension/content/`
5. **Build** — `vite build` → load `extension/` as unpacked extension in `chrome://extensions`
6. **Test** — verify canvas works, state persists, backup runs

**Estimated effort:** 1-2 days for a working MVP extension.

---

## 7. Distribution

- **Unpacked** for personal use: `chrome://extensions` → Developer mode → Load unpacked
- **Chrome Web Store:** $5 developer fee, review process (~1-3 days), needs privacy policy if remote backup is used
