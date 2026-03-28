import React from 'react';
import { useAppSelector } from './store';
import { SHORTCUT_LABELS, type ShortcutConfig } from '../shared/config';
import { formatShortcut } from './shortcuts';

export const ConfigModal: React.FC = () => {
  const shortcuts = useAppSelector((s) => s.config.data.shortcuts);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--cr-bg)', borderRadius: 8, padding: '20px 24px', minWidth: 360, maxWidth: 480, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', border: '1px solid var(--cr-border)' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--cr-fg)' }}>Keyboard Shortcuts</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {(Object.keys(SHORTCUT_LABELS) as (keyof ShortcutConfig)[]).map((key) => (
              <tr key={key}>
                <td style={{ padding: '6px 12px 6px 0', fontSize: 13, color: 'var(--cr-fg)' }}>{SHORTCUT_LABELS[key]}</td>
                <td style={{ padding: '6px 0', textAlign: 'right' }}>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--cr-accent-fg)' }}>
                    {formatShortcut(shortcuts[key])}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ margin: '16px 0 0', fontSize: 12, color: 'var(--cr-muted-fg)' }}>
          Edit ~/.config/code-review/config.json to customize
        </p>
      </div>
    </div>
  );
};
