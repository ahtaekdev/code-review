import { configureStore, createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
import type { GitStatus, FileDiff, PlainFile, ContentSearchFileResult, ContentSearchMatch } from '../../shared/rpc';
import type { AppConfig } from '../../shared/config';
import { DEFAULT_CONFIG } from '../../shared/config';
import type { ThemeColors } from '../../shared/theme';
import { DEFAULT_THEME } from '../../shared/theme';
import { rpc } from '../rpc';
import { fuzzyMatch } from './fuzzy';

export type DiffMode = 'unified' | 'split' | 'newest';
export type ViewMode = 'diff' | 'plain';

// --- Tab data ---

export interface TabData {
  path: string;
  viewMode: ViewMode;
  fileType: 'tracked' | 'untracked' | null;
  fileDiff: FileDiff | null;
  plainFile: PlainFile | null;
  loading: boolean;
  error: string | null;
}

function emptyTab(path: string, viewMode: ViewMode, fileType: 'tracked' | 'untracked' | null): TabData {
  return { path, viewMode, fileType, fileDiff: null, plainFile: null, loading: true, error: null };
}

/**
 * True when a FileDiff payload reports "nothing differs vs HEAD".
 *
 * For a file we believed was modified, this is the signal that our cached
 * git status is stale — most commonly because the file was committed
 * outside the app and the watcher cannot see writes inside .git/. Used by
 * the open-in-tab / load-meta thunks (to dispatch a self-heal git status
 * refresh), the openInTab reducer (combined with a non-null newFile, to
 * fall back to plain rendering), and DiffPanel (to show a friendly
 * "no longer modified" message).
 */
export function isStaleGit(diff: FileDiff | null | undefined): boolean {
  return diff != null && !diff.tooLarge && diff.hunks.length === 0;
}

// --- Thunks ---

export const fetchConfig = createAsyncThunk('config/fetch', () =>
  rpc('getConfig', {}),
);

export const fetchTheme = createAsyncThunk('theme/fetch', () =>
  rpc('getTheme', {}),
);

export const fetchGitStatus = createAsyncThunk('gitStatus/fetch', () =>
  rpc('getGitStatus', {}),
);

export const fetchFileTree = createAsyncThunk('fileTree/fetch', () =>
  rpc('getFileTree', {}),
);

export const openInTab = createAsyncThunk(
  'ui/openInTab',
  async (
    args: { path: string; viewMode: ViewMode; fileType: 'tracked' | 'untracked' | null },
    { dispatch },
  ) => {
    if (args.viewMode === 'diff') {
      const diff = await rpc('getFileDiff', {
        path: args.path,
        untracked: args.fileType === 'untracked' ? true : undefined,
      });
      if (isStaleGit(diff)) {
        dispatch(fetchGitStatus());
        dispatch(fetchFileTree());
      }
      return { ...args, diff, plain: null as PlainFile | null };
    } else {
      const plain = await rpc('getFilePlain', { path: args.path });
      return { ...args, diff: null as FileDiff | null, plain };
    }
  },
);

export const loadMetaFile = createAsyncThunk(
  'ui/loadMetaFile',
  async (
    args: { path: string; type: 'tracked' | 'untracked' },
    { dispatch },
  ) => {
    const diff = await rpc('getFileDiff', {
      path: args.path,
      untracked: args.type === 'untracked' ? true : undefined,
    });
    if (isStaleGit(diff)) {
      dispatch(fetchGitStatus());
      dispatch(fetchFileTree());
    }
    return { path: args.path, type: args.type, diff };
  },
);

export const fetchContentSearch = createAsyncThunk(
  'ui/fetchContentSearch',
  async (query: string) => {
    if (!query || query.length < 2) return { query, results: [] as ContentSearchFileResult[] };
    const results = await rpc('searchContent', { query });
    return { query, results };
  },
);

let contentSearchTimer: ReturnType<typeof setTimeout> | null = null;

export const debouncedFetchContentSearch = (query: string) =>
  (dispatch: AppDispatch) => {
    dispatch(setContentSearchQuery(query));
    if (contentSearchTimer) clearTimeout(contentSearchTimer);
    if (!query || query.length < 2) return;
    contentSearchTimer = setTimeout(() => {
      dispatch(fetchContentSearch(query));
    }, 250);
  };

// --- Git status slice ---

interface GitStatusState {
  data: GitStatus | null;
  loading: boolean;
  error: string | null;
}

const gitStatusSlice = createSlice({
  name: 'gitStatus',
  initialState: { data: null, loading: true, error: null } as GitStatusState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchGitStatus.pending, (state) => {
        if (!state.data) state.loading = true;
      })
      .addCase(fetchGitStatus.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
        state.error = null;
      })
      .addCase(fetchGitStatus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Unknown error';
      });
  },
});

