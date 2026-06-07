import React, { useCallback, useEffect } from 'react';
import {
  useAppDispatch,
  useAppSelector,
  removeReviewComment,
  clearReviewComments,
  closeReviewModal,
  selectPerFolder,
} from './store';
import { MONO_FONT } from '../shared/theme';
import { matchesShortcut, formatShortcut } from './shortcuts';
import { formatReviewComments } from './reviewComments';

export const ReviewModal: React.FC = () => {
  const dispatch = useAppDispatch();
  const comments = useAppSelector((s) => selectPerFolder(s).reviewComments);
  const shortcuts = useAppSelector((s) => s.config.data.shortcuts);

  const handleCopy = useCallback(() => {
    const text = formatReviewComments(comments);
    navigator.clipboard.writeText(text);
  }, [comments]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dispatch(closeReviewModal());
      } else if (matchesShortcut(e, shortcuts.copyReviewComments)) {
        e.preventDefault();
        if (comments.length > 0) handleCopy();
      } else if (matchesShortcut(e, shortcuts.clearReviewComments)) {
        e.preventDefault();
        if (comments.length > 0) dispatch(clearReviewComments());
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [dispatch, comments, handleCopy, shortcuts]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dispatch(closeReviewModal());
      }}
    >
      <div
        style={{
          background: 'var(--cr-bg)',
          borderRadius: 8,
          width: 600,
          maxHeight: 'calc(100vh - 120px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          border: '1px solid var(--cr-border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid var(--cr-border)',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--cr-fg)' }}>
            Review Comments ({comments.length})
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {comments.length === 0 && (
            <div style={{ padding: '24px 20px', fontSize: 12, color: 'var(--cr-muted-fg)', textAlign: 'center' }}>
              No comments yet. Select line numbers in a file to add review comments.
            </div>
          )}
          {comments.map((c) => {
            const lineRange = c.startLine === c.endLine ? `line ${c.startLine}` : `lines ${c.startLine}-${c.endLine}`;
            return (
              <div
                key={c.id}
                style={{
                  padding: '10px 20px',
                  borderBottom: '1px solid var(--cr-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontFamily: MONO_FONT, color: 'var(--cr-accent-fg)', flex: 1 }}>
                    {c.filePath} ({lineRange})
                  </span>
                  <button
                    onClick={() => dispatch(removeReviewComment(c.id))}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--cr-muted-fg)',
                      fontSize: 14,
                      padding: '0 4px',
                      lineHeight: 1,
                    }}
                    title="Remove comment"
                  >
                    ×
                  </button>
                </div>
                <pre
                  style={{
                    fontFamily: MONO_FONT,
                    fontSize: 12,
                    lineHeight: 1.5,
                    margin: '0 0 6px',
                    padding: '6px 8px',
                    background: 'color-mix(in srgb, var(--cr-fg) 6%, transparent)',
                    borderRadius: 4,
                    overflow: 'auto',
                    maxHeight: 120,
                    whiteSpace: 'pre',
                    color: 'var(--cr-fg)',
                  }}
                >
                  {c.codeSnippet}
                </pre>
                <div style={{ fontSize: 12, color: 'var(--cr-fg)', whiteSpace: 'pre-wrap' }}>{c.comment}</div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            padding: '6px 12px',
            borderTop: '1px solid var(--cr-border)',
            fontSize: 12,
            color: 'var(--cr-muted-fg)',
          }}
        >
          {formatShortcut(shortcuts.copyReviewComments)} copy &middot; {formatShortcut(shortcuts.clearReviewComments)} clear &middot; Esc close
        </div>
      </div>
    </div>
  );
};
