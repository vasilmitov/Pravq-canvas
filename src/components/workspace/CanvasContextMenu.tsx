'use client';

import { memo, useCallback, useEffect, useRef } from 'react';
import { FileText, AlignLeft, Heading, FolderPlus, Trash2, Palette, KeyRound, ChevronsUpDown, Tag, Image as ImageIcon, Search } from 'lucide-react';
import type { XYPosition } from '@xyflow/react';
import { useCanvasStore } from '@/store/useCanvasStore';
import { cn } from '@/lib/utils';

const NODE_COLOR_PRESETS = [
  { color: undefined, label: 'Default', bg: '#1a1a1a', border: '#333' },
  { color: '#c9a55c', label: 'Warm Sand', bg: '#c9a55c' },
  { color: '#c49a9a', label: 'Soft Rose', bg: '#c49a9a' },
  { color: '#8ea8c4', label: 'Dusty Blue', bg: '#8ea8c4' },
  { color: '#8fc49a', label: 'Sage Green', bg: '#8fc49a' },
  { color: '#a48ec4', label: 'Muted Purple', bg: '#a48ec4' },
  { color: '#c4a88e', label: 'Peach', bg: '#c4a88e' },
];

interface CanvasContextMenuProps {
  screenPos: XYPosition;
  flowPos: XYPosition;
  targetNodeIds?: string[];
  onClose: () => void;
}

const CanvasContextMenu = memo(function CanvasContextMenu({
  screenPos,
  flowPos,
  targetNodeIds,
  onClose,
}: CanvasContextMenuProps) {
  const addNode = useCanvasStore((s) => s.addNode);
  const groupAroundNodes = useCanvasStore((s) => s.groupAroundNodes);
  const removeSelectedNodes = useCanvasStore((s) => s.removeSelectedNodes);
  const setNodeHeaderColor = useCanvasStore((s) => s.setNodeHeaderColor);
  const toggleNodeLock = useCanvasStore((s) => s.toggleNodeLock);
  const toggleCollapse = useCanvasStore((s) => s.toggleCollapse);
  const menuRef = useRef<HTMLDivElement>(null);

  const isNodeMenu = targetNodeIds && targetNodeIds.length > 0;
  const multipleNodes = targetNodeIds && targetNodeIds.length > 1;

  const nodes = useCanvasStore((s) => s.nodes);
  const firstTargetNode = targetNodeIds?.[0] ? nodes.find((n) => n.id === targetNodeIds[0]) : null;
  const currentColor = firstTargetNode?.data.headerColor;
  const isLocked = firstTargetNode?.data.locked;
  const isCollapsed = firstTargetNode?.data.collapsed;
  const isGroup = firstTargetNode?.data.nodeType === 'group';
  const isLabel = firstTargetNode?.data.nodeType === 'label';

  useEffect(() => {
    const handleClick = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose(); };
    const handleContext = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) { e.preventDefault(); onClose(); } };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick, true);
    document.addEventListener('contextmenu', handleContext, true);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handleClick, true); document.removeEventListener('contextmenu', handleContext, true); document.removeEventListener('keydown', handleKey); };
  }, [onClose]);

  const handleAddNode = useCallback((type: 'text' | 'markdown' | 'richtext' | 'label' | 'media' | 'search') => { addNode(type, flowPos); onClose(); }, [flowPos, addNode, onClose]);
  const handleGroup = useCallback(() => { if (targetNodeIds && targetNodeIds.length > 0) groupAroundNodes(targetNodeIds); onClose(); }, [targetNodeIds, groupAroundNodes, onClose]);
  const handleDelete = useCallback(() => { if (targetNodeIds && targetNodeIds.length > 0) removeSelectedNodes(targetNodeIds); onClose(); }, [targetNodeIds, removeSelectedNodes, onClose]);
  const handleColorChange = useCallback((color: string | undefined) => {
    if (targetNodeIds && targetNodeIds.length > 0) setNodeHeaderColor(targetNodeIds, color);
    onClose();
  }, [targetNodeIds, setNodeHeaderColor, onClose]);
  const handleLock = useCallback(() => {
    if (targetNodeIds && targetNodeIds.length > 0) toggleNodeLock(targetNodeIds);
    onClose();
  }, [targetNodeIds, toggleNodeLock, onClose]);
  const handleCollapse = useCallback(() => {
    if (targetNodeIds && targetNodeIds.length > 0) {
      targetNodeIds.forEach((id) => toggleCollapse(id));
    }
    onClose();
  }, [targetNodeIds, toggleCollapse, onClose]);

  return (
    <div ref={menuRef} className="canvas-context-menu" style={{ left: screenPos.x, top: screenPos.y }}>
      {!isNodeMenu && (
        <>
          <button className="canvas-context-menu__item" onClick={() => handleAddNode('text')}><FileText size={15} /><span>Text Node</span></button>
          <button className="canvas-context-menu__item" onClick={() => handleAddNode('markdown')}><Heading size={15} /><span>Markdown Node</span></button>
          <button className="canvas-context-menu__item" onClick={() => handleAddNode('richtext')}><AlignLeft size={15} /><span>Rich Text Node</span></button>
          <button className="canvas-context-menu__item" onClick={() => handleAddNode('label')}><Tag size={15} /><span>Label</span></button>
          <button className="canvas-context-menu__item" onClick={() => handleAddNode('media')}><ImageIcon size={15} /><span>Media Node</span></button>
          <button className="canvas-context-menu__item" onClick={() => handleAddNode('search')}><Search size={15} /><span>Search Bar</span></button>
        </>
      )}
      {isNodeMenu && (
        <>
          <button
            className={cn('canvas-context-menu__item', isLocked && 'canvas-context-menu__item--active')}
            onClick={handleLock}
          >
            <KeyRound size={15} />
            <span>{isLocked ? 'Unlock' : 'Lock'}</span>
          </button>
          {!isGroup && !isLabel && (
            <button className="canvas-context-menu__item" onClick={handleCollapse}>
              <ChevronsUpDown size={15} />
              <span>{isCollapsed ? 'Expand Node' : 'Collapse Node'}</span>
            </button>
          )}
          <div className="canvas-context-menu__separator" />
          <button className="canvas-context-menu__item canvas-context-menu__item--danger" onClick={handleDelete}><Trash2 size={15} /><span>Delete{multipleNodes ? ` (${targetNodeIds.length})` : ''}</span></button>
          {multipleNodes && (
            <button className="canvas-context-menu__item" onClick={handleGroup}><FolderPlus size={15} /><span>Group Selection</span></button>
          )}
          <div className="canvas-context-menu__separator" />
          <div className="canvas-context-menu__color-section">
            <div className="canvas-context-menu__color-header"><Palette size={12} /><span>Color</span></div>
            <div className="canvas-context-menu__color-swatches">
              {NODE_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  className={cn('canvas-context-menu__color-swatch', (currentColor === preset.color || (!currentColor && !preset.color)) && 'canvas-context-menu__color-swatch--active')}
                  style={{ backgroundColor: preset.bg, borderColor: preset.border || 'transparent' }}
                  onClick={() => handleColorChange(preset.color)}
                  title={preset.label}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

export default CanvasContextMenu;