// --- File tree slice ---

interface FileTreeState {
  files: string[];
  loading: boolean;
}

const fileTreeSlice = createSlice({
  name: 'fileTree',
  initialState: { files: [], loading: true } as FileTreeState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchFileTree.fulfilled, (state, action) => {
        state.files = action.payload;
        state.loading = false;
      })
      .addCase(fetchFileTree.rejected, (state) => {
        state.loading = false;
      });
  },
});

// --- Commit thunk ---

export const commitAccepted = createAsyncThunk(
  'ui/commitAccepted',
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState;
    const ctx = getPerFolder(state);
    const paths = Object.keys(ctx.acceptedFiles);
    if (paths.length === 0) throw new Error('No files accepted');
    await rpc('commitFiles', { paths, message: 'Committed with Code Review' });
    dispatch(fetchGitStatus());
    dispatch(fetchFileTree());
  },
);

// --- Theme slice ---

interface ThemeState {
  data: ThemeColors;
}

const themeSlice = createSlice({
  name: 'theme',
  initialState: { data: DEFAULT_THEME } as ThemeState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(fetchTheme.fulfilled, (state, action) => {
      state.data = action.payload;
    });
  },
});

// --- Config slice ---

interface ConfigState {
  data: AppConfig;
}

const configSlice = createSlice({
  name: 'config',
  initialState: { data: DEFAULT_CONFIG } as ConfigState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(fetchConfig.fulfilled, (state, action) => {
      state.data = action.payload;
    });
  },
});

// --- Tree navigation helpers ---

export interface TreeRow {
  path: string;
  name: string;
  depth: number;
  isDir: boolean;
}

export function buildVisibleRows(
  files: string[],
  expandedDirs: Record<string, boolean>,
): TreeRow[] {
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.split('/');
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join('/'));
    }
  }

  const allEntries: { path: string; parts: string[]; isDir: boolean }[] = [];
  for (const d of dirs) allEntries.push({ path: d, parts: d.split('/'), isDir: true });
  for (const f of files) allEntries.push({ path: f, parts: f.split('/'), isDir: false });

  allEntries.sort((a, b) => {
    const len = Math.min(a.parts.length, b.parts.length);
    for (let i = 0; i < len; i++) {
      if (a.parts[i] !== b.parts[i]) {
        const aIsDir = i < a.parts.length - 1 || a.isDir;
        const bIsDir = i < b.parts.length - 1 || b.isDir;
        if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
        return a.parts[i].localeCompare(b.parts[i]);
      }
    }
    return a.parts.length - b.parts.length;
  });

  const rows: TreeRow[] = [];
  for (const entry of allEntries) {
    const depth = entry.parts.length - 1;

    let parentCollapsed = false;
    for (let i = 1; i < entry.parts.length; i++) {
      const ancestor = entry.parts.slice(0, i).join('/');
      if (!expandedDirs[ancestor]) { parentCollapsed = true; break; }
    }
    if (parentCollapsed) continue;

    rows.push({
      path: entry.path,
      name: entry.parts[entry.parts.length - 1],
      depth,
      isDir: entry.isDir,
    });
  }
  return rows;
}

// --- Review comments ---

export interface ReviewComment {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  codeSnippet: string;
  comment: string;
}

// --- Per-folder state ---

export interface PerFolderState {
  tabs: TabData[];
  activeTabIndex: number;
  activeSource: 'tab' | 'meta';
  metaTab: TabData | null;
  expandedDirs: Record<string, boolean>;
  treeCursor: number;
  acceptedFiles: Record<string, true>;
  reviewComments: ReviewComment[];
}

const initialPerFolderState: PerFolderState = {
  tabs: [],
  activeTabIndex: -1,
  activeSource: 'meta',
  metaTab: null,
  expandedDirs: {},
  treeCursor: 0,
  acceptedFiles: {},
  reviewComments: [],
};

