import React, { useRef, useEffect, useCallback } from 'react';
import {
  useAppDispatch,
  useAppSelector,
  closeContentSearch,
  moveContentSearchCursor,
  debouncedFetchContentSearch,
  openFileInTab,
  selectFlatContentMatches,
  type FlatContentMatch,
} from './store';

const MAX_VISIBLE = 50;

function highlightQuery(line: string, query: string): React.ReactNode {
  if (!query) return line;
  const lowerLine = line.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let lastEnd = 0;
  let idx = lowerLine.indexOf(lowerQuery);
  let key = 0;
  while (idx !== -1) {
    if (idx > lastEnd) parts.push(line.slice(lastEnd, idx));
    parts.push(
      <span key={key++} style={{ color: 'var(--cr-accent-fg)', fontWeight: 600 }}>
        {line.slice(idx, idx + query.length)}
      </span>,
    );
    lastEnd = idx + query.length;
    idx = lowerLine.indexOf(lowerQuery, lastEnd);
  }
  if (lastEnd < line.length) parts.push(line.slice(lastEnd));
  return parts.length > 0 ? <>{parts}</> : line;
}

const MatchBlock: React.FC<{
  entry: FlatContentMatch;
  query: string;
  isActive: boolean;
  onSelect: () => void;
  onHover: () => void;
}> = ({ entry, query, isActive, onSelect, onHover }) => {
  const { match, filePath, isFirstInFile } = entry;
  const allLines: { lineNo: number; content: string; isMatch: boolean }[] = [];

  for (let i = 0; i < match.contextBefore.length; i++) {
    allLines.push({
      lineNo: match.contextStartLine + i,
      content: match.contextBefore[i],
      isMatch: false,
    });
  }
  allLines.push({ lineNo: match.lineNumber, content: match.lineContent, isMatch: true });
  for (let i = 0; i < match.contextAfter.length; i++) {
    allLines.push({
      lineNo: match.lineNumber + 1 + i,
      content: match.contextAfter[i],
      isMatch: false,
    });
  }

  const gutterWidth = String(allLines[allLines.length - 1]?.lineNo ?? 0).length;

  return (
    <div onMouseDown={onSelect} onMouseEnter={onHover}>
      {isFirstInFile && (
        <div
          style={{
            padding: '8px 16px 4px',
            fontSize: 12,
            fontFamily: 'monospace',
            color: 'var(--cr-accent-fg)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {filePath}
        </div>
      )}
      <div
        style={{
          margin: '0 12px 4px',
          borderRadius: 4,
          border: isActive
            ? '1px solid var(--cr-accent-fg)'
            : '1px solid var(--cr-border)',
          background: isActive ? 'var(--cr-accent-bg)' : 'transparent',
          overflow: 'hidden',
          cursor: 'pointer',
        }}
      >
        {allLines.map((line, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: '18px',
              background: line.isMatch
                ? 'color-mix(in srgb, var(--cr-accent-bg) 60%, transparent)'
                : 'transparent',
            }}
          >
            <span
              style={{
                width: gutterWidth * 8 + 16,
                minWidth: gutterWidth * 8 + 16,
                textAlign: 'right',
                paddingRight: 8,
                color: 'var(--cr-muted-fg)',
                userSelect: 'none',
                borderRight: '1px solid var(--cr-border)',
              }}
            >
              {line.lineNo}
            </span>
            <span
              style={{
                paddingLeft: 8,
                whiteSpace: 'pre',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: line.isMatch ? 'var(--cr-fg)' : 'var(--cr-muted-fg)',
              }}
            >
              {line.isMatch ? highlightQuery(line.content, query) : line.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ContentSearchModal: React.FC = () => {
  const dispatch = useAppDispatch();
  const query = useAppSelector((s) => s.ui.contentSearchQuery);
  const cursor = useAppSelector((s) => s.ui.contentSearchCursor);
  const loading = useAppSelector((s) => s.ui.contentSearchLoading);
  const flatMatches = useAppSelector(selectFlatContentMatches);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // Each match block may include a file header; find the actual element by data attribute
    const active = list.querySelector(`[data-match-idx="${cursor}"]`) as HTMLElement | undefined;
    if (active) active.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const visible = flatMatches.slice(0, MAX_VISIBLE);

  const selectItem = useCallback(
    (filePath: string) => {
      dispatch(closeContentSearch());
      dispatch(openFileInTab(filePath));
    },
    [dispatch],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dispatch(closeContentSearch());
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        dispatch(moveContentSearchCursor(Math.min(cursor + 1, visible.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        dispatch(moveContentSearchCursor(Math.max(cursor - 1, 0)));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (visible[cursor]) selectItem(visible[cursor].filePath);
      }
    },
    [dispatch, cursor, visible, selectItem],
  );

  const totalMatches = flatMatches.length;

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
        if (e.target === e.currentTarget) dispatch(closeContentSearch());
      }}
    >
      <div
        style={{
          background: 'var(--cr-bg)',
          borderRadius: 8,
          width: 700,
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
            onChange={(e) => dispatch(debouncedFetchContentSearch(e.target.value))}
            onKeyDown={handleKeyDown}
            placeholder="Search file contents..."
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
        {loading && (
          <div style={{ padding: '8px 16px 0', fontSize: 12, color: 'var(--cr-muted-fg)' }}>
            Searching...
          </div>
        )}
        <div
          ref={listRef}
          style={{
            overflowY: 'auto',
            padding: '4px 0',
            margin: '8px 0',
          }}
        >
          {!loading && visible.length === 0 && query.length >= 2 && (
            <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--cr-muted-fg)' }}>
              No matches found
            </div>
          )}
          {!loading && query.length > 0 && query.length < 2 && (
            <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--cr-muted-fg)' }}>
              Type at least 2 characters to search
            </div>
          )}
          {visible.map((entry) => (
            <div key={`${entry.filePath}:${entry.match.lineNumber}`} data-match-idx={entry.flatIndex}>
              <MatchBlock
                entry={entry}
                query={query}
                isActive={entry.flatIndex === cursor}
                onSelect={() => selectItem(entry.filePath)}
                onHover={() => dispatch(moveContentSearchCursor(entry.flatIndex))}
              />
            </div>
          ))}
        </div>
        {totalMatches > 0 && !loading && (
          <div
            style={{
              padding: '6px 16px',
              fontSize: 12,
              color: 'var(--cr-muted-fg)',
              borderTop: '1px solid var(--cr-border)',
            }}
          >
            {totalMatches} match{totalMatches !== 1 ? 'es' : ''}
            {totalMatches > MAX_VISIBLE ? ` (showing first ${MAX_VISIBLE})` : ''}
          </div>
        )}
      </div>
    </div>
  );
};
