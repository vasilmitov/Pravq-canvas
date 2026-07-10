'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  addEdge,
} from '@xyflow/react';
import MarkdownNode from './nodes/MarkdownNode';
import TextNode from './nodes/TextNode';
import RichTextNode from './nodes/RichTextNode';
import GroupNode from './nodes/GroupNode';
import LabelNode from './nodes/LabelNode';
import MediaNode from './nodes/MediaNode';
import SearchNode from './nodes/SearchNode';
import CanvasContextMenu from './CanvasContextMenu';
import PersonalizationPanel from './PersonalizationPanel';
import { useCanvasStore } from '@/store/useCanvasStore';
import type { GridPattern, WorkspaceNodeData } from '@/types/canvas';
import { Save, Download, FileDown, Upload, Settings, Crosshair, Undo2, Redo2, Search, Cable, EyeOff, Eye, HelpCircle } from 'lucide-react';
import SearchPalette from './SearchPalette';

const nodeTypes = { markdown: MarkdownNode, text: TextNode, richtext: RichTextNode, group: GroupNode, label: LabelNode, media: MediaNode, search: SearchNode };

const defaultEdgeOptions = {
  type: 'default',
  style: { strokeWidth: 2.5, stroke: 'var(--accent-color)', opacity: 0.7 },
  animated: false,
  reconnectable: true,
};

const GRID_VARIANT_MAP: Record<GridPattern, BackgroundVariant | undefined> = {
  none: undefined,
  dots: BackgroundVariant.Dots,
  lines: BackgroundVariant.Lines,
  cross: BackgroundVariant.Cross,
};

interface ContextMenuState {
  screenPos: { x: number; y: number };
  flowPos: { x: number; y: number };
  targetNodeIds: string[];
}

function cn(...classes: (string | boolean | undefined)[]) { return classes.filter(Boolean).join(' '); }

