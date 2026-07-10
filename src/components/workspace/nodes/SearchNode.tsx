'use client';

import { memo, useCallback, useState } from 'react';
import type { NodeProps, Node } from '@xyflow/react';
import { useCanvasStore } from '@/store/useCanvasStore';
import type { WorkspaceNodeData } from '@/types/canvas';
import { Search } from 'lucide-react';

function SearchNodeComponent({ id, data, selected }: NodeProps<Node<WorkspaceNodeData>>) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const locked = !!data.locked;
  const privacyMode = useCanvasStore((s) => s.privacyMode);
  const [query, setQuery] = useState(data.content || '');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!query.trim()) return;
      const q = encodeURIComponent(query.trim());
      window.open(`https://www.google.com/search?q=${q}`, '_blank');
    },
    [query]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      if (!locked) updateNodeData(id, { content: e.target.value });
    },
    [id, updateNodeData, locked]
  );

  return (
    <div
      className={`search-node${selected ? ' search-node--selected' : ''}${
        locked ? ' search-node--locked' : ''
      }`}
    >
      <form className="search-node__form" onSubmit={handleSubmit}>
        <Search size={14} className="search-node__icon" />
        <input
          className="search-node__input nodrag nowheel"
          type="text"
          value={privacyMode ? '' : query}
          placeholder={privacyMode ? 'Hidden (privacy mode)' : 'Search Google...'}
          onChange={handleChange}
          spellCheck={false}
          readOnly={locked || privacyMode}
          onPointerDown={(e) => e.stopPropagation()}
        />
        <button
          type="submit"
          className="search-node__btn nodrag"
          onPointerDown={(e) => e.stopPropagation()}
          title="Search"
        >
          Go
        </button>
      </form>
    </div>
  );
}

export default memo(SearchNodeComponent);
