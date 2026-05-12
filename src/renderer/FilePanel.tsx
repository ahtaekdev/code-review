import React, { useRef, useEffect } from 'react';
import {
  useAppDispatch, useAppSelector,
  openFileInTab,
  selectVisibleRows, selectChangedPaths, selectFileList, selectPerFolder,
  toggleDir, moveTreeCursor,
  type TreeRow,
} from './store';
import { FileIcon } from './icons/seti';

export const FilePanel: React.FC = React.memo(() => {
  const dispatch = useAppDispatch();
  const gitStatus = useAppSelector((s) => s.gitStatus);
  const currentFolder = useAppSelector((s) => s.ui.currentFolder);
  const fileTree = useAppSelector((s) => s.fileTree);
  const { acceptedFiles, treeCursor, expandedDirs } = useAppSelector(selectPerFolder);

  const rows = useAppSelector(selectVisibleRows);
  const changedPaths = useAppSelector(selectChangedPaths);

  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cursorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [treeCursor]);

  const changedStatusMap = React.useMemo(() => {
    const map = new Map<string, { badge: string; color: string }>();
    if (!gitStatus.data) return map;
    for (const f of gitStatus.data.files) {
      map.set(f.path, {
        badge: f.status === 'modified' ? 'M' : 'D',
        color: f.status === 'modified' ? 'var(--cr-warning-fg)' : 'var(--cr-danger-fg)',
      });
    }
    for (const p of gitStatus.data.untracked) {
      map.set(p, { badge: 'U', color: 'var(--cr-success-fg)' });
    }
    return map;
  }, [gitStatus.data]);

  const changedDirs = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of changedPaths) {
      const parts = p.split('/');
      for (let i = 1; i < parts.length; i++) {
        set.add(parts.slice(0, i).join('/'));
      }
    }
    return set;
  }, [changedPaths]);

  const stats = React.useMemo(() => {
    if (!gitStatus.data) return [];
    const uCount = gitStatus.data.untracked.length;
    const dCount = gitStatus.data.files.filter((f) => f.status === 'deleted').length;
    const mCount = gitStatus.data.files.filter((f) => f.status === 'modified').length;
    const parts: { label: string; color: string }[] = [];
    if (uCount) parts.push({ label: `${uCount}u`, color: 'var(--cr-success-fg)' });
    if (dCount) parts.push({ label: `${dCount}d`, color: 'var(--cr-danger-fg)' });
    if (mCount) parts.push({ label: `${mCount}m`, color: 'var(--cr-warning-fg)' });
    return parts;
  }, [gitStatus.data]);

  if (fileTree.loading || gitStatus.loading) {
    return <div style={{ padding: 12, fontSize: 13, color: 'var(--cr-muted-fg)' }}>Loading...</div>;
  }
  if (gitStatus.error) {
    return <div style={{ padding: 12, fontSize: 13, color: 'var(--cr-danger-fg)' }}>{gitStatus.error}</div>;
  }

  const branch = gitStatus.data?.branch ?? '';

  function handleRowClick(row: TreeRow, index: number) {
    dispatch(moveTreeCursor(index));
    if (row.isDir) {
      dispatch(toggleDir(row.path));
    } else {
      dispatch(openFileInTab(row.path));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--cr-border)', flexShrink: 0 }}>
        <div style={{ direction: 'rtl', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700 }}>
          <bdi>{currentFolder}</bdi>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 12, color: 'var(--cr-muted-fg)' }}>
          <span>{branch}</span>
          {stats.length > 0 && (
            <span style={{ display: 'inline-flex', gap: 4 }}>
              {stats.map((s, i) => (
                <span key={i} style={{ color: s.color, fontWeight: 600 }}>{s.label}</span>
              ))}
            </span>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {rows.map((row, i) => {
          const isCursor = i === treeCursor;
          const status = changedStatusMap.get(row.path);
          const dirHasChanges = row.isDir && changedDirs.has(row.path);
          const isExpanded = row.isDir && !!expandedDirs[row.path];

          return (
            <div
              key={row.path}
              ref={isCursor ? cursorRef : undefined}
              onClick={() => handleRowClick(row, i)}
              style={{
                padding: '3px 8px 3px',
                paddingLeft: 8 + row.depth * 16,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                background: isCursor
                  ? 'var(--cr-accent-bg)'
                  : 'transparent',
                boxShadow: isCursor
                  ? 'inset 1px 0 0 0 var(--cr-accent-fg)'
                  : 'none',
              }}
            >
              {row.isDir ? (
                <span style={{ width: 14, flexShrink: 0, color: 'var(--cr-muted-fg)', fontSize: 10, textAlign: 'center' }}>
                  {isExpanded ? '▾' : '▸'}
                </span>
              ) : (
                <FileIcon path={row.path} />
              )}

              <span style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: row.isDir ? 600 : 400,
                color: dirHasChanges ? 'var(--cr-warning-fg)' : undefined,
              }}>
                {row.name}
              </span>

              {status && (
                <span style={{ color: status.color, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0, fontSize: 11 }}>
                  {status.badge}
                </span>
              )}

              {!row.isDir && acceptedFiles[row.path] && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--cr-accent-fg)', flexShrink: 0 }} title="Accepted" />
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <div style={{ padding: 12, fontSize: 13, color: 'var(--cr-muted-fg)' }}>Empty repository</div>
        )}
      </div>
    </div>
  );
});
