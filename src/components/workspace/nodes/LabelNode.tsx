'use client';

import { memo, useCallback, useRef, useState } from 'react';
import { type NodeProps, type Node } from '@xyflow/react';
import { useCanvasStore } from '@/store/useCanvasStore';
import type { WorkspaceNodeData } from '@/types/canvas';

const SIZE_OPTIONS = [14, 18, 24, 32, 42, 56];

const COLOR_PRESETS = [
  '#c9a55c', '#c49a9a', '#8ea8c4', '#8fc49a', '#a48ec4',
  '#c4a88e', '#e0e0e0', '#888888', '#ffffff', '#ff6b6b',
];

/** Estimate rendered width of label text at a given font size. */
function estimateTextWidth(text: string, fontSize: number): number {
  // Rough estimate: ~0.6em per char average for uppercase + letter-spacing 0.08em
  return Math.ceil(text.length * fontSize * 0.68) + 32;
}

function LabelNodeComponent({ id, data, selected }: NodeProps<Node<WorkspaceNodeData>>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const resizeNode = useCanvasStore((s) => s.resizeNode);
  const locked = !!data.locked;
  const nodeRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const fontSize = data.labelFontSize || 24;
  const color = data.labelColor || '#c9a55c';

  const startEdit = useCallback(() => {
    if (locked) return;
    setDraft(data.title);
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [data.title, locked]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    const newTitle = trimmed || data.title;
    const newWidth = estimateTextWidth(newTitle, fontSize);
    updateNodeData(id, { title: newTitle });
    resizeNode(id, { width: newWidth, height: 48 });
  }, [draft, data.title, id, fontSize, updateNodeData, resizeNode]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
      if (e.key === 'Escape') { setEditing(false); setDraft(data.title); }
    },
    [commitEdit, data.title]
  );

  const cycleFontSize = useCallback(() => {
    if (locked) return;
    const currentIdx = SIZE_OPTIONS.indexOf(fontSize);
    const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % SIZE_OPTIONS.length : 0;
    updateNodeData(id, { labelFontSize: SIZE_OPTIONS[nextIdx] });
  }, [fontSize, id, updateNodeData, locked]);

  const cycleColor = useCallback(() => {
    if (locked) return;
    const currentIdx = COLOR_PRESETS.indexOf(color);
    const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % COLOR_PRESETS.length : 0;
    updateNodeData(id, { labelColor: COLOR_PRESETS[nextIdx] });
  }, [color, id, updateNodeData, locked]);

  const handleRootDoubleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (locked) return;
    startEdit();
  }, [locked, startEdit]);

  if (editing) {
    const inputWidth = Math.max(200, estimateTextWidth(draft, fontSize));
    return (
      <div
        ref={nodeRef}
        className="label-node label-node--editing nodrag"
        style={{ width: '100%', height: '100%' }}
      >
        <input
          ref={inputRef}
          className="label-node__input nodrag"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          style={{ fontSize, color, width: inputWidth }}
        />
      </div>
    );
  }

  return (
    <div
      ref={nodeRef}
      className="label-node"
      style={{ width: '100%', height: '100%' }}
      onDoubleClick={handleRootDoubleClick}
    >
      <span
        className="label-node__text"
        style={{ fontSize, color }}
      >
        {data.title}
      </span>
      {selected && !locked && (
        <div className="label-node__controls nodrag">
          <button
            className="label-node__ctrl-btn"
            onClick={(e) => { e.stopPropagation(); cycleFontSize(); }}
            title="Change font size"
          >
            {fontSize}px
          </button>
          <button
            className="label-node__ctrl-btn"
            onClick={(e) => { e.stopPropagation(); cycleColor(); }}
            title="Change color"
            style={{ color }}
          >
            ●
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(LabelNodeComponent);