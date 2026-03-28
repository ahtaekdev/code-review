import React from 'react';
import { useAppDispatch, useAppSelector, activateTab, removeTab, activateMetaSource, selectPerFolder } from './store';
import { useIsMac } from './usePlatform';

function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}

const tabBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 12px',
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  borderRight: '1px solid var(--cr-border)',
  flexShrink: 0,
};

export const TabBar: React.FC = () => {
  const dispatch = useAppDispatch();
  const { tabs, activeTabIndex, activeSource, metaTab } = useAppSelector(selectPerFolder);
  const isMac = useIsMac();

  if (tabs.length === 0 && !metaTab) return null;

  const metaActive = activeSource === 'meta' && metaTab != null;

  return (
    <div style={{
      display: 'flex',
      boxShadow: 'inset 0 -1px 0 0 var(--cr-border)',
      background: 'var(--cr-bg)',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {isMac && <div style={{ width: 128, flexShrink: 0 }} />}

      {metaTab && (
        <div
          onClick={() => dispatch(activateMetaSource())}
          style={{
            ...tabBase,
            fontStyle: 'italic',
            background: metaActive
              ? 'var(--cr-accent-bg)'
              : 'var(--cr-bg)',
            color: metaActive ? 'var(--cr-accent-fg)' : 'var(--cr-fg)',
            boxShadow: metaActive ? 'inset 0 -1px 0 0 var(--cr-accent-fg)' : 'inset 0 -1px 0 0 var(--cr-border)',
          }}
          title={metaTab.path}
        >
          {basename(metaTab.path)}
        </div>
      )}

      {tabs.map((tab, i) => {
        const isActive = activeSource === 'tab' && i === activeTabIndex;
        return (
          <div
            key={tab.path}
            onClick={() => dispatch(activateTab(i))}
            style={{
              ...tabBase,
              background: isActive
                ? 'var(--cr-accent-bg)'
                : 'var(--cr-bg)',
              color: isActive ? 'var(--cr-fg)' : 'var(--cr-fg)',
              boxShadow: isActive ? 'inset 0 -1px 0 0 var(--cr-accent-fg)' : 'inset 0 -1px 0 0 var(--cr-border)',
            }}
            title={tab.path}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {basename(tab.path)}
            </span>
            <span
              onClick={(e) => { e.stopPropagation(); dispatch(removeTab(i)); }}
              style={{
                fontSize: 14,
                lineHeight: 1,
                color: 'var(--cr-muted-fg)',
                borderRadius: 3,
                padding: '0 2px',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'var(--cr-danger-fg)'; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'var(--cr-muted-fg)'; }}
            >
              ×
            </span>
          </div>
        );
      })}

      <div style={{ flex: 1 }} />
    </div>
  );
};
