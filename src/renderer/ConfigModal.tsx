import React from 'react';
import { useAppSelector } from './store';
import { SHORTCUT_LABELS, type ShortcutConfig } from '../shared/config';
import { formatShortcut } from './shortcuts';

const MODAL_MAX_HEIGHT = 800;
const SHORTCUT_ROW_HEIGHT = 30;
const SHORTCUT_LIST_MAX_HEIGHT = 660;
const SHORTCUTS_PER_COLUMN = Math.floor(SHORTCUT_LIST_MAX_HEIGHT / SHORTCUT_ROW_HEIGHT);
const SHORTCUT_COLUMN_WIDTH = 320;
const SHORTCUT_COLUMN_GAP = 28;

const SHORTCUT_KEYS = Object.keys(SHORTCUT_LABELS) as (keyof ShortcutConfig)[];
const SHORTCUT_COLUMNS = SHORTCUT_KEYS.reduce<(keyof ShortcutConfig)[][]>((columns, key, index) => {
  if (index % SHORTCUTS_PER_COLUMN === 0) columns.push([]);
  columns[columns.length - 1].push(key);
  return columns;
}, []);

export const ConfigModal: React.FC = () => {
  const shortcuts = useAppSelector((s) => s.config.data.shortcuts);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--cr-bg)', borderRadius: 8, padding: '20px 24px', minWidth: 360, width: 'max-content', maxWidth: 'calc(100vw - 48px)', maxHeight: MODAL_MAX_HEIGHT, boxSizing: 'border-box', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', border: '1px solid var(--cr-border)', overflow: 'hidden' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--cr-fg)' }}>Keyboard Shortcuts</h2>
        <div style={{ display: 'flex', gap: SHORTCUT_COLUMN_GAP, alignItems: 'flex-start', maxHeight: SHORTCUT_LIST_MAX_HEIGHT, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 2 }}>
          {SHORTCUT_COLUMNS.map((column, columnIndex) => (
            <div key={columnIndex} style={{ flex: `0 0 ${SHORTCUT_COLUMN_WIDTH}px`, width: SHORTCUT_COLUMN_WIDTH }}>
              {column.map((key) => (
                <div key={key} style={{ height: SHORTCUT_ROW_HEIGHT, display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', columnGap: 16 }}>
                  <span style={{ fontSize: 13, color: 'var(--cr-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={SHORTCUT_LABELS[key]}>
                    {SHORTCUT_LABELS[key]}
                  </span>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--cr-accent-fg)', whiteSpace: 'nowrap' }}>
                    {formatShortcut(shortcuts[key])}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p style={{ margin: '16px 0 0', fontSize: 12, color: 'var(--cr-muted-fg)' }}>
          Edit ~/.config/code-review/config.json to customize
        </p>
      </div>
    </div>
  );
};