/** Get the per-folder context for the current folder (for use inside Immer reducers — initializes on first access). */
function getCtx(state: UIState): PerFolderState {
  const key = state.currentFolder;
  if (!key) return initialPerFolderState;
  if (!state.perFolder[key]) {
    state.perFolder[key] = { ...initialPerFolderState, tabs: [], expandedDirs: {}, acceptedFiles: {}, reviewComments: [] };
  }
  return state.perFolder[key];
}

/** Read-only per-folder access for thunks (does not mutate state). */
function getPerFolder(state: RootState): PerFolderState {
  return state.ui.perFolder[state.ui.currentFolder] ?? initialPerFolderState;
}

/** Selector: get the per-folder state for the current folder. */
export const selectPerFolder = (state: RootState): PerFolderState =>
  state.ui.perFolder[state.ui.currentFolder] ?? initialPerFolderState;

// --- Folder thunks ---

export const fetchCurrentFolder = createAsyncThunk('folder/fetchCurrent', () =>
  rpc('getCurrentFolder', {}),
);

export const fetchKnownFolders = createAsyncThunk('folder/fetchKnown', () =>
  rpc('getKnownFolders', {}),
);

export const addFolder = createAsyncThunk('folder/add', async (folder: string) =>
  rpc('addKnownFolder', { folder }),
);

export const removeFolder = createAsyncThunk('folder/remove', async (folder: string) =>
  rpc('removeKnownFolder', { folder }),
);

export const switchFolder = createAsyncThunk(
  'folder/switch',
  async (folder: string, { dispatch }) => {
    await rpc('changeFolder', { folder });
    // The main process will push 'folderChanged', which triggers a full reload
    // in App.tsx. We don't need to do anything else here.
  },
);

export const pickAndAddFolder = createAsyncThunk(
  'folder/pickAndAdd',
  async (_, { dispatch }) => {
    const folder = await rpc('pickFolder', {});
    if (!folder) return null;
    const folders = await rpc('addKnownFolder', { folder });
    return { folder, folders };
  },
);

export const fetchActiveFolders = createAsyncThunk('folder/fetchActive', () =>
  rpc('getActiveFolders', {}),
);

export const toggleActiveFolder = createAsyncThunk(
  'folder/toggleActive',
  async (folder: string, { getState }) => {
    const state = getState() as RootState;
    const isActive = state.folder.activeFolders.includes(folder);
    if (isActive) {
      return { folders: await rpc('removeActiveFolder', { folder }), added: false };
    } else {
      return { folders: await rpc('addActiveFolder', { folder }), added: true };
    }
  },
);

export const cycleActiveFolder = (direction: 1 | -1) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState();
    const active = state.folder.activeFolders;
    if (active.length < 2) return; // need at least 2 to cycle
    const current = state.ui.currentFolder;
    const idx = active.indexOf(current);
    const next = idx === -1
      ? 0
      : (idx + direction + active.length) % active.length;
    dispatch(switchFolder(active[next]));
  };

// --- Folder slice ---

interface FolderState {
  knownFolders: string[];
  activeFolders: string[];
}

const folderSlice = createSlice({
  name: 'folder',
  initialState: { knownFolders: [], activeFolders: [] } as FolderState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchKnownFolders.fulfilled, (state, action) => {
        state.knownFolders = action.payload;
      })
      .addCase(addFolder.fulfilled, (state, action) => {
        state.knownFolders = action.payload;
      })
      .addCase(removeFolder.fulfilled, (state, action) => {
        state.knownFolders = action.payload;
      })
      .addCase(pickAndAddFolder.fulfilled, (state, action) => {
        if (action.payload) {
          state.knownFolders = action.payload.folders;
        }
      })
      .addCase(fetchActiveFolders.fulfilled, (state, action) => {
        state.activeFolders = action.payload;
      })
      .addCase(toggleActiveFolder.fulfilled, (state, action) => {
        state.activeFolders = action.payload.folders;
      });
  },
});

// --- UI slice ---

interface UIState {
  // --- Folder tracking (moved from FolderState) ---
  currentFolder: string;
  perFolder: Record<string, PerFolderState>;

