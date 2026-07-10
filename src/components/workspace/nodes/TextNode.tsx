'use client';

import { memo, useCallback } from 'react';
import type { NodeProps, Node } from '@xyflow/react';
import BaseNode from './BaseNode';
import { useCanvasStore } from '@/store/useCanvasStore';
import type { WorkspaceNodeData } from '@/types/canvas';

function TextNodeComponent({ id, data, selected }: NodeProps<Node<WorkspaceNodeData>>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const locked = !!data.locked;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (locked) return;
      updateNodeData(id, { content: e.target.value });
    },
    [id, updateNodeData, locked]
  );

  return (
    <BaseNode id={id} data={data} selected={!!selected}>
      <textarea
        className="text-node__input"
        value={data.content}
        onChange={handleChange}
        placeholder="Write your notes here..."
        spellCheck={false}
        readOnly={locked}
      />
    </BaseNode>
  );
}

export default memo(TextNodeComponent);