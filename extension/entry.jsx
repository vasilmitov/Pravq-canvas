// Entry point for the Chrome extension canvas bundle.
// Renders the canvas into #root, using the storage adapter (chrome.storage.local)
// instead of API routes.
import React from 'react';
import { createRoot } from 'react-dom/client';
import Canvas from '../src/components/workspace/Canvas';
import '@xyflow/react/dist/style.css';
import '../src/app/globals.css';

// Patch the Zustand store to use the extension storage adapter instead of fetch.
// We import the store and override save/load/backup to call chrome.storage.
import { useCanvasStore } from '../src/store/useCanvasStore';
import { saveState, loadState, createBackup } from './lib/storage.js';
import { getAuthToken, downloadState, uploadState, removeCachedToken } from './lib/gdrive.js';

window.useCanvasStore = useCanvasStore;

function sortNodesByParentOrder(nodes) {
  const by_id = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set();
  const result = [];
  const visit = (n) => {
    if (visited.has(n.id)) return;
    visited.add(n.id);
    const pid = n.parentId;
    if (pid && by_id.has(pid)) visit(by_id.get(pid));
    result.push(n);
  };
  for (const n of nodes) visit(n);
  return result;
}

useCanvasStore.setState({
  save: async (viewport) => {
    useCanvasStore.setState({ saveStatus: 'saving' });
    try {
      const { nodes, edges, settings } = useCanvasStore.getState();
      const state = { nodes, edges, viewport, settings, savedAt: new Date().toISOString() };
      await saveState(state);
      useCanvasStore.setState({ saveStatus: 'saved' });
      setTimeout(() => useCanvasStore.setState({ saveStatus: 'idle' }), 2000);
    } catch {
      useCanvasStore.setState({ saveStatus: 'error' });
    }
  },
  load: async () => {
    try {
      // 1. Fast load from local storage
      let state = await loadState();

      // 2. Fetch from Google Drive if sync is enabled
      const settings = await new Promise((resolve) => {
        chrome.storage.sync.get({ googleDriveSyncEnabled: false }, resolve);
      });

      if (settings.googleDriveSyncEnabled) {
        try {
          const token = await getAuthToken(false);
          if (token) {
            console.log('Google Drive sync active. Downloading state...');
            const driveState = await downloadState(token);
            if (driveState) {
              const driveSavedAt = driveState.savedAt ? new Date(driveState.savedAt).getTime() : 0;
              const localSavedAt = state && state.savedAt ? new Date(state.savedAt).getTime() : 0;

              if (driveSavedAt > localSavedAt || !state || !state.nodes || state.nodes.length === 0) {
                console.log('Google Drive state is newer. Syncing locally...');
                state = driveState;
                await saveState(driveState);
              } else if (localSavedAt > driveSavedAt) {
                console.log('Local state is newer. Syncing to Google Drive...');
                await uploadState(token, state);
              }
            } else if (state && state.nodes && state.nodes.length > 0) {
              console.log('Google Drive is empty. Uploading local state...');
              await uploadState(token, state);
            }
          }
        } catch (gdriveErr) {
          // If the token is rejected (401 Unauthorized or 403 Forbidden),
          // the cached token is stale. Remove it and reset sync so the
          // user is prompted to reconnect rather than seeing errors on every load.
          const status = gdriveErr && gdriveErr.status;
          if (status === 401 || status === 403) {
            console.warn('Google Drive: stale/invalid token detected. Clearing cached token and disabling sync.');
            try {
              const badToken = await getAuthToken(false);
              if (badToken) await removeCachedToken(badToken);
            } catch (_) { /* ignore */ }
            chrome.storage.sync.set({
              googleDriveSyncEnabled: false,
              googleDriveSyncEmail: ''
            });
          } else {
            console.warn('Google Drive sync skipped (non-auth error):', gdriveErr.message || gdriveErr);
          }
        }
      }

      if (state) {
        const sortedNodes = state.nodes && state.nodes.length > 0
          ? sortNodesByParentOrder(state.nodes)
          : [];
        useCanvasStore.setState({
          nodes: sortedNodes,
          edges: state.edges || [],
          settings: { ...useCanvasStore.getState().settings, ...(state.settings || {}) },
        });
      }
      return state;
    } catch {
      return null;
    }
  },
  backup: async (viewport) => {
    try {
      const { nodes, edges, settings } = useCanvasStore.getState();
      const state = { nodes, edges, viewport, settings, savedAt: new Date().toISOString() };
      await createBackup(state);
    } catch {
      // silent
    }
  },
});

function ExtensionApp() {
  return React.createElement(Canvas);
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(React.createElement(ExtensionApp));
}