  // --- Global state ---
  commitLoading: boolean;
  commitError: string | null;
  configModalOpen: boolean;
  fuzzySearchOpen: boolean;
  fuzzySearchQuery: string;
  fuzzySearchCursor: number;
  contentSearchOpen: boolean;
  contentSearchQuery: string;
  contentSearchCursor: number;
  contentSearchResults: ContentSearchFileResult[];
  contentSearchLoading: boolean;
  diffMode: DiffMode;
  expandedGaps: Record<string, boolean>;
  allExpanded: boolean;
  reviewModalOpen: boolean;
  folderPickerOpen: boolean;
  folderPickerCursor: number;
}

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    currentFolder: '',
    perFolder: {},

    commitLoading: false,
    commitError: null,
    configModalOpen: false,
    fuzzySearchOpen: false,
    fuzzySearchQuery: '',
    fuzzySearchCursor: 0,
    contentSearchOpen: false,
    contentSearchQuery: '',
    contentSearchCursor: 0,
    contentSearchResults: [],
    contentSearchLoading: false,
    diffMode: 'unified',
    expandedGaps: {},
    allExpanded: false,
    reviewModalOpen: false,
    folderPickerOpen: false,
    folderPickerCursor: 0,
  } as UIState,
  reducers: {
    setCurrentFolder(state, action: { payload: string }) {
      state.currentFolder = action.payload;
      if (!state.perFolder[action.payload]) {
        state.perFolder[action.payload] = { ...initialPerFolderState, tabs: [], expandedDirs: {}, acceptedFiles: {}, reviewComments: [] };
      }
    },
    activateTab(state, action: { payload: number }) {
      const ctx = getCtx(state);
      ctx.activeTabIndex = action.payload;
      ctx.activeSource = 'tab';
      state.expandedGaps = {};
      state.allExpanded = false;
    },
    removeTab(state, action: { payload: number }) {
      const ctx = getCtx(state);
      const idx = action.payload;
      ctx.tabs.splice(idx, 1);
      if (ctx.tabs.length === 0) {
        ctx.activeTabIndex = -1;
        if (ctx.metaTab) ctx.activeSource = 'meta';
      } else if (ctx.activeTabIndex >= ctx.tabs.length) {
        ctx.activeTabIndex = ctx.tabs.length - 1;
      } else if (idx < ctx.activeTabIndex) {
        ctx.activeTabIndex--;
      }
      state.expandedGaps = {};
      state.allExpanded = false;
    },
    toggleAccepted(state, action: { payload: string }) {
      const ctx = getCtx(state);
      const path = action.payload;
      if (ctx.acceptedFiles[path]) {
        delete ctx.acceptedFiles[path];
      } else {
        ctx.acceptedFiles[path] = true;
      }
    },
    toggleConfigModal(state) {
      state.configModalOpen = !state.configModalOpen;
    },
    closeConfigModal(state) {
      state.configModalOpen = false;
    },
    openFuzzySearch(state) {
      state.fuzzySearchOpen = true;
      state.fuzzySearchQuery = '';
      state.fuzzySearchCursor = 0;
    },
    closeFuzzySearch(state) {
      state.fuzzySearchOpen = false;
      state.fuzzySearchQuery = '';
      state.fuzzySearchCursor = 0;
    },
    setFuzzySearchQuery(state, action: { payload: string }) {
      state.fuzzySearchQuery = action.payload;
      state.fuzzySearchCursor = 0;
    },
    moveFuzzySearchCursor(state, action: { payload: number }) {
      state.fuzzySearchCursor = action.payload;
    },
    openContentSearch(state) {
      state.contentSearchOpen = true;
      state.contentSearchQuery = '';
      state.contentSearchCursor = 0;
      state.contentSearchResults = [];
      state.contentSearchLoading = false;
    },
    closeContentSearch(state) {
      state.contentSearchOpen = false;
      state.contentSearchQuery = '';
      state.contentSearchCursor = 0;
      state.contentSearchResults = [];
      state.contentSearchLoading = false;
    },
    setContentSearchQuery(state, action: { payload: string }) {
      state.contentSearchQuery = action.payload;
      state.contentSearchCursor = 0;
      if (!action.payload || action.payload.length < 2) {
        state.contentSearchResults = [];
        state.contentSearchLoading = false;
      } else {
        state.contentSearchLoading = true;
      }
    },
    moveContentSearchCursor(state, action: { payload: number }) {
      state.contentSearchCursor = action.payload;
    },
    cycleDiffMode(state) {
      const modes: DiffMode[] = ['unified', 'split', 'newest'];
      const idx = modes.indexOf(state.diffMode);
      state.diffMode = modes[(idx + 1) % modes.length];
    },
    setDiffMode(state, action: { payload: DiffMode }) {
      state.diffMode = action.payload;
    },
    toggleGap(state, action: { payload: string }) {
      state.expandedGaps[action.payload] = !state.expandedGaps[action.payload];
    },
    toggleAllGaps(state) {
      state.allExpanded = !state.allExpanded;
      state.expandedGaps = {};
    },
    toggleDir(state, action: { payload: string }) {
      const ctx = getCtx(state);
      ctx.expandedDirs[action.payload] = !ctx.expandedDirs[action.payload];
    },
    collapseDir(state, action: { payload: string }) {
      const ctx = getCtx(state);
      ctx.expandedDirs[action.payload] = false;
    },
    collapseDirDeep(state, action: { payload: string }) {
      const ctx = getCtx(state);
      const prefix = action.payload + '/';
      for (const key of Object.keys(ctx.expandedDirs)) {
        if (key === action.payload || key.startsWith(prefix)) {
          ctx.expandedDirs[key] = false;
        }
      }
    },
    expandAncestors(state, action: { payload: string }) {
      const ctx = getCtx(state);
      const parts = action.payload.split('/');
      for (let i = 1; i < parts.length; i++) {
        ctx.expandedDirs[parts.slice(0, i).join('/')] = true;
      }
    },
    moveTreeCursor(state, action: { payload: number }) {
      const ctx = getCtx(state);
      ctx.treeCursor = action.payload;
    },
    addReviewComment(state, action: { payload: ReviewComment }) {
      const ctx = getCtx(state);
      ctx.reviewComments.push(action.payload);
    },
    removeReviewComment(state, action: { payload: string }) {
      const ctx = getCtx(state);
      ctx.reviewComments = ctx.reviewComments.filter((c) => c.id !== action.payload);
    },
    clearReviewComments(state) {
      const ctx = getCtx(state);
      ctx.reviewComments = [];
    },
    toggleReviewModal(state) {
      state.reviewModalOpen = !state.reviewModalOpen;
    },
    closeReviewModal(state) {
      state.reviewModalOpen = false;
    },
    activateMetaSource(state) {
      const ctx = getCtx(state);
      if (ctx.metaTab) {
        ctx.activeSource = 'meta';
        state.expandedGaps = {};
        state.allExpanded = false;
      }
    },
    openFolderPicker(state) {
      state.folderPickerOpen = true;
      state.folderPickerCursor = 0;
    },
    closeFolderPicker(state) {
      state.folderPickerOpen = false;
      state.folderPickerCursor = 0;
    },
    moveFolderPickerCursor(state, action: { payload: number }) {
      state.folderPickerCursor = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // --- folder tracking ---
      .addCase(fetchCurrentFolder.fulfilled, (state, action) => {
        state.currentFolder = action.payload;
        if (!state.perFolder[action.payload]) {
          state.perFolder[action.payload] = { ...initialPerFolderState, tabs: [], expandedDirs: {}, acceptedFiles: {}, reviewComments: [] };
        }
      })
      .addCase(removeFolder.fulfilled, (state, action) => {
        // Clean up perFolder entries for removed folders
        const knownSet = new Set(action.payload);
        for (const key of Object.keys(state.perFolder)) {
          if (!knownSet.has(key) && key !== state.currentFolder) {
            delete state.perFolder[key];
          }
        }
      })
      // --- prune stale "accepted for commit" selections when git
      // status changes (e.g. user committed or staged externally) ---
      .addCase(fetchGitStatus.fulfilled, (state, action) => {
        const ctx = state.perFolder[state.currentFolder];
        if (!ctx) return;
        const changed = new Set<string>();
        for (const f of action.payload.files) changed.add(f.path);
        for (const p of action.payload.untracked) changed.add(p);
        for (const path of Object.keys(ctx.acceptedFiles)) {
          if (!changed.has(path)) delete ctx.acceptedFiles[path];
        }
      })
      // --- openInTab ---
      .addCase(openInTab.pending, (state, action) => {
        const ctx = getCtx(state);
        const { path, viewMode, fileType } = action.meta.arg;
        ctx.tabs.push(emptyTab(path, viewMode, fileType));
        ctx.activeTabIndex = ctx.tabs.length - 1;
        ctx.activeSource = 'tab';
        state.expandedGaps = {};
        state.allExpanded = false;
      })
      .addCase(openInTab.fulfilled, (state, action) => {
        const ctx = getCtx(state);
        const { path, diff, plain } = action.payload;
        const tab = ctx.tabs.find((t) => t.path === path && t.loading);
        if (!tab) return;
        tab.loading = false;
        tab.error = null;

        if (isStaleGit(diff) && diff?.newFile != null) {
          tab.viewMode = 'plain';
          tab.fileType = null;
          tab.fileDiff = null;
          tab.plainFile = {
            content: diff.newFile,
            highlight: diff.newHighlight,
            tooLarge: false,
          };
          return;
        }

        tab.fileDiff = diff;
        tab.plainFile = plain;
      })
      .addCase(openInTab.rejected, (state, action) => {
        const ctx = getCtx(state);
        const { path } = action.meta.arg;
        const tab = ctx.tabs.find((t) => t.path === path && t.loading);
        if (tab) {
          tab.loading = false;
          tab.error = action.error.message ?? 'Unknown error';
        }
      })
      // --- loadMetaFile ---
      .addCase(loadMetaFile.pending, (state, action) => {
        const ctx = getCtx(state);
        const { path, type } = action.meta.arg;
        ctx.metaTab = emptyTab(path, 'diff', type);
        ctx.activeSource = 'meta';
        state.expandedGaps = {};
        state.allExpanded = false;
      })
      .addCase(loadMetaFile.fulfilled, (state, action) => {
        const ctx = getCtx(state);
        if (ctx.metaTab && ctx.metaTab.path === action.payload.path) {
          ctx.metaTab.loading = false;
          ctx.metaTab.fileDiff = action.payload.diff;
          ctx.metaTab.error = null;
        }
      })
      .addCase(loadMetaFile.rejected, (state, action) => {
        const ctx = getCtx(state);
        if (ctx.metaTab && ctx.metaTab.path === action.meta.arg.path) {
          ctx.metaTab.loading = false;
          ctx.metaTab.error = action.error.message ?? 'Unknown error';
        }
      })
      // --- commit ---
      .addCase(commitAccepted.pending, (state) => {
        state.commitLoading = true;
        state.commitError = null;
      })
      .addCase(commitAccepted.fulfilled, (state) => {
        const ctx = getCtx(state);
        state.commitLoading = false;
        ctx.acceptedFiles = {};
        ctx.tabs = [];
        ctx.activeTabIndex = -1;
        ctx.metaTab = null;
      })
      .addCase(commitAccepted.rejected, (state, action) => {
        state.commitLoading = false;
        state.commitError = action.error.message ?? 'Unknown error';
      })
      // --- fetchContentSearch ---
      .addCase(fetchContentSearch.pending, (state) => {
        state.contentSearchLoading = true;
      })
      .addCase(fetchContentSearch.fulfilled, (state, action) => {
        if (action.payload.query === state.contentSearchQuery) {
          state.contentSearchLoading = false;
          state.contentSearchResults = action.payload.results;
          state.contentSearchCursor = 0;
        }
      })
      .addCase(fetchContentSearch.rejected, (state) => {
        state.contentSearchLoading = false;
        state.contentSearchResults = [];
      });
  },
});

