import React, { useEffect, useCallback, useRef } from 'react';
import {
  useAppDispatch,
  useAppSelector,
  closeFolderPicker,
  moveFolderPickerCursor,
  switchFolder,
  removeFolder,
  pickAndAddFolder,
  fetchKnownFolders,
  fetchActiveFolders,
  toggleActiveFolder,
} from './store';
import { matchesShortcut, formatShortcut } from './shortcuts';

const DEFAULT_GAP = '12px';
const HALF_DEFAULT_GAP = '6px';

export const FolderPickerModal: React.FC = () => {
  const dispatch = useAppDispatch();
  const knownFolders = useAppSelector((s) => s.folder.knownFolders);
  const currentFolder = useAppSelector((s) => s.ui.currentFolder);
  const activeFolders = useAppSelector((s) => s.folder.activeFolders);
  const shortcuts = useAppSelector((s) => s.config.data.shortcuts);
  const cursor = useAppSelector((s) => s.ui.folderPickerCursor);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dispatch(fetchKnownFolders());
    dispatch(fetchActiveFolders());
  }, [dispatch]);

  // scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.children[cursor] as HTMLElement | undefined;
    if (active) active.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const handleSelect = useCallback(
    (folder: string) => {
      dispatch(closeFolderPicker());
      dispatch(switchFolder(folder));
    },
    [dispatch],
  );

  const handleAdd = useCallback(() => {
    dispatch(pickAndAddFolder());
  }, [dispatch]);

  const handleToggleActive = useCallback(() => {
    const folder = knownFolders[cursor];
    if (folder) dispatch(toggleActiveFolder(folder));
  }, [dispatch, knownFolders, cursor]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dispatch(closeFolderPicker());
      } else if (matchesShortcut(e, shortcuts.treeCursorDown)) {
        e.preventDefault();
        dispatch(moveFolderPickerCursor(Math.min(cursor + 1, knownFolders.length - 1)));
      } else if (matchesShortcut(e, shortcuts.treeCursorUp)) {
        e.preventDefault();
        dispatch(moveFolderPickerCursor(Math.max(cursor - 1, 0)));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (knownFolders[cursor]) handleSelect(knownFolders[cursor]);
      } else if (matchesShortcut(e, shortcuts.newFolder)) {
        e.preventDefault();
        handleAdd();
      } else if (matchesShortcut(e, shortcuts.folderRemove)) {
        e.preventDefault();
        if (knownFolders[cursor]) {
          dispatch(removeFolder(knownFolders[cursor]));
        }
      } else if (matchesShortcut(e, shortcuts.folderToggleActive)) {
        e.preventDefault();
        handleToggleActive();
      }
    },
    [dispatch, cursor, knownFolders, handleSelect, handleAdd, handleToggleActive],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const folderName = (p: string) => {
    const parts = p.replace(/\/$/, '').split('/');
    return parts[parts.length - 1] || p;
  };

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
        if (e.target === e.currentTarget) dispatch(closeFolderPicker());
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
        <div
          style={{
            padding: `${HALF_DEFAULT_GAP} ${DEFAULT_GAP}`,
            borderBottom: '1px solid var(--cr-border)',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--cr-fg)' }}>
            Open Folder
          </span>
        </div>

        <div
          ref={listRef}
          style={{
            overflowY: 'auto',
            padding: 0,
            flex: 1,
          }}
        >
          {knownFolders.length === 0 && (
            <div style={{ padding: '24px 16px', fontSize: 12, color: 'var(--cr-muted-fg)', textAlign: 'center' }}>
              No known folders. Press {formatShortcut(shortcuts.newFolder)} to add one.
            </div>
          )}
          {knownFolders.map((folder, i) => {
            const isCurrent = folder === currentFolder;
            const isActive = activeFolders.includes(folder);
            return (
              <div
                key={folder}
                onMouseDown={() => handleSelect(folder)}
                onMouseEnter={() => dispatch(moveFolderPickerCursor(i))}
                style={{
                  padding: '8px 16px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  background: i === cursor ? 'var(--cr-accent-bg)' : 'transparent',
                }}
              >
                <span
                  title={isActive ? `Active (${formatShortcut(shortcuts.folderToggleActive)} to deactivate)` : `Inactive (${formatShortcut(shortcuts.folderToggleActive)} to activate)`}
                  onMouseDown={(ev) => {
                    ev.stopPropagation();
                    dispatch(moveFolderPickerCursor(i));
                    dispatch(toggleActiveFolder(folder));
                  }}
                  style={{
                    fontSize: 12,
                    lineHeight: '18px',
                    flexShrink: 0,
                    color: isActive ? 'var(--cr-accent-fg)' : 'var(--cr-border)',
                    cursor: 'pointer',
                  }}
                >
                  {isActive ? '\u2605' : '\u2606'}
                </span>
                <div style={{ minWidth: 0, overflow: 'hidden', flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: isCurrent ? 'var(--cr-accent-fg)' : 'var(--cr-fg)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {folderName(folder)}
                    {isCurrent && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 12,
                          fontWeight: 400,
                          color: 'var(--cr-success-fg)',
                        }}
                      >
                        current
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--cr-muted-fg)',
                      fontFamily: 'monospace',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {folder}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            padding: `${HALF_DEFAULT_GAP} ${DEFAULT_GAP}`,
            borderTop: '1px solid var(--cr-border)',
            fontSize: 12,
            color: 'var(--cr-muted-fg)',
          }}
        >
          {formatShortcut(shortcuts.folderToggleActive)} toggle active &middot; {formatShortcut(shortcuts.newFolder)} new folder &middot; {formatShortcut(shortcuts.folderRemove)} remove &middot; Enter open
        </div>
      </div>
    </div>
  );
};
