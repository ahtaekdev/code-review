export interface ShortcutConfig {
  nextFile: string;
  prevFile: string;
  toggleInclude: string;
  commit: string;
  showConfig: string;
  cycleDiffMode: string;
  nextTab: string;
  prevTab: string;
  closeTab: string;
  fuzzySearch: string;
  contentSearch: string;
  showReview: string;
  copyReviewComments: string;
  clearReviewComments: string;
  toggleAllGaps: string;
  openFolder: string;
  newFolder: string;
  nextActiveFolder: string;
  prevActiveFolder: string;
  // Diff panel scrolling
  scrollDown: string;
  scrollUp: string;
  pageDown: string;
  pageUp: string;
  // Tree navigation
  treeCursorDown: string;
  treeCursorUp: string;
  treeOpen: string;
  treeParent: string;
  treeCollapseParent: string;
  treeDeepCollapse: string;
  // Review comments
  submitComment: string;
  // Folder picker
  folderRemove: string;
  folderToggleActive: string;
}

export interface AppConfig {
  shortcuts: ShortcutConfig;
  pathToTheme?: string;
  knownFolders?: string[];
  activeFolders?: string[];
}

export const DEFAULT_CONFIG: AppConfig = {
  shortcuts: {
    nextFile: 'ctrl+j',
    prevFile: 'ctrl+k',
    toggleInclude: 'ctrl+i',
    commit: 'ctrl+enter',
    showConfig: 'ctrl+q',
    cycleDiffMode: 'ctrl+\\',
    nextTab: 'ctrl+=',
    prevTab: 'ctrl+-',
    closeTab: 'ctrl+0',
    fuzzySearch: 'ctrl+p',
    contentSearch: 'ctrl+shift+f',
    showReview: 'ctrl+e',
    copyReviewComments: 'c',
    clearReviewComments: 'x',
    toggleAllGaps: 'ctrl+;',
    openFolder: 'ctrl+o',
    newFolder: 'ctrl+n',
    nextActiveFolder: 'ctrl+]',
    prevActiveFolder: 'ctrl+[',
    scrollDown: 'arrowdown',
    scrollUp: 'arrowup',
    pageDown: 'pagedown|ctrl+arrowdown',
    pageUp: 'pageup|ctrl+arrowup',
    treeCursorDown: 'j|arrowdown',
    treeCursorUp: 'k|arrowup',
    treeOpen: 'enter',
    treeParent: 'h',
    treeCollapseParent: 'ctrl+h',
    treeDeepCollapse: 'ctrl+shift+h',
    submitComment: 'ctrl+enter|meta+enter',
    folderRemove: 'ctrl+t',
    folderToggleActive: 'ctrl+a',
  },
  knownFolders: [],
  activeFolders: [],
};

export const SHORTCUT_LABELS: Record<keyof ShortcutConfig, string> = {
  nextFile: 'Next changed file (meta tab)',
  prevFile: 'Previous changed file (meta tab)',
  nextTab: 'Next tab',
  prevTab: 'Previous tab',
  closeTab: 'Close tab',
  toggleInclude: 'Include / Exclude file',
  commit: 'Commit accepted files',
  showConfig: 'Show shortcuts',
  cycleDiffMode: 'Cycle diff mode',
  fuzzySearch: 'Fuzzy file search',
  contentSearch: 'Search file contents',
  showReview: 'Show review comments',
  copyReviewComments: 'Copy review comments',
  clearReviewComments: 'Clear review comments',
  toggleAllGaps: 'Expand / Collapse all',
  openFolder: 'Open folder picker',
  newFolder: 'Add new folder',
  nextActiveFolder: 'Next active folder',
  prevActiveFolder: 'Previous active folder',
  scrollDown: 'Scroll diff down',
  scrollUp: 'Scroll diff up',
  pageDown: 'Scroll diff page down',
  pageUp: 'Scroll diff page up',
  treeCursorDown: 'File tree cursor down',
  treeCursorUp: 'File tree cursor up',
  treeOpen: 'Open selected file',
  treeParent: 'Navigate to parent',
  treeCollapseParent: 'Collapse parent',
  treeDeepCollapse: 'Deep collapse parent',
  submitComment: 'Submit review comment',
  folderRemove: 'Remove folder',
  folderToggleActive: 'Toggle folder active',
};