export const {
  setCurrentFolder,
  activateTab, removeTab, activateMetaSource,
  toggleAccepted, toggleConfigModal, closeConfigModal,
  openFuzzySearch, closeFuzzySearch, setFuzzySearchQuery, moveFuzzySearchCursor,
  openContentSearch, closeContentSearch, setContentSearchQuery, moveContentSearchCursor,
  cycleDiffMode, setDiffMode, toggleGap, toggleAllGaps,
  toggleDir, collapseDir, collapseDirDeep, moveTreeCursor, expandAncestors,
  addReviewComment, removeReviewComment, clearReviewComments,
  toggleReviewModal, closeReviewModal,
  openFolderPicker, closeFolderPicker, moveFolderPickerCursor,
} = uiSlice.actions;

// --- Selectors ---

export interface FileListEntry {
  path: string;
  type: 'tracked' | 'untracked';
}

export function selectFileList(state: { gitStatus: GitStatusState }): FileListEntry[] {
  const data = state.gitStatus.data;
  if (!data) return [];
  const tracked = data.files.map((f) => ({ path: f.path, type: 'tracked' as const }));
  const untracked = data.untracked.map((p) => ({ path: p, type: 'untracked' as const }));
  return [...tracked, ...untracked];
}

export const selectChangedPaths = createSelector(
  [(state: { gitStatus: GitStatusState }) => state.gitStatus.data],
  (data): Set<string> => {
    if (!data) return new Set();
    const set = new Set<string>();
    for (const f of data.files) set.add(f.path);
    for (const p of data.untracked) set.add(p);
    return set;
  },
);

