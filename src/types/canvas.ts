export type NodeType = 'markdown' | 'text' | 'richtext' | 'group' | 'label' | 'media' | 'search';

export type RichBlockType = 'h1' | 'h2' | 'paragraph' | 'ordered-list' | 'unordered-list';
export type TextAlign = 'left' | 'center' | 'right';

export interface RichBlock {
  id: string;
  type: RichBlockType;
  content: string;
  align: TextAlign;
  color?: string;
  highlighted?: boolean;
}

export interface WorkspaceNodeData {
  nodeType: NodeType;
  title: string;
  content: string;
  richBlocks: RichBlock[];
  collapsed: boolean;
  width: number;
  height: number;
  activeBlockId: string | null;
  headerColor?: string;
  locked?: boolean;
  // Label-specific
  labelColor?: string;
  labelFontSize?: number;
  // Media-specific
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'embed';
}

export type GridPattern = 'none' | 'dots' | 'lines' | 'cross';

export interface CanvasSettings {
  backgroundColor: string;
  gridPattern: GridPattern;
  gridOpacity: number;
  defaultViewport: { x: number; y: number; zoom: number } | null;
  showDefaultOnOpen: boolean;
  showConnections: boolean;
  showMinimap: boolean;
}

export interface CanvasState {
  nodes: import('@xyflow/react').Node<WorkspaceNodeData>[];
  edges: import('@xyflow/react').Edge[];
  viewport?: { x: number; y: number; zoom: number };
  settings?: CanvasSettings;
  savedAt?: string;
}