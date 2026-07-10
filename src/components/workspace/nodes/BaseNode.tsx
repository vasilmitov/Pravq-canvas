'use client';

import { memo, type ReactNode, useCallback, useRef, useState } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { Lock, Copy } from 'lucide-react';
import type { WorkspaceNodeData } from '@/types/canvas';
import { useCanvasStore } from '@/store/useCanvasStore';
import { cn } from '@/lib/utils';

interface BaseNodeProps {
  id: string;
  data: WorkspaceNodeData;
  selected: boolean;
  children: ReactNode;
  headerExtra?: ReactNode;
}

/**
 * Editable in-place title. Single-click does nothing (lets the header drag
 * the node), double-click enters edit mode. Has `nodrag` so React Flow never
 * treats typing/selection as a node drag.
 */
function EditableTitle({
  value,
  onCommit,
  className,
  disabled,
}: {
  value: string;
  onCommit: (val: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    if (disabled) return;
    setDraft(value);
    setEditing(true);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
    });
  }, [value, disabled]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    onCommit(trimmed || value);
  }, [draft, value, onCommit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setEditing(false);
        setDraft(value);
      }
    },
    [commitEdit, value]
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={cn(className, 'workspace-node__title-input--editing')}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        readOnly={disabled}
      />
    );
  }

  return (
    <span
      className={cn(className, disabled && 'workspace-node__title-label--locked')}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
    >
      {value}
    </span>
  );
}

/**
 * BaseNode — the shared shell for text / markdown / richtext nodes.
 *
 * Architecture (rewritten):
 * - Uses React Flow's built-in `<NodeResizer>` for 8-direction resize.
 *   No custom pointer-event interception → no fighting with React Flow's drag.
 * - Connection handles use React Flow's `<Handle>` at Left/Right edges,
 *   vertically centered on the header. They carry `nodrag` so dragging the
 *   header never collides with handle interactions.
 * - The header is the drag handle (React Flow default). No edge-proximity
 *   detection, no dead zones, no "jumping".
 * - Collapse hides the content via CSS and shrinks the node height; resize
 *   controls are hidden while collapsed.
 */
const BaseNode = memo(function BaseNode({
  id,
  data,
  selected,
  children,
  headerExtra,
}: BaseNodeProps) {
  const toggleCollapse = useCanvasStore((s) => s.toggleCollapse);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const duplicateNode = useCanvasStore((s) => s.duplicateNode);
  const privacyMode = useCanvasStore((s) => s.privacyMode);
  const showConnections = useCanvasStore((s) => s.settings.showConnections);

  const locked = !!data.locked;
  const collapsed = !!data.collapsed;
  const canResize = selected && !locked && !collapsed;

  const handleTitleCommit = useCallback(
    (title: string) => {
      if (locked) return;
      updateNodeData(id, { title });
    },
    [id, updateNodeData, locked]
  );

  const handleDuplicate = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      duplicateNode(id);
    },
    [id, duplicateNode]
  );

  const handleHeaderDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't toggle collapse when interacting with controls in the header.
      const target = e.target as HTMLElement;
      if (
        target.closest('button, input, textarea, .workspace-node__header-right')
      ) {
        return;
      }
      e.stopPropagation();
      toggleCollapse(id);
    },
    [id, toggleCollapse]
  );

  const headerStyle = data.headerColor
    ? {
        background: `${data.headerColor}25`,
        borderBottom: `1px solid ${data.headerColor}40`,
      }
    : undefined;

  return (
    <div
      className={cn(
        'workspace-node',
        selected && 'workspace-node--selected',
        locked && 'workspace-node--locked',
        locked && 'nodrag',
        privacyMode && 'workspace-node--privacy'
      )}
      style={
        selected && data.headerColor
          ? { borderColor: data.headerColor }
          : undefined
      }
    >
      {/* Resize controls — only when selected, unlocked, expanded. */}
      {canResize && (
        <NodeResizer
          nodeId={id}
          minWidth={220}
          minHeight={80}
          isVisible={true}
          handleClassName="workspace-node__resize-handle"
          lineClassName="workspace-node__resize-line"
        />
      )}

      {/* Connection handles — at left/right edges, centered on header.
          `nodrag` prevents them from initiating a node drag. */}
      {showConnections && (
        <Handle
          type="target"
          position={Position.Left}
          id="target"
          className="connection-dot connection-dot--left nodrag"
        />
      )}
      {showConnections && (
        <Handle
          type="source"
          position={Position.Right}
          id="source"
          className="connection-dot connection-dot--right nodrag"
        />
      )}

      <div
        className="workspace-node__header"
        onDoubleClick={handleHeaderDoubleClick}
        style={headerStyle}
      >
        <div className="workspace-node__header-left">
          {locked && <Lock size={13} className="workspace-node__lock-icon" />}
          <EditableTitle
            value={data.title}
            onCommit={handleTitleCommit}
            className="workspace-node__title-label"
            disabled={locked}
          />
        </div>
        <div className="workspace-node__header-right nodrag">
          {locked ? null : (
            <>
              {headerExtra}
              <button
                className="workspace-node__icon-btn"
                onClick={handleDuplicate}
                onPointerDown={(e) => e.stopPropagation()}
                title="Duplicate node"
              >
                <Copy size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {!collapsed && (
        <div
          className={cn(
            'workspace-node__content nodrag nowheel',
            locked && 'workspace-node__content--locked'
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
});

export type BaseNodeType = import('@xyflow/react').Node<WorkspaceNodeData>;
export type { NodeProps };
export default BaseNode;