export const selectVisibleRows = createSelector(
  [
    (state: RootState) => state.fileTree.files,
    (state: RootState) => state.ui.perFolder[state.ui.currentFolder]?.expandedDirs ?? {},
  ],
  (files, expandedDirs): TreeRow[] => buildVisibleRows(files, expandedDirs),
);

export interface FuzzyMatch {
  path: string;
  score: number;
  matches: number[]; // indices into path that matched
}

export const selectFuzzyResults = createSelector(
  [(state: RootState) => state.ui.fuzzySearchQuery, (state: RootState) => state.fileTree.files],
  (query, files): FuzzyMatch[] => {
    if (!query) return files.map((f) => ({ path: f, score: 0, matches: [] }));
    const results: FuzzyMatch[] = [];
    for (const file of files) {
      const m = fuzzyMatch(query, file);
      if (m) results.push({ path: file, score: m.score, matches: m.matches });
    }
    results.sort((a, b) => b.score - a.score);
  return results;
  },
);

export interface FlatContentMatch {
  filePath: string;
  match: ContentSearchMatch;
  isFirstInFile: boolean;
  flatIndex: number;
}

export const selectFlatContentMatches = createSelector(
  [(state: RootState) => state.ui.contentSearchResults],
  (results): FlatContentMatch[] => {
    const flat: FlatContentMatch[] = [];
    for (const file of results) {
      for (let i = 0; i < file.matches.length; i++) {
        flat.push({
          filePath: file.filePath,
          match: file.matches[i],
          isFirstInFile: i === 0,
          flatIndex: flat.length,
        });
      }
    }
    return flat;
  },
);

