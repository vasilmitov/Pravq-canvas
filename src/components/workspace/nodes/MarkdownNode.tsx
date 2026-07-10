'use client';

import { memo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import type { NodeProps, Node } from '@xyflow/react';
import BaseNode from './BaseNode';
import { useCanvasStore } from '@/store/useCanvasStore';
import type { WorkspaceNodeData } from '@/types/canvas';

function MarkdownNodeComponent({ id, data, selected }: NodeProps<Node<WorkspaceNodeData>>) {
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
      <div className="markdown-node">
        <textarea
          className="markdown-node__input nodrag"
          value={data.content}
          onChange={handleChange}
          placeholder="Write markdown here..."
          spellCheck={false}
          readOnly={locked}
        />
        {data.content && (
          <div className="markdown-node__preview">
            <ReactMarkdown>{data.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export default memo(MarkdownNodeComponent);