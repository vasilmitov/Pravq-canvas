'use client';

import { memo, useCallback } from 'react';
import type { NodeProps, Node } from '@xyflow/react';
import BaseNode from './BaseNode';
import { useCanvasStore } from '@/store/useCanvasStore';
import type { WorkspaceNodeData } from '@/types/canvas';

function MediaNodeComponent({ id, data, selected }: NodeProps<Node<WorkspaceNodeData>>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const locked = !!data.locked;
  const privacyMode = useCanvasStore((s) => s.privacyMode);

  const handleUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (locked) return;
      const url = e.target.value;
      let mediaType: 'image' | 'video' | 'embed' = 'image';
      if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)) mediaType = 'video';
      else if (/youtube\.com|youtu\.be|vimeo\.com/i.test(url)) mediaType = 'embed';
      updateNodeData(id, { mediaUrl: url, mediaType });
    },
    [id, updateNodeData, locked]
  );

  const url = data.mediaUrl || '';
  const mediaType = data.mediaType || 'image';

  return (
    <BaseNode id={id} data={data} selected={!!selected}>
      <div className="media-node">
        {url ? (
          <div className="media-node__preview">
            {privacyMode ? (
              <div className="media-node__hidden">Content hidden (privacy mode)</div>
            ) : mediaType === 'image' ? (
              <img
                src={url}
                alt={data.title}
                className="media-node__img"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : mediaType === 'video' ? (
              <video src={url} controls className="media-node__video" />
            ) : (
              <iframe
                src={url}
                className="media-node__iframe"
                title={data.title}
                allowFullScreen
              />
            )}
          </div>
        ) : (
          <div className="media-node__empty">Paste an image, video, or YouTube URL</div>
        )}
        {!locked && (
          <input
            className="media-node__url-input nodrag nowheel"
            value={url}
            onChange={handleUrlChange}
            placeholder="https://..."
            spellCheck={false}
            onPointerDown={(e) => e.stopPropagation()}
          />
        )}
      </div>
    </BaseNode>
  );
}

export default memo(MediaNodeComponent);