export const selectActiveView = createSelector(
  [
    (state: RootState) => selectPerFolder(state),
  ],
  (ctx): TabData | null => {
    if (ctx.activeSource === 'meta') return ctx.metaTab;
    if (ctx.activeTabIndex >= 0 && ctx.activeTabIndex < ctx.tabs.length) return ctx.tabs[ctx.activeTabIndex];
    return null;
  },
);

export const selectActiveFilePath = createSelector(
  [selectActiveView],
  (view): string | null => view?.path ?? null,
);

// --- Navigation thunks ---

export const revealFileInTree = (filePath: string) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(expandAncestors(filePath));
    const rows = selectVisibleRows(getState());
    const idx = rows.findIndex((r) => r.path === filePath);
    if (idx >= 0) dispatch(moveTreeCursor(idx));
  };

export const navigateMetaFile = (direction: 1 | -1) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState();
    const changedPaths = selectChangedPaths(state);
    if (changedPaths.size === 0) return;

    // Build full tree order (all dirs expanded) and filter to changed files
    const allExpanded: Record<string, boolean> = {};
    for (const f of state.fileTree.files) {
      const parts = f.split('/');
      for (let i = 1; i < parts.length; i++) {
        allExpanded[parts.slice(0, i).join('/')] = true;
      }
    }
    const allRows = buildVisibleRows(state.fileTree.files, allExpanded);
    const fileList = selectFileList(state);
    const typeMap = new Map(fileList.map((f) => [f.path, f.type]));
    const ordered = allRows
      .filter((r) => !r.isDir && changedPaths.has(r.path))
      .map((r) => ({ path: r.path, type: typeMap.get(r.path) ?? 'tracked' as const }));

    if (ordered.length === 0) return;

    const currentPath = getPerFolder(state).metaTab?.path ?? null;
    let idx: number;
    if (currentPath === null) {
      idx = direction === 1 ? 0 : ordered.length - 1;
    } else {
      const currentIdx = ordered.findIndex((f) => f.path === currentPath);
      if (currentIdx === -1) {
        idx = direction === 1 ? 0 : ordered.length - 1;
      } else {
        idx = (currentIdx + direction + ordered.length) % ordered.length;
      }
    }

    dispatch(revealFileInTree(ordered[idx].path));
    dispatch(loadMetaFile(ordered[idx]));
  };

