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

window.useCanvasStore = useCanvasStore;

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
      const state = await loadState();
      if (state) {
        useCanvasStore.setState({
          nodes: state.nodes || [],
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
