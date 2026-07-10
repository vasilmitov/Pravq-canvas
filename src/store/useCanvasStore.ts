import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type Node,
  type Edge,
  type XYPosition,
} from '@xyflow/react';
import { v4 as uuid } from 'uuid';
import type {
  WorkspaceNodeData,
  NodeType,
  CanvasState,
  CanvasSettings,
  RichBlock,
  RichBlockType,
  TextAlign,
} from '@/types/canvas';

const DEFAULT_WIDTHS: Record<NodeType, number> = {
  markdown: 380,
  text: 380,
  richtext: 440,
  group: 500,
  label: 200,
  media: 360,
  search: 320,
};

const DEFAULT_HEIGHTS: Record<NodeType, number> = {
  markdown: 300,
  text: 260,
  richtext: 320,
  group: 400,
  label: 48,
  media: 280,
  search: 56,
};

const DEFAULT_TITLES: Record<NodeType, string> = {
  markdown: 'Markdown',
  text: 'Notes',
  richtext: 'Rich Text',
  group: 'Group',
  label: 'Label',
  media: 'Media',
  search: 'Search',
};

const DEFAULT_SETTINGS: CanvasSettings = {
  backgroundColor: '#0a0a0a',
  gridPattern: 'dots',
  gridOpacity: 0.25,
  defaultViewport: null,
  showDefaultOnOpen: false,
  showConnections: true,
  showMinimap: true,
};

interface HistoryEntry {
  nodes: Node<WorkspaceNodeData>[];
  edges: Edge[];
}

interface CanvasStore {
  nodes: Node<WorkspaceNodeData>[];
  edges: Edge[];
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  copiedNodes: Node<WorkspaceNodeData>[] | null;
  settings: CanvasSettings;
  privacyMode: boolean;
  showShortcuts: boolean;

