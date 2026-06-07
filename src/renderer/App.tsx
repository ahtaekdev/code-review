import React, { useCallback, useEffect } from 'react';
import {
  useAppDispatch,
  useAppSelector,
  fetchConfig,
  fetchTheme,
  fetchGitStatus,
  fetchFileTree,
  fetchCurrentFolder,
  fetchKnownFolders,
  fetchActiveFolders,
  cycleActiveFolder,
  navigateMetaFile,
  cycleTab,
  closeCurrentTab,
  selectVisibleRows,
  selectActiveFilePath,
  selectChangedPaths,
  selectPerFolder,
  moveTreeCursor,
  openTreeItem,
  navigateToParent,
  collapseParent,
  deepCollapseParent,
  toggleAccepted,
  commitAccepted,
  toggleConfigModal,
  closeConfigModal,
  openFuzzySearch,
  closeFuzzySearch,
  openContentSearch,
  closeContentSearch,
  toggleReviewModal,
  closeReviewModal,
  cycleDiffMode,
  toggleCompareMode,
  toggleAllGaps,
  openFolderPicker,
  setCurrentFolder,
} from './store';
import { matchesShortcut } from './shortcuts';
import { onPush } from './rpc';
import { FilePanel } from './FilePanel';
import { DiffPanel } from './DiffPanel';
import { TabBar } from './TabBar';
import { ConfigModal } from './ConfigModal';
import { FuzzySearchModal } from './FuzzySearchModal';
import { ReviewModal } from './ReviewModal';
import { FolderPickerModal } from './FolderPickerModal';
import { ContentSearchModal } from './ContentSearchModal';
import { SANS_FONT } from '../shared/theme';

