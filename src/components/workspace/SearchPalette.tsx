'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useCanvasStore } from '@/store/useCanvasStore';
import type { NodeType } from '@/types/canvas';

interface SearchPaletteProps {
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
}

const NODE_TYPE_COLORS: Record<NodeType, string> = {
  text: '#5b9bd5',
  markdown: '#5dba72',
  richtext: '#a87bd4',
  group: '#c9a55c',
  label: '#e0e0e0',
  media: '#e07b5b',
  search: '#5bc9c9',
};

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  text: 'Text',
  markdown: 'Markdown',
  richtext: 'Rich Text',
  group: 'Group',
  label: 'Label',
  media: 'Media',
  search: 'Search',
};

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="search-palette__highlight">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

function truncate(str: string, maxLen: number) {
  if (!str) return '';
  const cleaned = str.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen) + '…';
}

export default function SearchPalette({ onClose, onNavigate }: SearchPaletteProps) {
  const nodes = useCanvasStore((s) => s.nodes);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Auto-focus input on mount
  useEffect(() => {
    // Small delay to ensure the DOM is ready
    const timer = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  // Filter nodes by query
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return nodes.filter((n) => {
      const title = (n.data.title || '').toLowerCase();
      const content = (n.data.content || '').toLowerCase();
      return title.includes(q) || content.includes(q);
    });
  }, [nodes, query]);

  // Scroll active item into view
  useEffect(() => {
    if (results.length === 0) return;
    const container = resultsRef.current;
    if (!container) return;
    const activeEl = container.querySelector('[data-active="true"]') as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const handleSelect = useCallback(
    (nodeId: string) => {
      onNavigate(nodeId);
      onClose();
    },
    [onNavigate, onClose]
  );

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setActiveIndex(0);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + results.length) % results.length);
      } else if (e.key === 'Enter' && results.length > 0) {
        e.preventDefault();
        handleSelect(results[activeIndex].id);
      }
    },
    [results, activeIndex, handleSelect]
  );

  return (
    <div className="search-palette" onClick={(e) => e.stopPropagation()}>
      {/* Search input */}
      <div className="search-palette__input-wrap">
        <Search size={15} className="search-palette__input-icon" />
        <input
          ref={inputRef}
          className="search-palette__input"
          type="text"
          placeholder="Search nodes..."
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button className="search-palette__clear" onClick={() => { setQuery(''); setActiveIndex(0); }}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* Results */}
      <div className="search-palette__results" ref={resultsRef}>
        {query.trim() && results.length === 0 && (
          <div className="search-palette__empty">No nodes found</div>
        )}
        {results.map((node, idx) => {
          const color = NODE_TYPE_COLORS[node.data.nodeType];
          const label = NODE_TYPE_LABELS[node.data.nodeType];
          return (
            <button
              key={node.id}
              className={`search-palette__result${idx === activeIndex ? ' search-palette__result--active' : ''}`}
              data-active={idx === activeIndex}
              onClick={() => handleSelect(node.id)}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <span
                className="search-palette__badge"
                style={{ backgroundColor: color }}
                title={label}
              />
              <div className="search-palette__result-content">
                <div className="search-palette__result-title">
                  {highlightMatch(node.data.title || 'Untitled', query)}
                </div>
                {node.data.content && (
                  <div className="search-palette__result-preview">
                    {truncate(node.data.content, 80)}
                  </div>
                )}
              </div>
              <span className="search-palette__result-type">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Footer hint */}
      {results.length > 0 && (
        <div className="search-palette__footer">
          <span className="search-palette__footer-hint">
            <kbd>↑↓</kbd> navigate
          </span>
          <span className="search-palette__footer-hint">
            <kbd>↵</kbd> open
          </span>
          <span className="search-palette__footer-hint">
            <kbd>esc</kbd> close
          </span>
        </div>
      )}
    </div>
  );
}