  // Undo / Redo
  past: HistoryEntry[];
  future: HistoryEntry[];
  canUndo: boolean;
  canRedo: boolean;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  onNodesChange: (changes: NodeChange<Node<WorkspaceNodeData>>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;

  addNode: (type: NodeType, position: XYPosition) => void;
  updateNodeData: (id: string, data: Partial<WorkspaceNodeData>) => void;
  removeNode: (id: string) => void;
  removeSelectedNodes: (ids: string[]) => void;
  toggleCollapse: (id: string) => void;
  groupAroundNodes: (nodeIds: string[]) => void;
  addNodeToGroup: (nodeId: string, groupId: string) => void;
  resizeNode: (id: string, opts: { width: number; height: number; x?: number; y?: number }) => void;
  duplicateNode: (id: string) => void;

  // Copy / Paste
  copySelectedNodes: () => void;
  pasteNodes: (flowPos: XYPosition) => void;

  // Node lock
  toggleNodeLock: (nodeIds: string[]) => void;

  // Node color
  setNodeHeaderColor: (nodeIds: string[], color: string | undefined) => void;

  // Rich text helpers
  addRichBlock: (nodeId: string, afterBlockId?: string) => void;
  updateRichBlock: (nodeId: string, blockId: string, updates: Partial<RichBlock>) => void;
  removeRichBlock: (nodeId: string, blockId: string) => void;
  setActiveBlock: (nodeId: string, blockId: string | null) => void;
  changeBlockType: (nodeId: string, type: RichBlockType) => void;
  changeBlockAlign: (nodeId: string, align: TextAlign) => void;
  changeBlockColor: (nodeId: string, color: string | undefined) => void;
  toggleBlockHighlight: (nodeId: string) => void;

  // Canvas settings
  updateSettings: (updates: Partial<CanvasSettings>) => void;
  togglePrivacyMode: () => void;
  toggleShortcuts: () => void;

  // Persistence
  save: (viewport?: { x: number; y: number; zoom: number }) => Promise<void>;
  load: () => Promise<CanvasState | null>;
  backup: (viewport?: { x: number; y: number; zoom: number }) => Promise<void>;
  initAutoSave: () => () => void;
}

const MAX_HISTORY = 50;

// Track how many nodes have been created to offset positions
let nodeCounter = 0;

/** Sort nodes so parents come before children (React Flow requirement).
 *  If a child appears before its parent in the array, RF can't find the
 *  parent during render and the child disappears. */
function sortNodesByParentOrder(nodes: Node<WorkspaceNodeData>[]): Node<WorkspaceNodeData>[] {
  const by_id = new Map(nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const result: Node<WorkspaceNodeData>[] = [];
  const visit = (n: Node<WorkspaceNodeData>) => {
    if (visited.has(n.id)) return;
    visited.add(n.id);
    const pid = n.parentId;
    if (pid && by_id.has(pid)) visit(by_id.get(pid)!);
    result.push(n);
  };
  for (const n of nodes) visit(n);
  return result;
}

/** Convert child node positions from relative-to-parent to absolute canvas coords */
function ungroupChildren(
  nodes: Node<WorkspaceNodeData>[],
  groupIds: Set<string>
): Node<WorkspaceNodeData>[] {
  return nodes.map((n) => {
    if (!n.parentId || !groupIds.has(n.parentId)) return n;
    const parent = nodes.find((p) => p.id === n.parentId);
    if (!parent) {
      return { ...n, parentId: undefined, extent: undefined, expandParent: undefined, zIndex: undefined };
    }
    return {
      ...n,
      parentId: undefined,
      extent: undefined,
      expandParent: undefined,
      zIndex: undefined,
      position: {
        x: parent.position.x + n.position.x,
        y: parent.position.y + n.position.y,
      },
    };
  });
}

/** Deep clone a node with fresh IDs for rich blocks */
function cloneNodeForPaste(original: Node<WorkspaceNodeData>): Node<WorkspaceNodeData> {
  const id = uuid();
  const blockIdMap = new Map<string, string>();
  const newRichBlocks = original.data.richBlocks.map((b) => {
    const newId = uuid();
    blockIdMap.set(b.id, newId);
    return { ...b, id: newId };
  });
  const newActiveBlockId = original.data.activeBlockId
    ? (blockIdMap.get(original.data.activeBlockId) ?? newRichBlocks[0]?.id ?? null)
    : (newRichBlocks[0]?.id ?? null);

  return {
    ...original,
    id,
    selected: false,
    parentId: undefined,
    extent: undefined,
    zIndex: undefined,
    data: {
      ...original.data,
      richBlocks: newRichBlocks,
      activeBlockId: newActiveBlockId,
    },
    style: { ...(original.style as Record<string, unknown>) },
  };
}

let settingsSaveTimeout: ReturnType<typeof setTimeout> | undefined;

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  saveStatus: 'idle',
  copiedNodes: null,
  settings: DEFAULT_SETTINGS,
  privacyMode: false,
  showShortcuts: false,
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,

  pushHistory: () => {
    const { nodes, edges, past } = get();
    const snapshot: HistoryEntry = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    const newPast = [...past, snapshot];
    if (newPast.length > MAX_HISTORY) newPast.shift();
    set({ past: newPast, future: [], canUndo: true, canRedo: false });
  },

  undo: () => {
    const { past, nodes, edges, future } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const currentSnapshot: HistoryEntry = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    const newPast = past.slice(0, -1);
    const newFuture = [...future, currentSnapshot];
    set({
      nodes: previous.nodes,
      edges: previous.edges,
      past: newPast,
      future: newFuture,
      canUndo: newPast.length > 0,
      canRedo: true,
    });
  },

  redo: () => {
    const { future, nodes, edges, past } = get();
    if (future.length === 0) return;
    const next = future[future.length - 1];
    const currentSnapshot: HistoryEntry = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };
    const newFuture = future.slice(0, -1);
    const newPast = [...past, currentSnapshot];
    set({
      nodes: next.nodes,
      edges: next.edges,
      past: newPast,
      future: newFuture,
      canUndo: true,
      canRedo: newFuture.length > 0,
    });
  },