export const App: React.FC = () => {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((s) => s.theme.data);

  useEffect(() => {
    dispatch(fetchConfig());
    dispatch(fetchTheme());
    dispatch(fetchGitStatus());
    dispatch(fetchFileTree());
    dispatch(fetchCurrentFolder());
    dispatch(fetchKnownFolders());
    dispatch(fetchActiveFolders());
    const unsub1 = onPush('gitChanged', () => {
      dispatch(fetchGitStatus());
      dispatch(fetchFileTree());
    });
    const unsub2 = onPush('themeChanged', () => dispatch(fetchTheme()));
    const unsub3 = onPush('folderChanged', (payload) => {
      dispatch(setCurrentFolder(payload.folder));
      dispatch(fetchActiveFolders());
      dispatch(fetchGitStatus());
      dispatch(fetchFileTree());
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [dispatch]);

  useEffect(() => {
    const el = document.documentElement.style;
    el.setProperty('--cr-bg', theme.bg);
    el.setProperty('--cr-fg', theme.fg);
    el.setProperty('--cr-border', theme.border);
    el.setProperty('--cr-muted-fg', theme.mutedFg);
    el.setProperty('--cr-accent-bg', theme.accentBg);
    el.setProperty('--cr-accent-fg', theme.accentFg);
    el.setProperty('--cr-success-fg', theme.successFg);
    el.setProperty('--cr-warning-fg', theme.warningFg);
    el.setProperty('--cr-danger-fg', theme.dangerFg);
  }, [theme]);

  const activeFilePath = useAppSelector(selectActiveFilePath);
  const shortcuts = useAppSelector((s) => s.config.data.shortcuts);
  const modalOpen = useAppSelector((s) => s.ui.configModalOpen);
  const fuzzySearchOpen = useAppSelector((s) => s.ui.fuzzySearchOpen);
  const contentSearchOpen = useAppSelector((s) => s.ui.contentSearchOpen);
  const reviewModalOpen = useAppSelector((s) => s.ui.reviewModalOpen);
  const folderPickerOpen = useAppSelector((s) => s.ui.folderPickerOpen);
  const treeCursor = useAppSelector((s) => selectPerFolder(s).treeCursor);
  const visibleRows = useAppSelector(selectVisibleRows);
  const changedPaths = useAppSelector(selectChangedPaths);
  const compareMode = useAppSelector((s) => s.ui.compareMode);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Folder picker shortcut — works from anywhere (except inside folder picker, which handles its own keys)
      if (matchesShortcut(e, shortcuts.openFolder) && !folderPickerOpen) {
        e.preventDefault();
        dispatch(openFolderPicker());
        return;
      }

      if (matchesShortcut(e, shortcuts.fuzzySearch)) {
        e.preventDefault();
        if (fuzzySearchOpen) dispatch(closeFuzzySearch());
        else dispatch(openFuzzySearch());
        return;
      }

      if (matchesShortcut(e, shortcuts.contentSearch)) {
        e.preventDefault();
        if (contentSearchOpen) dispatch(closeContentSearch());
        else dispatch(openContentSearch());
        return;
      }

      if (matchesShortcut(e, shortcuts.showReview)) {
        e.preventDefault();
        if (reviewModalOpen) dispatch(closeReviewModal());
        else dispatch(toggleReviewModal());
        return;
      }

      if (matchesShortcut(e, shortcuts.nextActiveFolder) && !folderPickerOpen) {
        e.preventDefault();
        dispatch(cycleActiveFolder(1));
        return;
      }
      if (matchesShortcut(e, shortcuts.prevActiveFolder) && !folderPickerOpen) {
        e.preventDefault();
        dispatch(cycleActiveFolder(-1));
        return;
      }

      // Don't process other shortcuts when a modal with its own key handling is open
      if (fuzzySearchOpen || contentSearchOpen || reviewModalOpen || folderPickerOpen) return;

      if (matchesShortcut(e, shortcuts.showConfig)) {
        e.preventDefault();
        dispatch(toggleConfigModal());
        return;
      }

      if (modalOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          dispatch(closeConfigModal());
        }
        return;
      }

      // Scroll diff panel — always active (independent of tree focus)
      const isScrollDown = matchesShortcut(e, shortcuts.scrollDown);
      const isScrollUp = matchesShortcut(e, shortcuts.scrollUp);
      const isPageDown = matchesShortcut(e, shortcuts.pageDown);
      const isPageUp = matchesShortcut(e, shortcuts.pageUp);
      if (isScrollDown || isScrollUp || isPageDown || isPageUp) {
        const tag = document.activeElement?.tagName;
        if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
        e.preventDefault();
        const container = document.getElementById('diff-scroll-container');
        if (!container) return;
        const pageAmount = container.clientHeight * 0.9;
        const lineAmount = 60;
        const amount = (isPageDown || isPageUp) ? pageAmount : lineAmount;
        const direction = (isScrollUp || isPageUp) ? -1 : 1;
        if (container.scrollHeight > container.clientHeight) {
          container.scrollBy({ top: direction * amount });
        } else {
          container.querySelectorAll<HTMLElement>('[data-split-scroll]').forEach(el => {
            el.scrollBy({ top: direction * amount });
          });
        }
        return;
      }

      if (matchesShortcut(e, shortcuts.cycleDiffMode)) {
        e.preventDefault();
        dispatch(cycleDiffMode());
      } else if (matchesShortcut(e, shortcuts.toggleCompareMode)) {
        e.preventDefault();
        dispatch(toggleCompareMode());
        dispatch(fetchGitStatus());
        dispatch(fetchFileTree());
      } else if (matchesShortcut(e, shortcuts.toggleAllGaps)) {
        e.preventDefault();
        dispatch(toggleAllGaps());
      } else if (matchesShortcut(e, shortcuts.nextFile)) {
        e.preventDefault();
        dispatch(navigateMetaFile(1));
      } else if (matchesShortcut(e, shortcuts.prevFile)) {
        e.preventDefault();
        dispatch(navigateMetaFile(-1));
      } else if (matchesShortcut(e, shortcuts.nextTab)) {
        e.preventDefault();
        dispatch(cycleTab(1));
      } else if (matchesShortcut(e, shortcuts.prevTab)) {
        e.preventDefault();
        dispatch(cycleTab(-1));
      } else if (matchesShortcut(e, shortcuts.closeTab)) {
        e.preventDefault();
        dispatch(closeCurrentTab());
      } else if (matchesShortcut(e, shortcuts.toggleInclude)) {
        e.preventDefault();
        const cursorRow = visibleRows[treeCursor];
        const cursorPath = cursorRow && !cursorRow.isDir ? cursorRow.path : null;
        if (compareMode !== 'status') return;
        if (cursorPath && changedPaths.has(cursorPath)) {
          dispatch(toggleAccepted(cursorPath));
        } else if (activeFilePath) {
          dispatch(toggleAccepted(activeFilePath));
        }
      } else if (matchesShortcut(e, shortcuts.commit)) {
        e.preventDefault();
        if (compareMode === 'status') dispatch(commitAccepted());
      } else if (!(['TEXTAREA', 'INPUT', 'SELECT'] as string[]).includes(document.activeElement?.tagName ?? '')) {
        if (matchesShortcut(e, shortcuts.treeCursorDown)) {
          e.preventDefault();
          const next = Math.min(treeCursor + 1, visibleRows.length - 1);
          dispatch(moveTreeCursor(next));
        } else if (matchesShortcut(e, shortcuts.treeCursorUp)) {
          e.preventDefault();
          const prev = Math.max(treeCursor - 1, 0);
          dispatch(moveTreeCursor(prev));
        } else if (matchesShortcut(e, shortcuts.treeOpen)) {
          e.preventDefault();
          dispatch(openTreeItem());
        } else if (matchesShortcut(e, shortcuts.treeParent)) {
          e.preventDefault();
          dispatch(navigateToParent());
        } else if (matchesShortcut(e, shortcuts.treeCollapseParent)) {
          e.preventDefault();
          dispatch(collapseParent());
        } else if (matchesShortcut(e, shortcuts.treeDeepCollapse)) {
          e.preventDefault();
          dispatch(deepCollapseParent());
        }
      }
    },
    [dispatch, activeFilePath, shortcuts, modalOpen, fuzzySearchOpen, contentSearchOpen, reviewModalOpen, folderPickerOpen, treeCursor, visibleRows, changedPaths, compareMode],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Auto-hide scrollbars: add .is-scrolling class on scroll, remove after timeout
  useEffect(() => {
    const timers = new Map<Element, ReturnType<typeof setTimeout>>();
    const onScroll = (e: Event) => {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      el.classList.add('is-scrolling');
      const prev = timers.get(el);
      if (prev) clearTimeout(prev);
      timers.set(el, setTimeout(() => {
        el.classList.remove('is-scrolling');
        timers.delete(el);
      }, 1000));
    };
    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: SANS_FONT, color: 'var(--cr-fg)', background: 'var(--cr-bg)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <TabBar />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <DiffPanel />
          </div>
        </div>
        <div style={{ width: 280, flexShrink: 0, boxShadow: 'inset 1px 0 0 0 var(--cr-border)', background: 'var(--cr-bg)', overflow: 'hidden' }}>
          <FilePanel />
        </div>
      </div>
      {modalOpen && <ConfigModal />}
      {fuzzySearchOpen && <FuzzySearchModal />}
      {contentSearchOpen && <ContentSearchModal />}
      {reviewModalOpen && <ReviewModal />}
      {folderPickerOpen && <FolderPickerModal />}
    </div>
  );
};
