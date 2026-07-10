'use client';

import { memo, useCallback, useRef, useState } from 'react';
import {
  type NodeProps,
  type Node,
  Handle,
  Position,
  NodeResizer,
} from '@xyflow/react';
import { Lock, Unlock } from 'lucide-react';
import { useCanvasStore } from '@/store/useCanvasStore';
import type { WorkspaceNodeData } from '@/types/canvas';
import { cn } from '@/lib/utils';

/**
 * GroupNode — a container that other nodes can live inside.
 *
 * Architecture (rewritten):
 * - The group body IS clickable (no `pointer-events: none`). Clicking empty
 *   space inside the group selects the group. Child nodes sit on top and are
 *   interacted with directly.
 * - Uses React Flow's parent/child system: children carry `parentId` +
 *   `extent: 'parent'` + `expandParent: true`, so the group grows when a
 *   child is dragged beyond its bounds instead of "jumping" the child back.
 * - `<NodeResizer>` for resize (only when selected & unlocked), consistent
 *   with regular nodes.
 * - Connection handles at left/right edges with `nodrag`.
 * - z-index is managed by the store (groups render behind regular nodes).
 */
function GroupNodeComponent({
  id,
  data,
  selected,
}: NodeProps<Node<WorkspaceNodeData>>) {
  const toggleNodeLock = useCanvasStore((s) => s.toggleNodeLock);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const showConnections = useCanvasStore((s) => s.settings.showConnections);
  const locked = !!data.locked;

  const handleLockToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      toggleNodeLock([id]);
    },
    [id, toggleNodeLock]
  );

  const bgColor = data.headerColor
    ? `${data.headerColor}15`
    : 'rgba(201, 165, 92, 0.03)';

  return (
    <div
      className={cn(
        'group-node',
        selected && 'group-node--selected',
        locked && 'group-node--locked',
        locked && 'nodrag'
      )}
      style={
        {
          '--group-bg': bgColor,
          ...(selected && data.headerColor
            ? { borderColor: data.headerColor }
            : {}),
        } as React.CSSProperties
      }
    >
      {selected && !locked && (
        <NodeResizer
          nodeId={id}
          minWidth={120}
          minHeight={80}
          isVisible={true}
          handleClassName="workspace-node__resize-handle"
          lineClassName="workspace-node__resize-line"
        />
      )}

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

      <div className="group-node__header">
        <div className="group-node__header-left">
          {locked && <Lock size={12} className="group-node__lock-icon" />}
          <EditableTitle id={id} value={data.title} disabled={locked} />
        </div>
        <div className="group-node__header-right nodrag">
          <button
            className="group-node__lock-btn"
            onClick={handleLockToggle}
            onPointerDown={(e) => e.stopPropagation()}
            title={locked ? 'Unlock Group' : 'Lock Group'}
          >
            {locked ? <Unlock size={13} /> : <Lock size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditableTitle({
  id,
  value,
  disabled,
}: {
  id: string;
  value: string;
  disabled: boolean;
}) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    if (disabled) return;
    setDraft(value);
    setEditing(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [value, disabled]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    updateNodeData(id, { title: draft.trim() || value });
  }, [draft, value, id, updateNodeData]);

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
        className="group-node__title-input--editing"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className="group-node__title-label"
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
    >
      {value}
    </span>
  );
}

export default memo(GroupNodeComponent);