  onNodesChange: (changes) => {
    const removeIds = changes
      .filter((c) => c.type === 'remove')
      .map((c) => c.id);
    if (removeIds.length > 0) {
      const removeSet = new Set(removeIds);
      const nodes = get().nodes;
      const removedGroups = nodes.filter(
        (n) => removeSet.has(n.id) && n.data.nodeType === 'group'
      );

      if (removedGroups.length > 0) {
        const groupIds = new Set(removedGroups.map((g) => g.id));
        const childIds = new Set(
          nodes.filter((n) => n.parentId && groupIds.has(n.parentId)).map((n) => n.id)
        );
        const ungroupedNodes = ungroupChildren(nodes, groupIds);
        const filteredChanges = changes.filter(
          (c) => !(c.type === 'remove' && childIds.has(c.id))
        );
        set({ nodes: applyNodeChanges<Node<WorkspaceNodeData>>(filteredChanges, ungroupedNodes) });
        return;
      }
    }
    set({ nodes: applyNodeChanges<Node<WorkspaceNodeData>>(changes, get().nodes) });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  addNode: (type, position) => {
    get().pushHistory();
    const id = uuid();
    const defaultBlock: RichBlock = {
      id: uuid(),
      type: 'paragraph',
      content: '',
      align: 'left',
    };

    const isLabel = type === 'label';
    const isGroup = type === 'group';
    const newNode: Node<WorkspaceNodeData> = {
      id,
      type,
      position: { x: position.x, y: position.y },
      style: { width: DEFAULT_WIDTHS[type], height: DEFAULT_HEIGHTS[type] },
      zIndex: isGroup ? 0 : isLabel ? 2 : undefined,
      data: {
        nodeType: type,
        title: DEFAULT_TITLES[type],
        content: '',
        richBlocks: isLabel ? [] : [defaultBlock],
        collapsed: false,
        width: DEFAULT_WIDTHS[type],
        height: DEFAULT_HEIGHTS[type],
        activeBlockId: !isLabel && type === 'richtext' ? defaultBlock.id : null,
        ...(isLabel ? { labelColor: '#c9a55c', labelFontSize: 24 } : {}),
      },
    };

    set({ nodes: [...get().nodes, newNode] });
  },

  updateNodeData: (id, data) => {
    get().pushHistory();
    set({
      nodes: get().nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...data } } : node
      ),
    });
  },

  removeNode: (id) => {
    get().pushHistory();
    const node = get().nodes.find((n) => n.id === id);
    if (!node) return;
    if (node.data.nodeType === 'group') {
      const nodes = get().nodes;
      const ungrouped = ungroupChildren(nodes, new Set([id]));
      set({ nodes: ungrouped.filter((n) => n.id !== id) });
    } else {
      set({ nodes: get().nodes.filter((n) => n.id !== id) });
    }
  },

  removeSelectedNodes: (ids) => {
    get().pushHistory();
    const deleteIds = new Set(ids);
    const nodes = get().nodes;
    const deletedGroupIds = new Set(
      nodes.filter((n) => deleteIds.has(n.id) && n.data.nodeType === 'group').map((n) => n.id)
    );
    const nodesToKeep = nodes
      .map((n) => {
        if (deleteIds.has(n.id)) {
          if (n.parentId && deletedGroupIds.has(n.parentId)) {
            const parent = nodes.find((p) => p.id === n.parentId);
            return {
              ...n,
              parentId: undefined,
              extent: undefined,
              zIndex: undefined,
              position: parent
                ? { x: parent.position.x + n.position.x, y: parent.position.y + n.position.y }
                : n.position,
            };
          }
          return null;
        }
        if (n.parentId && deletedGroupIds.has(n.parentId)) {
          const parent = nodes.find((p) => p.id === n.parentId);
          return {
            ...n,
            parentId: undefined,
            extent: undefined,
            zIndex: undefined,
            position: parent
              ? { x: parent.position.x + n.position.x, y: parent.position.y + n.position.y }
              : n.position,
          };
        }
        return n;
      })
      .filter(Boolean) as Node<WorkspaceNodeData>[];
    set({ nodes: nodesToKeep });
  },

  toggleCollapse: (id) => {
    get().pushHistory();
    const node = get().nodes.find((n) => n.id === id);
    if (!node || node.data.nodeType === 'group') return;
    const collapsed = !node.data.collapsed;
    set({
      nodes: get().nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              style: collapsed
                ? { width: n.style?.width || n.data.width, height: 48 }
                : { width: n.style?.width || n.data.width, height: n.data.height },
              data: { ...n.data, collapsed },
            }
          : n
      ),
    });
  },

  resizeNode: (id, opts) => {
    get().pushHistory();
    set({
      nodes: get().nodes.map((n) => {
        if (n.id !== id) return n;
        const updates: Partial<Node<WorkspaceNodeData>> = {
          style: { width: opts.width, height: opts.height },
          data: { ...n.data, width: opts.width, height: opts.height },
        };
        if (opts.x !== undefined || opts.y !== undefined) {
          updates.position = {
            x: opts.x ?? n.position.x,
            y: opts.y ?? n.position.y,
          };
        }
        return { ...n, ...updates };
      }),
    });
  },

  duplicateNode: (id) => {
    get().pushHistory();
    const node = get().nodes.find((n) => n.id === id);
    if (!node) return;
    const clone = cloneNodeForPaste(node);
    clone.position = { x: node.position.x + 40, y: node.position.y + 40 };
    clone.selected = true;
    set({
      nodes: [
        ...get().nodes.map((n) => ({ ...n, selected: false })),
        clone,
      ],
    });
  },

  // ─── Copy / Paste ───

  copySelectedNodes: () => {
    const nodes = get().nodes;
    const selected = nodes.filter((n) => n.selected && n.data.nodeType !== 'group');
    if (selected.length === 0) return;
    const toCopy = selected.map((n) => {
      if (n.parentId) {
        const parent = nodes.find((p) => p.id === n.parentId);
        return {
          ...n,
          parentId: undefined,
          extent: undefined,
          zIndex: undefined,
          position: parent
            ? { x: parent.position.x + n.position.x, y: parent.position.y + n.position.y }
            : { ...n.position },
        };
      }
      return { ...n };
    });
    set({ copiedNodes: toCopy });
  },

  pasteNodes: (flowPos: XYPosition) => {
    get().pushHistory();
    const copied = get().copiedNodes;
    if (!copied || copied.length === 0) return;
    let cx = 0, cy = 0;
    for (const n of copied) {
      const w = (n.style?.width as number) || n.data.width || 300;
      const h = (n.style?.height as number) || n.data.height || 200;
      cx += n.position.x + w / 2;
      cy += n.position.y + h / 2;
    }
    cx /= copied.length;
    cy /= copied.length;
    const dx = flowPos.x - cx;
    const dy = flowPos.y - cy;
    const newNodes = copied.map((n) => {
      const cloned = cloneNodeForPaste(n);
      cloned.position = { x: n.position.x + dx, y: n.position.y + dy };
      return cloned;
    });
    const updatedExisting = get().nodes.map((n) => ({ ...n, selected: false }));
    set({ nodes: [...updatedExisting, ...newNodes.map((n) => ({ ...n, selected: true }))] });
  },

  // ─── Node Lock ───

  toggleNodeLock: (nodeIds) => {
    get().pushHistory();
    set({
      nodes: get().nodes.map((n) =>
        nodeIds.includes(n.id) ? { ...n, data: { ...n.data, locked: !n.data.locked } } : n
      ),
    });
  },

  // ─── Node Color ───

  setNodeHeaderColor: (nodeIds, color) => {
    get().pushHistory();
    set({
      nodes: get().nodes.map((n) =>
        nodeIds.includes(n.id) ? { ...n, data: { ...n.data, headerColor: color } } : n
      ),
    });
  },

  // ─── Group ───

  groupAroundNodes: (nodeIds) => {
    if (nodeIds.length === 0) return;
    get().pushHistory();
    const nodes = get().nodes;
    const selectedNodes = nodes.filter((n) => nodeIds.includes(n.id));
    if (selectedNodes.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of selectedNodes) {
      const w = (n.style?.width as number) || n.data.width || 300;
      const h = (n.style?.height as number) || n.data.height || 200;
      if (n.position.x < minX) minX = n.position.x;
      if (n.position.y < minY) minY = n.position.y;
      if (n.position.x + w > maxX) maxX = n.position.x + w;
      if (n.position.y + h > maxY) maxY = n.position.y + h;
    }

    const padding = 40;
    const headerH = 40;
    const groupId = uuid();
    const groupX = minX - padding;
    const groupY = minY - headerH - 10;
    const groupW = maxX - minX + padding * 2;
    const groupH = maxY - minY + headerH + padding + 10;

    const groupNode: Node<WorkspaceNodeData> = {
      id: groupId,
      type: 'group',
      position: { x: groupX, y: groupY },
      style: { width: groupW, height: groupH },
      zIndex: 0,
      data: {
        nodeType: 'group',
        title: 'Group',
        content: '',
        richBlocks: [],
        collapsed: false,
        width: groupW,
        height: groupH,
        activeBlockId: null,
      },
    };

    const updatedNodes = nodes.map((n) => {
      if (!nodeIds.includes(n.id)) return n;
      // Group is a PURELY VISUAL container (ComfyUI-style frame).
      // NO parentId — children are independent nodes that just happen to be
      // visually inside the group. Dragging the group moves ONLY the group;
      // dragging a child moves ONLY that child. This matches ComfyUI frames
      // and avoids: parent-child position recalc on every drag step (choppy),
      // children permanently bound to group, "illusion of canvas moving".
      return {
        ...n,
        zIndex: 1,
      };
    });

    // No parentId → no parent-child order requirement, but keep group first
    // for consistent z-stacking (group renders behind its visual children).
    set({ nodes: [groupNode, ...updatedNodes] });
  },

  addNodeToGroup: (nodeId, groupId) => {
    // No-op now: groups are purely visual. Kept for API compatibility.
    // Nodes become "in" a group simply by being visually positioned inside it.
    return;
  },

  // ─── Rich Text ───

  addRichBlock: (nodeId, afterBlockId) => {
    get().pushHistory();
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const newBlock: RichBlock = { id: uuid(), type: 'paragraph', content: '', align: 'left' };
    const blocks = [...node.data.richBlocks];
    if (afterBlockId) {
      const idx = blocks.findIndex((b) => b.id === afterBlockId);
      blocks.splice(idx + 1, 0, newBlock);
    } else {
      blocks.push(newBlock);
    }
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, richBlocks: blocks, activeBlockId: newBlock.id } } : n
      ),
    });
  },

  updateRichBlock: (nodeId, blockId, updates) => {
    get().pushHistory();
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, richBlocks: n.data.richBlocks.map((b) => (b.id === blockId ? { ...b, ...updates } : b)) } }
          : n
      ),
    });
  },

  removeRichBlock: (nodeId, blockId) => {
    get().pushHistory();
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node || node.data.richBlocks.length <= 1) return;
    const blocks = node.data.richBlocks.filter((b) => b.id !== blockId);
    const idx = node.data.richBlocks.findIndex((b) => b.id === blockId);
    const prevBlock = blocks[Math.max(0, idx - 1)];
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, richBlocks: blocks, activeBlockId: prevBlock?.id || null } } : n
      ),
    });
  },

  setActiveBlock: (nodeId, blockId) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, activeBlockId: blockId } } : n
      ),
    });
  },

  changeBlockType: (nodeId, type) => {
    get().pushHistory();
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const blockId = node.data.activeBlockId || node.data.richBlocks[0]?.id;
    if (!blockId) return;
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, activeBlockId: blockId, richBlocks: n.data.richBlocks.map((b) => (b.id === blockId ? { ...b, type } : b)) } }
          : n
      ),
    });
  },

  changeBlockAlign: (nodeId, align) => {
    get().pushHistory();
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const blockId = node.data.activeBlockId || node.data.richBlocks[0]?.id;
    if (!blockId) return;
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, activeBlockId: blockId, richBlocks: n.data.richBlocks.map((b) => (b.id === blockId ? { ...b, align } : b)) } }
          : n
      ),
    });
  },

  changeBlockColor: (nodeId, color) => {
    get().pushHistory();
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const blockId = node.data.activeBlockId || node.data.richBlocks[0]?.id;
    if (!blockId) return;
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, activeBlockId: blockId, richBlocks: n.data.richBlocks.map((b) => (b.id === blockId ? { ...b, color } : b)) } }
          : n
      ),
    });
  },

  toggleBlockHighlight: (nodeId) => {
    get().pushHistory();
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const blockId = node.data.activeBlockId || node.data.richBlocks[0]?.id;
    if (!blockId) return;
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, activeBlockId: blockId, richBlocks: n.data.richBlocks.map((b) => (b.id === blockId ? { ...b, highlighted: !b.highlighted } : b)) } }
          : n
      ),
    });
  },

  // ─── Canvas Settings ───

  updateSettings: (updates) => {
    set({ settings: { ...get().settings, ...updates } });
    if (settingsSaveTimeout) clearTimeout(settingsSaveTimeout);
    settingsSaveTimeout = setTimeout(() => {
      get().save();
    }, 500);
  },

  togglePrivacyMode: () => {
    set({ privacyMode: !get().privacyMode });
  },

  toggleShortcuts: () => {
    set({ showShortcuts: !get().showShortcuts });
  },

  // ─── Persistence ───

  save: async (viewport) => {
    set({ saveStatus: 'saving' });
    try {
      const { nodes, edges, settings } = get();
      const state: CanvasState = { nodes, edges, viewport, settings, savedAt: new Date().toISOString() };
      await fetch('/api/canvas/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      set({ saveStatus: 'saved' });
      setTimeout(() => set({ saveStatus: 'idle' }), 2000);
    } catch {
      set({ saveStatus: 'error' });
    }
  },

  load: async () => {
    try {
      const res = await fetch('/api/canvas/load');
      if (!res.ok) return null;
      const state: CanvasState = await res.json();
      if (state.nodes && state.nodes.length > 0) {
        // Ensure parents come before children in the array (React Flow requirement).
        // Legacy state files may have children before parents, which causes
        // "Parent node not found" warnings and children to disappear on render.
        const sorted = sortNodesByParentOrder(state.nodes);
        set({ nodes: sorted, edges: state.edges || [], settings: { ...DEFAULT_SETTINGS, ...state.settings } });
      } else if (state.settings) {
        set({ settings: { ...DEFAULT_SETTINGS, ...state.settings } });
      }
      return state;
    } catch {
      return null;
    }
  },

  backup: async (viewport) => {
    try {
      const { nodes, edges, settings } = get();
      const state: CanvasState = { nodes, edges, viewport, settings, savedAt: new Date().toISOString() };
      await fetch('/api/canvas/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
    } catch {
      // silent
    }
  },

  initAutoSave: () => {
    let timeout: ReturnType<typeof setTimeout>;
    let backupInterval: ReturnType<typeof setInterval>;
    const debouncedSave = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => get().save(), 2000);
    };
    const unsub = useCanvasStore.subscribe((state, prev) => {
      if (
        state.nodes !== prev.nodes ||
        state.edges !== prev.edges ||
        state.settings !== prev.settings
      ) {
        debouncedSave();
      }
    });
    backupInterval = setInterval(() => get().backup(), 5 * 60 * 1000);
    return () => {
      unsub();
      clearTimeout(timeout);
      clearInterval(backupInterval);
    };
  },
}));