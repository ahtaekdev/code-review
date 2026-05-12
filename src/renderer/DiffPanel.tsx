import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useAppSelector, useAppDispatch, selectActiveView, selectActiveFilePath, toggleGap, toggleAllGaps, addReviewComment, isStaleGit } from './store';
import { matchesShortcut, formatShortcut } from './shortcuts';
import type { DiffMode, ReviewComment } from './store';
import { MONO_FONT } from '../shared/theme';
import { UnifiedView } from './UnifiedView';
import { SplitView } from './SplitView';
import { NewestView } from './NewestView';
import { PlainView } from './PlainView';

const MODE_LABELS: Record<DiffMode, string> = {
  unified: 'Unified',
  split: 'Split',
  newest: 'Newest',
};

const SELECTION_BG = 'color-mix(in srgb, var(--cr-accent-fg) 18%, transparent)';

function getLineNoFromEvent(e: MouseEvent | React.MouseEvent): number | null {
  const el = e.target as HTMLElement;
  const lineNo = el.getAttribute('data-line-no');
  return lineNo != null ? parseInt(lineNo, 10) : null;
}

function getCodeSnippet(
  newFile: string | null | undefined,
  plainContent: string | null | undefined,
  startLine: number,
  endLine: number,
): string {
  const text = newFile ?? plainContent ?? '';
  const lines = text.split(/\r?\n/);
  return lines.slice(startLine - 1, endLine).join('\n');
}

