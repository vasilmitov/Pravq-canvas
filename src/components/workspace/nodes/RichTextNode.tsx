'use client';

import { memo, useCallback, useRef, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Bold, ListOrdered, Plus, Trash2, ChevronDown, Highlighter, Palette } from 'lucide-react';
import type { NodeProps, Node } from '@xyflow/react';
import BaseNode from './BaseNode';
import { useCanvasStore } from '@/store/useCanvasStore';
import type { WorkspaceNodeData, RichBlockType } from '@/types/canvas';
import { cn } from '@/lib/utils';

const COLOR_SWATCHES = [
  { color: undefined, label: 'Default', bg: '#555' },
  { color: '#c9a55c', label: 'Gold', bg: '#c9a55c' },
  { color: '#e8e0d0', label: 'Warm Light', bg: '#e8e0d0' },
];

/** Wrap selected text in a textarea with prefix/suffix markers */
function wrapSelection(ta: HTMLTextAreaElement, prefix: string, suffix: string) {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const val = ta.value;
  const selected = val.substring(start, end);
  const before = val.substring(0, start);
  const after = val.substring(end);
  const newVal = before + prefix + selected + suffix + after;

  // Use a native input setter to trigger React's onChange
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  )!.set!;
  nativeInputValueSetter.call(ta, newVal);
  ta.dispatchEvent(new Event('input', { bubbles: true }));

  // Restore cursor
  const newCursorPos = start + prefix.length + selected.length + suffix.length;
  ta.setSelectionRange(newCursorPos, newCursorPos);
  ta.focus();
}