export const cycleTab = (direction: 1 | -1) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const { tabs, activeTabIndex, activeSource } = getPerFolder(getState());
    if (tabs.length === 0) return;
    let next: number;
    if (activeSource !== 'tab' || activeTabIndex < 0) {
      next = direction === 1 ? 0 : tabs.length - 1;
    } else {
      next = (activeTabIndex + direction + tabs.length) % tabs.length;
    }
    dispatch(activateTab(next));
  };

export const closeCurrentTab = () =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const { activeSource, activeTabIndex, tabs } = getPerFolder(getState());
    if (activeSource !== 'tab' || tabs.length === 0 || activeTabIndex < 0) return;
    dispatch(removeTab(activeTabIndex));
  };

export const openFileInTab = (filePath: string) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(revealFileInTree(filePath));
    const state = getState();
    const ctx = getPerFolder(state);
    const existingIdx = ctx.tabs.findIndex((t) => t.path === filePath);
    if (existingIdx >= 0) {
      dispatch(activateTab(existingIdx));
      return;
    }
    const changedPaths = selectChangedPaths(state);
    if (changedPaths.has(filePath)) {
      const entry = selectFileList(state).find((f) => f.path === filePath);
      if (entry) dispatch(openInTab({ path: filePath, viewMode: 'diff', fileType: entry.type }));
    } else {
      dispatch(openInTab({ path: filePath, viewMode: 'plain', fileType: null }));
    }
  };

export const openTreeItem = () =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState();
    const rows = selectVisibleRows(state);
    const cursor = getPerFolder(state).treeCursor;
    if (cursor < 0 || cursor >= rows.length) return;

    const row = rows[cursor];
    if (row.isDir) {
      dispatch(toggleDir(row.path));
    } else {
      dispatch(openFileInTab(row.path));
    }
  };

/** Find parent dir path for a given tree row path. Returns empty string for root-level items. */
function getParentPath(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash > 0 ? path.substring(0, lastSlash) : '';
}

/** h — navigate cursor to the parent folder of the current item. */
export const navigateToParent = () =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState();
    const rows = selectVisibleRows(state);
    const cursor = getPerFolder(state).treeCursor;
    if (cursor < 0 || cursor >= rows.length) return;

    const parentPath = getParentPath(rows[cursor].path);
    if (!parentPath) return;

    const parentIdx = rows.findIndex((r) => r.path === parentPath && r.isDir);
    if (parentIdx >= 0) dispatch(moveTreeCursor(parentIdx));
  };

/** Ctrl+h — navigate to parent folder and collapse it. */
export const collapseParent = () =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState();
    const rows = selectVisibleRows(state);
    const cursor = getPerFolder(state).treeCursor;
    if (cursor < 0 || cursor >= rows.length) return;

    const parentPath = getParentPath(rows[cursor].path);
    if (!parentPath) return;

    dispatch(collapseDir(parentPath));
    // After collapsing, recompute visible rows and find the parent's new index.
    const newRows = selectVisibleRows(getState());
    const parentIdx = newRows.findIndex((r) => r.path === parentPath && r.isDir);
    if (parentIdx >= 0) dispatch(moveTreeCursor(parentIdx));
  };

/** Ctrl+Shift+h — navigate to parent folder, collapse it and all directories inside it. */
export const deepCollapseParent = () =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState();
    const rows = selectVisibleRows(state);
    const cursor = getPerFolder(state).treeCursor;
    if (cursor < 0 || cursor >= rows.length) return;

    const parentPath = getParentPath(rows[cursor].path);
    if (!parentPath) return;

    dispatch(collapseDirDeep(parentPath));
    // After collapsing, recompute visible rows and find the parent's new index.
    const newRows = selectVisibleRows(getState());
    const parentIdx = newRows.findIndex((r) => r.path === parentPath && r.isDir);
    if (parentIdx >= 0) dispatch(moveTreeCursor(parentIdx));
  };

// --- Store ---

export const store = configureStore({
  reducer: {
    config: configSlice.reducer,
    theme: themeSlice.reducer,
    gitStatus: gitStatusSlice.reducer,
    fileTree: fileTreeSlice.reducer,
    ui: uiSlice.reducer,
    folder: folderSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
