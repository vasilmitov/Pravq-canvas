'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useCanvasStore } from '@/store/useCanvasStore';
import type { GridPattern } from '@/types/canvas';
import { cn } from '@/lib/utils';

const BG_PRESETS = [
  { color: '#0a0a0a', label: 'Near Black' },
  { color: '#111118', label: 'Dark Navy' },
  { color: '#0d1117', label: 'GitHub Dark' },
  { color: '#1a1510', label: 'Warm Dark' },
  { color: '#101a10', label: 'Forest Dark' },
];

const GRID_OPTIONS: { value: GridPattern; label: string; icon: string }[] = [
  { value: 'none', label: 'None', icon: '○' },
  { value: 'dots', label: 'Dots', icon: '⋯' },
  { value: 'lines', label: 'Lines', icon: '╋' },
  { value: 'cross', label: 'Cross', icon: '✕' },
];

interface PersonalizationPanelProps {
  onClose: () => void;
  onSetDefaultPoint: () => void;
  hasDefaultPoint: boolean;
  onResetCanvas: () => void;
}

const PersonalizationPanel = memo(function PersonalizationPanel({
  onClose,
  onSetDefaultPoint,
  hasDefaultPoint,
  onResetCanvas,
}: PersonalizationPanelProps) {
  const settings = useCanvasStore((s) => s.settings);
  const updateSettings = useCanvasStore((s) => s.updateSettings);
  const panelRef = useRef<HTMLDivElement>(null);
  const [customColor, setCustomColor] = useState(settings.backgroundColor);
  const [resetConfirm, setResetConfirm] = useState(false);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // If clicked the Settings button, let the button's own onClick toggle the panel closed
      if (target.closest('[title="Personalization"]')) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handleClick); };
  }, [onClose]);

  const handleBgPreset = useCallback((color: string) => {
    updateSettings({ backgroundColor: color });
    setCustomColor(color);
    document.documentElement.style.setProperty('--canvas-bg', color);
  }, [updateSettings]);

  const handleCustomColor = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    setCustomColor(color);
    updateSettings({ backgroundColor: color });
    document.documentElement.style.setProperty('--canvas-bg', color);
  }, [updateSettings]);

  const handleGridChange = useCallback((pattern: GridPattern) => {
    updateSettings({ gridPattern: pattern });
  }, [updateSettings]);

  const handleGridOpacityChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings({ gridOpacity: parseFloat(e.target.value) });
  }, [updateSettings]);

  const handleToggleDefault = useCallback(() => {
    updateSettings({ showDefaultOnOpen: !settings.showDefaultOnOpen });
  }, [settings.showDefaultOnOpen, updateSettings]);

  const handleToggleConnections = useCallback(() => {
    updateSettings({ showConnections: !settings.showConnections });
  }, [settings.showConnections, updateSettings]);

  const handleToggleMinimap = useCallback(() => {
    updateSettings({ showMinimap: !settings.showMinimap });
  }, [settings.showMinimap, updateSettings]);

  const handleResetCanvas = useCallback(() => {
    onResetCanvas();
    setResetConfirm(false);
    onClose();
  }, [onResetCanvas, onClose]);

  return (
    <div ref={panelRef} className="personalization-panel">
      <div className="personalization-panel__header">
        <span className="personalization-panel__title">Personalization</span>
        <button className="personalization-panel__close" onClick={onClose}><X size={14} /></button>
      </div>
      <div className="personalization-panel__body">
        <div className="personalization-panel__section">
          <label className="personalization-panel__label">Background Color</label>
          <div className="personalization-panel__color-row">
            {BG_PRESETS.map((preset) => (
              <button key={preset.color} className={cn('personalization-panel__color-swatch', settings.backgroundColor === preset.color && 'personalization-panel__color-swatch--active')} style={{ backgroundColor: preset.color }} onClick={() => handleBgPreset(preset.color)} title={preset.label} />
            ))}
            <div className="personalization-panel__custom-color">
              <input type="color" value={customColor} onChange={handleCustomColor} className="personalization-panel__color-input" />
              <span className="personalization-panel__custom-label">Custom</span>
            </div>
          </div>
        </div>
        <div className="personalization-panel__section">
          <label className="personalization-panel__label">Grid Pattern</label>
          <div className="personalization-panel__grid-options">
            {GRID_OPTIONS.map((opt) => (
              <button key={opt.value} className={cn('personalization-panel__grid-btn', settings.gridPattern === opt.value && 'personalization-panel__grid-btn--active')} onClick={() => handleGridChange(opt.value)} title={opt.label}>
                <span className="personalization-panel__grid-icon">{opt.icon}</span>
                <span className="personalization-panel__grid-label">{opt.label}</span>
              </button>
            ))}
          </div>
          {/* Opacity slider — only meaningful when a grid pattern is active */}
          <div className={cn('personalization-panel__opacity-row', settings.gridPattern === 'none' && 'personalization-panel__opacity-row--disabled')}>
            <span className="personalization-panel__opacity-label">Opacity</span>
            <input
              type="range"
              min="0.05"
              max="0.6"
              step="0.01"
              value={settings.gridOpacity ?? 0.25}
              onChange={handleGridOpacityChange}
              disabled={settings.gridPattern === 'none'}
              className="personalization-panel__opacity-slider"
            />
            <span className="personalization-panel__opacity-value">
              {Math.round((settings.gridOpacity ?? 0.25) * 100)}%
            </span>
          </div>
        </div>
        <div className="personalization-panel__section">
          <label className="personalization-panel__label">Connections</label>
          <div className="personalization-panel__toggle-row">
            <button className={cn('personalization-panel__toggle', settings.showConnections && 'personalization-panel__toggle--on')} onClick={handleToggleConnections}>
              <span className="personalization-panel__toggle-thumb" />
            </button>
            <span className="personalization-panel__toggle-text">Show connection ports and edges</span>
          </div>
          <p className="personalization-panel__hint">Toggle the dots on node sides and the spaghetti-like connections between them.</p>
        </div>
        <div className="personalization-panel__section">
          <label className="personalization-panel__label">Minimap</label>
          <div className="personalization-panel__toggle-row">
            <button className={cn('personalization-panel__toggle', settings.showMinimap && 'personalization-panel__toggle--on')} onClick={handleToggleMinimap}>
              <span className="personalization-panel__toggle-thumb" />
            </button>
            <span className="personalization-panel__toggle-text">Show minimap</span>
          </div>
          <p className="personalization-panel__hint">Toggle the small navigation map in the bottom-right corner.</p>
        </div>
        <div className="personalization-panel__section">
          <label className="personalization-panel__label">Startup View</label>
          <div className="personalization-panel__toggle-row">
            <button className={cn('personalization-panel__toggle', settings.showDefaultOnOpen && 'personalization-panel__toggle--on')} onClick={handleToggleDefault}>
              <span className="personalization-panel__toggle-thumb" />
            </button>
            <span className="personalization-panel__toggle-text">Show default point on open</span>
          </div>
          <button className="personalization-panel__action-btn" onClick={onSetDefaultPoint}>
            {hasDefaultPoint ? 'Update Default Point' : 'Set New Default Point'}
          </button>
          <p className="personalization-panel__hint">Click to set a crosshair on the canvas, then click where you want the default view to be.</p>
        </div>
        {/* ===== DANGER ZONE ===== */}
        <div className="personalization-panel__section personalization-panel__section--danger">
          <label className="personalization-panel__label personalization-panel__label--danger">Danger Zone</label>
          {!resetConfirm ? (
            <button className="personalization-panel__danger-btn" onClick={() => setResetConfirm(true)}>
              Reset Canvas…
            </button>
          ) : (
            <div className="personalization-panel__danger-confirm">
              <p>This will permanently delete all nodes and connections. There is no undo.</p>
              <div className="personalization-panel__danger-actions">
                <button className="personalization-panel__danger-btn--confirm" onClick={handleResetCanvas}>
                  Yes, reset everything
                </button>
                <button className="personalization-panel__cancel-btn" onClick={() => setResetConfirm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default PersonalizationPanel;