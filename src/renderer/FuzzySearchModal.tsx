import React, { useRef, useEffect, useCallback } from 'react';
import {
  useAppDispatch,
  useAppSelector,
  closeFuzzySearch,
  setFuzzySearchQuery,
  moveFuzzySearchCursor,
  openFileInTab,
  selectFuzzyResults,
  type FuzzyMatch,
} from './store';

const MAX_VISIBLE = 20;

const HighlightedPath: React.FC<{ entry: FuzzyMatch }> = ({ entry }) => {
  const { path, matches } = entry;
  const matchSet = new Set(matches);
  const lastSlash = path.lastIndexOf('/');
  const spans: React.ReactNode[] = [];

  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    const inFilename = i > lastSlash;
    const isMatch = matchSet.has(i);
    spans.push(
      <span
        key={i}
        style={{
          color: isMatch
            ? 'var(--cr-accent-fg)'
            : inFilename
              ? 'var(--cr-fg)'
              : 'var(--cr-muted-fg)',
          fontWeight: isMatch ? 600 : 400,
        }}
      >
        {ch}
      </span>,
    );
  }

  return <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{spans}</span>;
};

export const FuzzySearchModal: React.FC = () => {
  const dispatch = useAppDispatch();
  const query = useAppSelector((s) => s.ui.fuzzySearchQuery);
  const cursor = useAppSelector((s) => s.ui.fuzzySearchCursor);
  const results = useAppSelector(selectFuzzyResults);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.children[cursor] as HTMLElement | undefined;
    if (active) active.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const visible = results.slice(0, MAX_VISIBLE);

  const selectItem = useCallback(
    (path: string) => {
      dispatch(closeFuzzySearch());
      dispatch(openFileInTab(path));
    },
    [dispatch],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dispatch(closeFuzzySearch());
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        dispatch(moveFuzzySearchCursor(Math.min(cursor + 1, visible.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        dispatch(moveFuzzySearchCursor(Math.max(cursor - 1, 0)));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (visible[cursor]) selectItem(visible[cursor].path);
      }
    },
    [dispatch, cursor, visible, selectItem],
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 80,
        zIndex: 1000,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dispatch(closeFuzzySearch());
      }}
    >
      <div
        style={{
          background: 'var(--cr-bg)',
          borderRadius: 8,
          width: 520,
          maxHeight: 'calc(100vh - 160px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          border: '1px solid var(--cr-border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 12px 0' }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => dispatch(setFuzzySearchQuery(e.target.value))}
            onKeyDown={handleKeyDown}
            placeholder="Search files by name…"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '8px 12px',
              fontSize: 14,
              fontFamily: 'monospace',
              background: 'color-mix(in srgb, var(--cr-bg) 80%, var(--cr-fg) 20%)',
              color: 'var(--cr-fg)',
              border: '1px solid var(--cr-border)',
              borderRadius: 6,
              outline: 'none',
            }}
          />
        </div>
        <div
          ref={listRef}
          style={{
            overflowY: 'auto',
            padding: '4px 0',
            margin: '8px 0',
          }}
        >
          {visible.length === 0 && query && (
            <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--cr-muted-fg)' }}>
              No matching files
            </div>
          )}
          {visible.map((entry, i) => (
            <div
              key={entry.path}
              onMouseDown={() => selectItem(entry.path)}
              onMouseEnter={() => dispatch(moveFuzzySearchCursor(i))}
              style={{
                padding: '6px 16px',
                cursor: 'pointer',
                background: i === cursor ? 'var(--cr-accent-bg)' : 'transparent',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              <HighlightedPath entry={entry} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