function CanvasInner() {
  const {
    nodes, edges, onNodesChange, onEdgesChange, load, save, backup,
    initAutoSave, saveStatus, groupAroundNodes, removeSelectedNodes,
    copySelectedNodes, pasteNodes, settings, updateSettings,
    canUndo, canRedo, undo, redo, pushHistory,
    privacyMode, togglePrivacyMode, showShortcuts, toggleShortcuts,
    duplicateNode,
  } = useCanvasStore();

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [isSettingDefaultPoint, setIsSettingDefaultPoint] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);
  const { screenToFlowPosition, setViewport, getViewport, fitView } = useReactFlow();
  const loadedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseScreenPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Track mouse for paste position
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => { mouseScreenPos.current = { x: e.clientX, y: e.clientY }; };
    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Apply background color from settings
  useEffect(() => {
    document.documentElement.style.setProperty('--canvas-bg', settings.backgroundColor);
  }, [settings.backgroundColor]);

  // Track zoom level for the indicator
  useEffect(() => {
    const interval = setInterval(() => {
      const vp = getViewport();
      setZoomPct(Math.round(vp.zoom * 100));
    }, 300);
    return () => clearInterval(interval);
  }, [getViewport]);

  // Load saved state on mount
  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      load().then((state) => {
        const s = useCanvasStore.getState().settings;
        document.documentElement.style.setProperty('--canvas-bg', s.backgroundColor);
        if (s.showDefaultOnOpen && s.defaultViewport) {
          setViewport(s.defaultViewport);
        } else if (state?.viewport) {
          setViewport(state.viewport);
        }
      });
    }
  }, [load, setViewport]);

  useEffect(() => { return initAutoSave(); }, [initAutoSave]);

  const getSelectedNodeIds = useCallback(() => nodes.filter((n) => n.selected).map((n) => n.id), [nodes]);

  // Double-click on pane → context menu
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleDblClick = (e: MouseEvent) => {
      if (isSettingDefaultPoint) return;
      const target = e.target as HTMLElement;
      if (target.closest('.react-flow__node') || target.closest('.react-flow__controls') || target.closest('.react-flow__minimap') || target.closest('.canvas-toolbar') || target.closest('.canvas-toolbar--left') || target.closest('.canvas-context-menu') || target.closest('.personalization-panel')) return;
      setContextMenu({ screenPos: { x: e.clientX, y: e.clientY }, flowPos: screenToFlowPosition({ x: e.clientX, y: e.clientY }), targetNodeIds: [] });
    };
    container.addEventListener('dblclick', handleDblClick);
    return () => container.removeEventListener('dblclick', handleDblClick);
  }, [screenToFlowPosition, isSettingDefaultPoint]);

  const handlePaneClick = useCallback((event: React.MouseEvent | MouseEvent) => {
    if (isSettingDefaultPoint) {
      const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const vp = getViewport();
      updateSettings({ defaultViewport: { x: vp.x, y: vp.y, zoom: vp.zoom }, showDefaultOnOpen: true });
      setIsSettingDefaultPoint(false);
      setContextMenu(null);
      return;
    }
    setContextMenu(null);
  }, [isSettingDefaultPoint, screenToFlowPosition, getViewport, updateSettings]);

  const handleConnect = useCallback((connection: Connection) => {
    pushHistory();
    const { onEdgesChange } = useCanvasStore.getState();
    const newEdge = {
      ...connection,
      id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
      type: 'default',
      style: { strokeWidth: 2.5, stroke: 'var(--accent-color)', opacity: 0.7 },
    };
    onEdgesChange([{ type: 'add', item: newEdge }]);
  }, [pushHistory]);

  // One-way connections: only allow source→target (right→left), never target→anything
  const isValidConnection = useCallback((connection: Connection | Edge) => {
    // Only allow connections originating from a "source" handle
    return connection.sourceHandle === 'source';
  }, []);

  // Edge reconnection: lets users drag an edge endpoint to a different handle.
  // This is how you "detach" a spaghetti — grab the endpoint dot and move it.
  const handleReconnect = useCallback((oldEdge: Edge, newConnection: Connection) => {
    pushHistory();
    const { onEdgesChange } = useCanvasStore.getState();
    // Remove old edge, add new one with fresh id
    onEdgesChange([{ type: 'remove', id: oldEdge.id }]);
    const newEdge = {
      ...newConnection,
      id: `edge-${newConnection.source}-${newConnection.target}-${Date.now()}`,
      type: 'default',
      style: { strokeWidth: 2.5, stroke: 'var(--accent-color)', opacity: 0.7 },
    };
    onEdgesChange([{ type: 'add', item: newEdge }]);
  }, [pushHistory]);

  // Handle navigate to node from search
  const handleNavigate = useCallback((nodeId: string) => {
    const node = useCanvasStore.getState().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const w = (node.style?.width as number) || node.data.width || 300;
    const h = (node.style?.height as number) || node.data.height || 200;
    const targetZoom = 1;
    const container = containerRef.current?.querySelector('.react-flow__viewport')?.parentElement;
    const containerW = container?.clientWidth || window.innerWidth;
    const containerH = container?.clientHeight || window.innerHeight;
    const newX = containerW / 2 - (node.position.x + w / 2) * targetZoom;
    const newY = containerH / 2 - (node.position.y + h / 2) * targetZoom;
    setViewport({ x: newX, y: newY, zoom: targetZoom }, { duration: 300 });
    useCanvasStore.setState({
      nodes: useCanvasStore.getState().nodes.map((n) => ({
        ...n,
        selected: n.id === nodeId,
      })),
    });
  }, [setViewport]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow Escape to close search even from input
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        return;
      }
      if (e.key === 'Escape' && showShortcuts) {
        toggleShortcuts();
        return;
      }

      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement).isContentEditable) return;

      // Help overlay (?)
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        toggleShortcuts();
        return;
      }

      // Privacy mode toggle (P)
      if (e.key === 'p' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        togglePrivacyMode();
        return;
      }

      // Search palette toggle
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch((s) => !s);
        return;
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        useCanvasStore.getState().undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        useCanvasStore.getState().redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        useCanvasStore.getState().redo();
        return;
      }

      if (e.key === 'Delete' || (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey)) {
        const selected = getSelectedNodeIds();
        const { edges } = useCanvasStore.getState();
        const selectedEdgeIds = edges.filter((ed) => ed.selected).map((ed) => ed.id);
        if (selected.length > 0 || selectedEdgeIds.length > 0) {
          e.preventDefault();
          if (selected.length > 0) removeSelectedNodes(selected);
          if (selectedEdgeIds.length > 0) {
            pushHistory();
            const { onEdgesChange } = useCanvasStore.getState();
            onEdgesChange(selectedEdgeIds.map((id) => ({ type: 'remove', id })));
          }
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        const selected = getSelectedNodeIds();
        if (selected.length >= 1) groupAroundNodes(selected);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const selected = getSelectedNodeIds();
        if (selected.length > 0) { e.preventDefault(); copySelectedNodes(); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        const copied = useCanvasStore.getState().copiedNodes;
        if (copied && copied.length > 0) { e.preventDefault(); pasteNodes(screenToFlowPosition(mouseScreenPos.current)); }
      }
      if (e.key === 'Escape') {
        if (isSettingDefaultPoint) setIsSettingDefaultPoint(false);
        setContextMenu(null);
        setShowSettings(false);
        setShowSearch(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [getSelectedNodeIds, removeSelectedNodes, groupAroundNodes, copySelectedNodes, pasteNodes, screenToFlowPosition, isSettingDefaultPoint, showSearch, showShortcuts, toggleShortcuts, togglePrivacyMode]);

  const handlePaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    if (isSettingDefaultPoint) return;
    event.preventDefault();
    setContextMenu({ screenPos: { x: event.clientX, y: event.clientY }, flowPos: screenToFlowPosition({ x: event.clientX, y: event.clientY }), targetNodeIds: [] });
  }, [screenToFlowPosition, isSettingDefaultPoint]);

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: import('@xyflow/react').Node<WorkspaceNodeData>) => {
    if (isSettingDefaultPoint) return;
    event.preventDefault();
    event.stopPropagation();
    const nodeId = node.id;
    const selectedIds = node.selected ? getSelectedNodeIds() : [nodeId];
    setContextMenu({ screenPos: { x: event.clientX, y: event.clientY }, flowPos: screenToFlowPosition({ x: event.clientX, y: event.clientY }), targetNodeIds: selectedIds });
  }, [getSelectedNodeIds, screenToFlowPosition, isSettingDefaultPoint]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.15, duration: 300 });
  }, [fitView]);

  const handleZoomIn = useCallback(() => {
    const vp = getViewport();
    setViewport({ x: vp.x, y: vp.y, zoom: Math.min(vp.zoom * 1.2, 3) });
  }, [getViewport, setViewport]);

  const handleZoomOut = useCallback(() => {
    const vp = getViewport();
    setViewport({ x: vp.x, y: vp.y, zoom: Math.max(vp.zoom / 1.2, 0.1) });
  }, [getViewport, setViewport]);

  const handleSave = useCallback(() => save(getViewport()), [save, getViewport]);
  const handleBackup = useCallback(() => backup(getViewport()), [backup, getViewport]);

  const handleExport = useCallback(() => {
    const { nodes, edges, settings } = useCanvasStore.getState();
    const exportData = {
      _pravqgo: true,
      version: 1,
      exportedAt: new Date().toISOString(),
      nodes,
      edges,
      settings,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pravq-go-canvas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.nodes || !Array.isArray(data.nodes)) {
          alert('Invalid canvas file: missing nodes array');
          return;
        }
        useCanvasStore.setState({
          nodes: data.nodes,
          edges: data.edges || [],
          settings: data.settings || useCanvasStore.getState().settings,
        });
        const vp = getViewport();
        useCanvasStore.getState().save({ x: vp.x, y: vp.y, zoom: vp.zoom });
      } catch (err) {
        alert('Failed to import canvas file: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
    };
    input.click();
  }, [getViewport]);
  const handleToggleConnections = useCallback(() => {
    updateSettings({ showConnections: !settings.showConnections });
  }, [settings.showConnections, updateSettings]);
  const handleJumpToDefault = useCallback(() => {
    const s = useCanvasStore.getState().settings;
    if (s.defaultViewport) setViewport(s.defaultViewport);
  }, [setViewport]);

  const handleSetDefaultPoint = useCallback(() => {
    setIsSettingDefaultPoint(true);
    setShowSettings(false);
  }, []);

  const handleResetCanvas = useCallback(() => {
    useCanvasStore.setState({ nodes: [], edges: [] });
    handleSave();
  }, [handleSave]);

  const gridVariant = GRID_VARIANT_MAP[settings.gridPattern];
  const proOptions = useMemo(() => ({ hideAttribution: true }), []);
  const visibleEdges = settings.showConnections ? edges : [];

  return (
    <div className={cn('canvas-container', isSettingDefaultPoint && 'canvas-container--setting-point')} ref={containerRef}>
      <ReactFlow<Node<WorkspaceNodeData>, Edge>
        nodes={nodes} edges={visibleEdges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onReconnect={handleReconnect}
        isValidConnection={isValidConnection}
        onPaneContextMenu={handlePaneContextMenu} onNodeContextMenu={handleNodeContextMenu} onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes} proOptions={proOptions}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView snapToGrid snapGrid={[16, 16]}
        deleteKeyCode={null} multiSelectionKeyCode="Shift"
        zoomOnDoubleClick={false} selectionOnDrag={false}
        minZoom={0.1} maxZoom={3}
        connectionRadius={30}
        reconnectRadius={18}
        elevateNodesOnSelect={false}
        noDragClassName="nodrag" noWheelClassName="nowheel"
      >
        {gridVariant && (
          <Background
            variant={gridVariant}
            gap={28}
            size={settings.gridPattern === 'cross' ? 6 : settings.gridPattern === 'lines' ? 1 : 1.5}
            color={`rgba(255,255,255,${
              (settings.gridOpacity ?? 0.25) * (
                settings.gridPattern === 'lines' ? 0.2 :
                settings.gridPattern === 'cross' ? 0.4 : 1.0
              )
            })`}
          />
        )}
        <Controls showInteractive={false} showFitView={true} position="bottom-left" />
        {settings.showMinimap && <MiniMap position="bottom-right" maskColor="rgba(0,0,0,0.6)" nodeColor="#333" pannable zoomable style={{ backgroundColor: '#141414', borderColor: '#2a2a2a' }} />}
      </ReactFlow>
      {/* Zoom percentage indicator next to vertical controls */}
      <div className="canvas-zoom-indicator">{zoomPct}%</div>

      {/* Left toolbar: History & File operations */}
      <div className="canvas-toolbar canvas-toolbar--left">
        <button className="canvas-toolbar__btn" disabled={!canUndo} onClick={() => undo()} title="Undo (Ctrl+Z)"><Undo2 size={15} /></button>
        <button className="canvas-toolbar__btn" disabled={!canRedo} onClick={() => redo()} title="Redo (Ctrl+Shift+Z)"><Redo2 size={15} /></button>
        <div className="canvas-toolbar__sep" />
        <button className="canvas-toolbar__btn" onClick={handleImport} title="Import Canvas"><Upload size={15} /></button>
        <button className="canvas-toolbar__btn" onClick={handleExport} title="Export Canvas (JSON)"><FileDown size={15} /></button>
        <button className="canvas-toolbar__btn" onClick={handleBackup} title="Create Backup"><Download size={15} /></button>
      </div>

      {/* Right toolbar: Main controls */}
      <div className="canvas-toolbar">
        {/* Save status — always first, fixed-width so it never shifts other buttons */}
        <div className="canvas-toolbar__status">
          <span className={cn(
            'canvas-toolbar__status-text',
            saveStatus === 'saving' && 'canvas-toolbar__status-text--saving',
            saveStatus === 'saved' && 'canvas-toolbar__status-text--saved',
            saveStatus === 'error' && 'canvas-toolbar__status-text--error',
          )}>
            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'error' ? 'Error' : 'Saved'}
          </span>
        </div>
        <button className="canvas-toolbar__btn" onClick={handleSave} title="Save"><Save size={15} /></button>
        <div className="canvas-toolbar__sep" />
        <button className={cn('canvas-toolbar__btn', showSearch && 'canvas-toolbar__btn--active')} onClick={() => setShowSearch(true)} title="Search Nodes (Ctrl+K)"><Search size={15} /></button>
        <button className={cn('canvas-toolbar__btn', settings.showConnections && 'canvas-toolbar__btn--active')} onClick={handleToggleConnections} title="Toggle Connections"><Cable size={15} /></button>
        <div className="canvas-toolbar__sep" />
        <button className={cn('canvas-toolbar__btn', showSettings && 'canvas-toolbar__btn--active')} onClick={() => setShowSettings(!showSettings)} title="Personalization"><Settings size={15} /></button>
        <div className="canvas-toolbar__sep" />
        {/* Privacy Mode — visually distinct (wider, icon + label) */}
        <button
          className={cn('canvas-toolbar__btn canvas-toolbar__btn--privacy', privacyMode && 'canvas-toolbar__btn--privacy-active')}
          onClick={togglePrivacyMode}
          title="Privacy Mode (P) — hide all node content"
        >
          {privacyMode ? <EyeOff size={15} /> : <Eye size={15} />}
          <span className="canvas-toolbar__btn-label">{privacyMode ? 'Private' : 'Public'}</span>
        </button>
        <button className="canvas-toolbar__btn" onClick={toggleShortcuts} title="Keyboard Shortcuts (?)"><HelpCircle size={15} /></button>
      </div>

      {/* Jump to default point */}
      {settings.defaultViewport && (
        <button className="canvas-jump-btn" onClick={handleJumpToDefault} title="Jump to Default Point"><Crosshair size={15} /></button>
      )}

      {/* Setting default point hint */}
      {isSettingDefaultPoint && (
        <div className="canvas-default-point-hint">
          Click anywhere on the canvas to set the default view point
          <span className="canvas-default-point-hint__esc">· Press Esc to cancel</span>
        </div>
      )}

      {/* Hint */}
      <div className="canvas-hint">
        Double-click or right-click to add nodes · Shift+click to multi-select · Ctrl+G to group · Del to remove · Ctrl+K to search
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <CanvasContextMenu screenPos={contextMenu.screenPos} flowPos={contextMenu.flowPos} targetNodeIds={contextMenu.targetNodeIds} onClose={() => setContextMenu(null)} />
      )}

      {/* Personalization Panel */}
      {showSettings && (
        <PersonalizationPanel onClose={() => setShowSettings(false)} onSetDefaultPoint={handleSetDefaultPoint} hasDefaultPoint={!!settings.defaultViewport} onResetCanvas={handleResetCanvas} />
      )}

      {/* Search Palette */}
      {showSearch && (
        <SearchPalette onClose={() => setShowSearch(false)} onNavigate={handleNavigate} />
      )}

      {/* Keyboard Shortcuts Overlay */}
      {showShortcuts && (
        <div className="shortcuts-overlay" onClick={toggleShortcuts}>
          <div className="shortcuts-overlay__panel" onClick={(e) => e.stopPropagation()}>
            <div className="shortcuts-overlay__header">
              <h2>Keyboard Shortcuts</h2>
              <button className="shortcuts-overlay__close" onClick={toggleShortcuts}>×</button>
            </div>
            <div className="shortcuts-overlay__grid">
              <div className="shortcuts-overlay__section">
                <h3>Nodes</h3>
                <div className="shortcuts-overlay__row"><kbd>Double-click</kbd><span>Add node (context menu)</span></div>
                <div className="shortcuts-overlay__row"><kbd>Right-click</kbd><span>Context menu</span></div>
                <div className="shortcuts-overlay__row"><kbd>Delete</kbd><span>Remove selected</span></div>
                <div className="shortcuts-overlay__row"><kbd>Ctrl+C/V</kbd><span>Copy / Paste</span></div>
                <div className="shortcuts-overlay__row"><kbd>Ctrl+G</kbd><span>Group selection</span></div>
                <div className="shortcuts-overlay__row"><kbd>Shift+Click</kbd><span>Multi-select</span></div>
              </div>
              <div className="shortcuts-overlay__section">
                <h3>View</h3>
                <div className="shortcuts-overlay__row"><kbd>Ctrl+K</kbd><span>Search nodes</span></div>
                <div className="shortcuts-overlay__row"><kbd>P</kbd><span>Privacy mode toggle</span></div>
                <div className="shortcuts-overlay__row"><kbd>?</kbd><span>This help</span></div>
                <div className="shortcuts-overlay__row"><kbd>Esc</kbd><span>Close panels / cancel</span></div>
              </div>
              <div className="shortcuts-overlay__section">
                <h3>History</h3>
                <div className="shortcuts-overlay__row"><kbd>Ctrl+Z</kbd><span>Undo</span></div>
                <div className="shortcuts-overlay__row"><kbd>Ctrl+Shift+Z</kbd><span>Redo</span></div>
                <div className="shortcuts-overlay__row"><kbd>Ctrl+Y</kbd><span>Redo</span></div>
              </div>
              <div className="shortcuts-overlay__section">
                <h3>Rich Text</h3>
                <div className="shortcuts-overlay__row"><kbd>Ctrl+Enter</kbd><span>Add new block</span></div>
                <div className="shortcuts-overlay__row"><kbd>Double-click</kbd><span>Edit title</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}