export const DiffPanel: React.FC = () => {
  const dispatch = useAppDispatch();
  const view = useAppSelector(selectActiveView);
  const filePath = useAppSelector(selectActiveFilePath);
  const shortcuts = useAppSelector((s) => s.config.data.shortcuts);
  const diffMode = useAppSelector((s) => s.ui.diffMode);
  const expandedGaps = useAppSelector((s) => s.ui.expandedGaps);
  const allExpanded = useAppSelector((s) => s.ui.allExpanded);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [selecting, setSelecting] = useState(false);
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  const [commentBoxLines, setCommentBoxLines] = useState<{ start: number; end: number } | null>(null);
  const [commentText, setCommentText] = useState('');
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  // clear selection when active file changes
  useEffect(() => {
    setSelecting(false);
    setSelStart(null);
    setSelEnd(null);
    setCommentBoxLines(null);
    setCommentText('');
  }, [filePath]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const line = getLineNoFromEvent(e);
    if (line == null) return;
    e.preventDefault();
    setSelecting(true);
    setSelStart(line);
    setSelEnd(line);
    setCommentBoxLines(null);
    setCommentText('');
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!selecting) return;
    const line = getLineNoFromEvent(e);
    if (line != null) setSelEnd(line);
  }, [selecting]);

  const handleMouseUp = useCallback(() => {
    if (!selecting || selStart == null || selEnd == null) return;
    setSelecting(false);
    const start = Math.min(selStart, selEnd);
    const end = Math.max(selStart, selEnd);
    setCommentBoxLines({ start, end });
    setTimeout(() => commentInputRef.current?.focus(), 0);
  }, [selecting, selStart, selEnd]);

  // global mouseup to catch release outside the panel
  useEffect(() => {
    if (!selecting) return;
    const onUp = () => {
      if (selStart != null && selEnd != null) {
        setSelecting(false);
        const start = Math.min(selStart, selEnd);
        const end = Math.max(selStart, selEnd);
        setCommentBoxLines({ start, end });
        setTimeout(() => commentInputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [selecting, selStart, selEnd]);

  const submitComment = useCallback(() => {
    if (!commentBoxLines || !commentText.trim() || !filePath || !view) return;
    const snippet = getCodeSnippet(
      view.fileDiff?.newFile,
      view.plainFile?.content,
      commentBoxLines.start,
      commentBoxLines.end,
    );
    const comment: ReviewComment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      filePath,
      startLine: commentBoxLines.start,
      endLine: commentBoxLines.end,
      codeSnippet: snippet,
      comment: commentText.trim(),
    };
    dispatch(addReviewComment(comment));
    setCommentBoxLines(null);
    setCommentText('');
    setSelStart(null);
    setSelEnd(null);
  }, [commentBoxLines, commentText, filePath, view, dispatch]);

  const cancelComment = useCallback(() => {
    setCommentBoxLines(null);
    setCommentText('');
    setSelStart(null);
    setSelEnd(null);
  }, []);

  // highlight selected lines via CSS
  const selMin = selStart != null && selEnd != null ? Math.min(selStart, selEnd) : null;
  const selMax = selStart != null && selEnd != null ? Math.max(selStart, selEnd) : null;
  const highlightMin = commentBoxLines?.start ?? selMin;
  const highlightMax = commentBoxLines?.end ?? selMax;

  // build a style tag for selection highlight
  const selectionStyle = highlightMin != null && highlightMax != null
    ? Array.from({ length: highlightMax - highlightMin + 1 }, (_, i) => {
        const lineNo = highlightMin + i;
        return `[data-line-no="${lineNo}"]`;
      }).map((sel) => `${sel} { background: ${SELECTION_BG}; }`).join('\n')
      + '\n' + Array.from({ length: highlightMax - highlightMin + 1 }, (_, i) => {
        const lineNo = highlightMin + i;
        return `[data-line-no="${lineNo}"]`;
      }).map((sel) => `${sel} + * { background: ${SELECTION_BG}; }`).join('\n')
    : '';

  if (!view) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span style={{ fontSize: 14, color: 'var(--cr-muted-fg)' }}>Select a file to view</span>
      </div>
    );
  }

  const { path: selectedFile, viewMode, fileDiff, plainFile, loading: viewLoading, error: viewError, fileType } = view;
  const handleToggleGap = (gapId: string) => dispatch(toggleGap(gapId));
  const isDiff = viewMode === 'diff';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {selectionStyle && <style>{selectionStyle}</style>}
      <div style={{
        padding: '6px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '1px solid var(--cr-border)',
        background: 'var(--cr-bg)',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: 13, fontFamily: MONO_FONT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedFile}
        </span>

        {isDiff && (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--cr-muted-fg)' }}>
            {MODE_LABELS[diffMode]}
          </span>
        )}
      </div>

      <div
        id="diff-scroll-container"
        ref={scrollRef}
        style={{ flex: 1, overflow: 'auto', padding: 0, position: 'relative', cursor: selecting ? 'ns-resize' : undefined }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {viewLoading && <div style={{ padding: 16, color: 'var(--cr-muted-fg)' }}>Loading...</div>}
        {viewError && <div style={{ padding: 16, color: 'var(--cr-danger-fg)' }}>{viewError}</div>}

        {!viewLoading && !viewError && !isDiff && plainFile && !plainFile.tooLarge && (
          <PlainView content={plainFile.content} highlight={plainFile.highlight} />
        )}
        {!viewLoading && !viewError && !isDiff && plainFile?.tooLarge && (
          <div style={{ padding: 16, color: 'var(--cr-warning-fg)' }}>
            File exceeds 50 KB — skipped to keep the UI responsive.
          </div>
        )}

        {!viewLoading && !viewError && isDiff && fileDiff?.tooLarge && (
          <div style={{ padding: 16, color: 'var(--cr-warning-fg)' }}>
            File exceeds 50 KB — skipped to keep the UI responsive.
          </div>
        )}
        {!viewLoading && !viewError && isDiff && !fileDiff?.tooLarge && fileDiff === null && (
          <div style={{ padding: 16, color: 'var(--cr-muted-fg)' }}>
            {fileType === 'tracked' ? 'No diff available (file may be deleted).' : 'Empty file.'}
          </div>
        )}
        {!viewLoading && !viewError && isDiff && isStaleGit(fileDiff) && (
          <div style={{ padding: 16, color: 'var(--cr-muted-fg)' }}>
            File is no longer modified.
          </div>
        )}
        {!viewLoading && !viewError && isDiff && fileDiff && !fileDiff.tooLarge && fileDiff.hunks.length > 0 && diffMode === 'unified' && (
          <UnifiedView
            hunks={fileDiff.hunks}
            oldFile={fileDiff.oldFile}
            newFile={fileDiff.newFile}
            oldHighlight={fileDiff.oldHighlight}
            newHighlight={fileDiff.newHighlight}
            expandedGaps={expandedGaps}
            allExpanded={allExpanded}
            onToggleGap={handleToggleGap}
          />
        )}
        {!viewLoading && !viewError && isDiff && fileDiff && !fileDiff.tooLarge && fileDiff.hunks.length > 0 && diffMode === 'split' && (
          <SplitView
            hunks={fileDiff.hunks}
            oldFile={fileDiff.oldFile}
            newFile={fileDiff.newFile}
            oldHighlight={fileDiff.oldHighlight}
            newHighlight={fileDiff.newHighlight}
            expandedGaps={expandedGaps}
            allExpanded={allExpanded}
            onToggleGap={handleToggleGap}
          />
        )}
        {!viewLoading && !viewError && isDiff && fileDiff && !fileDiff.tooLarge && fileDiff.hunks.length > 0 && diffMode === 'newest' && (
          <NewestView hunks={fileDiff.hunks} newFile={fileDiff.newFile} newHighlight={fileDiff.newHighlight} />
        )}

        {commentBoxLines && (
          <div style={{
            margin: '4px 16px 16px',
            border: '1px solid var(--cr-border)',
            borderRadius: 6,
            background: 'var(--cr-bg)',
            padding: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}>
            <div style={{ fontSize: 12, color: 'var(--cr-muted-fg)', marginBottom: 6 }}>
              Comment on {commentBoxLines.start === commentBoxLines.end
                ? `line ${commentBoxLines.start}`
                : `lines ${commentBoxLines.start}-${commentBoxLines.end}`}
            </div>
            <textarea
              ref={commentInputRef}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (matchesShortcut(e.nativeEvent, shortcuts.submitComment)) {
                  e.preventDefault();
                  submitComment();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelComment();
                }
              }}
              placeholder="Write your review comment..."
              style={{
                width: '100%',
                boxSizing: 'border-box',
                minHeight: 60,
                padding: '8px 10px',
                fontSize: 13,
                fontFamily: 'system-ui, sans-serif',
                background: 'color-mix(in srgb, var(--cr-bg) 80%, var(--cr-fg) 20%)',
                color: 'var(--cr-fg)',
                border: '1px solid var(--cr-border)',
                borderRadius: 4,
                outline: 'none',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={cancelComment}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  border: '1px solid var(--cr-border)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background: 'transparent',
                  color: 'var(--cr-muted-fg)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={submitComment}
                disabled={!commentText.trim()}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  border: '1px solid var(--cr-border)',
                  borderRadius: 4,
                  cursor: commentText.trim() ? 'pointer' : 'default',
                  background: commentText.trim() ? 'var(--cr-accent-bg)' : 'transparent',
                  color: commentText.trim() ? 'var(--cr-accent-fg)' : 'var(--cr-muted-fg)',
                }}
              >
                Add Comment ({formatShortcut(shortcuts.submitComment)})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