function RichTextNodeComponent({ id, data, selected }: NodeProps<Node<WorkspaceNodeData>>) {
  const locked = !!data.locked;

  const {
    addRichBlock,
    updateRichBlock,
    removeRichBlock,
    setActiveBlock,
    changeBlockType,
    changeBlockColor,
    toggleBlockHighlight,
  } = useCanvasStore();

  const contentRef = useRef<HTMLDivElement>(null);
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const [listDropdownOpen, setListDropdownOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  const activeBlock = data.richBlocks.find((b) => b.id === data.activeBlockId);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setListDropdownOpen(false);
      }
      if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
        setPaletteOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleBlockFocus = useCallback(
    (blockId: string) => {
      setActiveBlock(id, blockId);
    },
    [id, setActiveBlock]
  );

  const handleBlockChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>, blockId: string) => {
      if (locked) return;
      updateRichBlock(id, blockId, { content: e.target.value });
      // Auto-expand
      const ta = e.target;
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    },
    [id, updateRichBlock, locked]
  );

  const handleBlockKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>, blockId: string) => {
      if (locked) return;

      const ta = e.target as HTMLTextAreaElement;

      // Ctrl+B → bold
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        wrapSelection(ta, '**', '**');
        return;
      }
      // Ctrl+I → italic
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        wrapSelection(ta, '*', '*');
        return;
      }
      // Ctrl+U → underline
      if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
        e.preventDefault();
        wrapSelection(ta, '__', '__');
        return;
      }

      // Enter = new line within the block (default textarea behavior)
      // Ctrl+Enter / Cmd+Enter = new block after current
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        addRichBlock(id, blockId);
      }
      // Backspace at start of empty block removes it
      if (e.key === 'Backspace' && ta.value === '') {
        const blocks = data.richBlocks;
        const idx = blocks.findIndex((b) => b.id === blockId);
        if (idx > 0) {
          e.preventDefault();
          removeRichBlock(id, blockId);
          setActiveBlock(id, blocks[idx - 1].id);
          setTimeout(() => {
            const prevTa = textareaRefs.current.get(blocks[idx - 1].id);
            if (prevTa) {
              prevTa.focus();
              prevTa.selectionStart = prevTa.selectionEnd = prevTa.value.length;
            }
          }, 0);
        }
      }
    },
    [id, data.richBlocks, addRichBlock, removeRichBlock, setActiveBlock, locked]
  );

  const handleTypeChange = useCallback(
    (type: RichBlockType) => {
      // Toggle: if the block is already this type, reset to paragraph.
      // This lets users return a heading/list back to normal text by clicking again.
      const currentType = data.richBlocks.find((b) => b.id === data.activeBlockId)?.type;
      changeBlockType(id, currentType === type ? 'paragraph' : type);
      setListDropdownOpen(false);
    },
    [id, changeBlockType, data.richBlocks, data.activeBlockId]
  );

  const handleColorChange = useCallback(
    (color: string | undefined) => {
      changeBlockColor(id, color);
      setPaletteOpen(false);
    },
    [id, changeBlockColor]
  );

  const handleAddBlock = useCallback(
    () => {
      addRichBlock(id, activeBlock?.id);
    },
    [id, addRichBlock, activeBlock?.id]
  );

  const handleDeleteBlock = useCallback(() => {
    if (!activeBlock || data.richBlocks.length <= 1) return;
    const idx = data.richBlocks.findIndex((b) => b.id === activeBlock.id);
    removeRichBlock(id, activeBlock.id);
    const prevBlock = data.richBlocks[Math.max(0, idx - 1)];
    if (prevBlock && prevBlock.id !== activeBlock.id) {
      setActiveBlock(id, prevBlock.id);
      setTimeout(() => {
        const ta = textareaRefs.current.get(prevBlock.id);
        if (ta) ta.focus();
      }, 0);
    }
  }, [id, activeBlock, data.richBlocks, removeRichBlock, setActiveBlock]);

  const handleHighlight = useCallback(() => {
    toggleBlockHighlight(id);
    setListDropdownOpen(false);
  }, [id, toggleBlockHighlight]);

  // Auto-expand all textareas on mount and when blocks change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.querySelectorAll('textarea').forEach((ta) => {
          ta.style.height = 'auto';
          ta.style.height = ta.scrollHeight + 'px';
        });
      }
    }, 10);
    return () => clearTimeout(timer);
  }, [data.richBlocks]);

  if (locked) {
    return (
      <BaseNode id={id} data={data} selected={!!selected}>
        <div className="richtext-content" ref={contentRef}>
          {data.richBlocks.map((block, idx) => (
            <div
              key={block.id}
              className={cn(
                'richtext-block',
                block.type === 'h1' && 'richtext-block--h1',
                block.type === 'h2' && 'richtext-block--h2',
                block.type === 'ordered-list' && 'richtext-block--ol',
                block.type === 'unordered-list' && 'richtext-block--ul',
                block.highlighted && 'richtext-block--highlighted',
              )}
            >
              {(block.type === 'ordered-list' ||
                block.type === 'unordered-list') && (
                <span className="richtext-block__marker">
                  {block.type === 'ordered-list' ? `${idx + 1}.` : '\u2022'}
                </span>
              )}
              <textarea
                ref={(el) => {
                  if (el) textareaRefs.current.set(block.id, el);
                }}
                className="richtext-block__input"
                value={block.content}
                readOnly
                placeholder={
                  block.type === 'h1'
                    ? 'Heading 1'
                    : block.type === 'h2'
                      ? 'Heading 2'
                      : 'Type here...'
                }
                rows={1}
                spellCheck={false}
                style={
                  block.color
                    ? { color: block.color }
                    : undefined
                }
              />
            </div>
          ))}
        </div>
      </BaseNode>
    );
  }

  const toolbar = (
    <div className="richtext-toolbar">
      {/* H1 */}
      <button
        className={cn(
          'richtext-toolbar__btn',
          activeBlock?.type === 'h1' && 'richtext-toolbar__btn--active'
        )}
        onClick={(e) => {
          e.stopPropagation();
          handleTypeChange('h1');
        }}
        title="Heading 1"
      >
        <Bold size={13} />
        <span className="text-[10px] font-bold">1</span>
      </button>
      {/* H2 */}
      <button
        className={cn(
          'richtext-toolbar__btn',
          activeBlock?.type === 'h2' && 'richtext-toolbar__btn--active'
        )}
        onClick={(e) => {
          e.stopPropagation();
          handleTypeChange('h2');
        }}
        title="Heading 2"
      >
        <Bold size={13} />
        <span className="text-[10px] font-bold">2</span>
      </button>
      <div className="richtext-toolbar__sep" />
      {/* List dropdown */}
      <div className="richtext-dropdown" ref={dropdownRef}>
        <button
          className={cn(
            'richtext-toolbar__btn richtext-toolbar__btn--wide',
            (activeBlock?.type === 'ordered-list' || activeBlock?.type === 'unordered-list' || activeBlock?.highlighted) && 'richtext-toolbar__btn--active'
          )}
          onClick={(e) => {
            e.stopPropagation();
            setListDropdownOpen(!listDropdownOpen);
            setPaletteOpen(false);
          }}
          title="Lists & formatting"
        >
          <ListOrdered size={13} />
          <ChevronDown size={10} />
        </button>
        {listDropdownOpen && (
          <div className="richtext-dropdown__menu">
            <button
              className={cn(
                'richtext-dropdown__item',
                (activeBlock?.type === 'paragraph' || !activeBlock?.type) && 'richtext-dropdown__item--active'
              )}
              onClick={(e) => {
                e.stopPropagation();
                handleTypeChange('paragraph');
              }}
            >
              <span className="text-[13px] font-semibold">P</span>
              <span>Paragraph (Normal)</span>
            </button>
            <div className="richtext-toolbar__sep richtext-toolbar__sep--horizontal" />
            <button
              className={cn(
                'richtext-dropdown__item',
                activeBlock?.type === 'ordered-list' && 'richtext-dropdown__item--active'
              )}
              onClick={(e) => {
                e.stopPropagation();
                handleTypeChange('ordered-list');
              }}
            >
              <ListOrdered size={13} />
              <span>Ordered List</span>
            </button>
            <button
              className={cn(
                'richtext-dropdown__item',
                activeBlock?.type === 'unordered-list' && 'richtext-dropdown__item--active'
              )}
              onClick={(e) => {
                e.stopPropagation();
                handleTypeChange('unordered-list');
              }}
            >
              <span className="text-[13px]">•</span>
              <span>Bullet List</span>
            </button>
            <div className="richtext-toolbar__sep richtext-toolbar__sep--horizontal" />
            <button
              className={cn(
                'richtext-dropdown__item',
                activeBlock?.highlighted && 'richtext-dropdown__item--active'
              )}
              onClick={(e) => {
                e.stopPropagation();
                handleHighlight();
              }}
            >
              <Highlighter size={13} />
              <span>Highlight</span>
            </button>
          </div>
        )}
      </div>
      <div className="richtext-toolbar__sep" />
      {/* Color swatches + palette */}
      {COLOR_SWATCHES.map((swatch) => (
        <button
          key={swatch.label}
          className={cn(
            'richtext-color-swatch',
            !swatch.color && !activeBlock?.color && 'richtext-color-swatch--active'
          )}
          style={{
            backgroundColor: swatch.bg,
          }}
          onClick={(e) => {
            e.stopPropagation();
            setPaletteOpen(false);
            handleColorChange(swatch.color);
          }}
          title={swatch.label}
        />
      ))}
      {/* Color palette button */}
      <div className="richtext-dropdown" ref={paletteRef}>
        <button
          className="richtext-color-swatch richtext-color-swatch--palette nodrag"
          onClick={(e) => {
            e.stopPropagation();
            setPaletteOpen(!paletteOpen);
            setListDropdownOpen(false);
          }}
          title="More colors"
        >
          <Palette size={10} />
        </button>
        {paletteOpen && (
          <div className="richtext-palette__popup">
            <input
              type="color"
              defaultValue={activeBlock?.color || '#c9a55c'}
              onChange={(e) => {
                handleColorChange(e.target.value);
              }}
              onClick={(e) => e.stopPropagation()}
              className="richtext-palette__input"
            />
            <div className="richtext-palette__presets">
              {['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#06b6d4'].map(
                (c) => (
                  <button
                    key={c}
                    className="richtext-color-swatch"
                    style={{ backgroundColor: c, width: 20, height: 20 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleColorChange(c);
                    }}
                    title={c}
                  />
                )
              )}
            </div>
          </div>
        )}
      </div>
      <div className="richtext-toolbar__sep" />
      <button
        className="richtext-toolbar__btn"
        onClick={(e) => {
          e.stopPropagation();
          handleAddBlock();
        }}
        title="Add Block (Ctrl+Enter)"
      >
        <Plus size={13} />
      </button>
      {activeBlock && activeBlock.content === '' && data.richBlocks.length > 1 && (
        <button
          className="richtext-toolbar__btn richtext-toolbar__btn--danger"
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteBlock();
          }}
          title="Delete Empty Block"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );

  return (
    <BaseNode id={id} data={data} selected={!!selected} headerExtra={toolbar}>
      <div className="richtext-content" ref={contentRef}>
        {data.richBlocks.map((block, idx) => (
          <div
            key={block.id}
            className={cn(
              'richtext-block',
              block.type === 'h1' && 'richtext-block--h1',
              block.type === 'h2' && 'richtext-block--h2',
              block.type === 'ordered-list' && 'richtext-block--ol',
              block.type === 'unordered-list' && 'richtext-block--ul',
              block.highlighted && 'richtext-block--highlighted',
              block.id === data.activeBlockId && 'richtext-block--active'
            )}
          >
            {(block.type === 'ordered-list' ||
              block.type === 'unordered-list') && (
              <span className="richtext-block__marker">
                {block.type === 'ordered-list' ? `${idx + 1}.` : '\u2022'}
              </span>
            )}
            <textarea
              ref={(el) => {
                if (el) textareaRefs.current.set(block.id, el);
              }}
              className="richtext-block__input"
              value={block.content}
              onChange={(e) => handleBlockChange(e, block.id)}
              onFocus={() => handleBlockFocus(block.id)}
              onKeyDown={(e) => handleBlockKeyDown(e, block.id)}
              placeholder={
                block.type === 'h1'
                  ? 'Heading 1'
                  : block.type === 'h2'
                    ? 'Heading 2'
                    : 'Type here...'
              }
              rows={1}
              spellCheck={false}
              style={
                block.color
                  ? { color: block.color }
                  : undefined
              }
            />
          </div>
        ))}
      </div>
    </BaseNode>
  );
}

export default memo(RichTextNodeComponent);