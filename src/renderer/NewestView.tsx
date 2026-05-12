import React from 'react';
import type { DiffHunk, HighlightToken } from '../shared/rpc';
import { MONO_FONT } from '../shared/theme';

interface Props {
  hunks: DiffHunk[];
  newFile: string | null;
  newHighlight?: HighlightToken[][];
}

function changedNewLineNumbers(hunks: DiffHunk[]): Set<number> {
  const set = new Set<number>();
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'add' && line.newNo != null) {
        set.add(line.newNo);
      }
    }
  }
  return set;
}

const gutterStyle: React.CSSProperties = {
  width: 50,
  textAlign: 'right',
  paddingRight: 8,
  color: 'var(--cr-muted-fg)',
  userSelect: 'none',
  flexShrink: 0,
};

const contentStyle: React.CSSProperties = {
  padding: '0 12px',
  flex: 1,
  minWidth: 0,
  whiteSpace: 'pre',
};

export const NewestView: React.FC<Props> = ({ hunks, newFile, newHighlight }) => {
  if (newFile === null) {
    return (
      <div style={{ padding: 16, color: 'var(--cr-muted-fg)' }}>File was deleted</div>
    );
  }

  const changed = changedNewLineNumbers(hunks);
  const lines = newFile.split(/\r?\n/);

  return (
    <pre
      style={{
        fontFamily: MONO_FONT,
        fontSize: 13,
        lineHeight: 1.6,
        margin: 0,
      }}
    >
      {lines.map((text, i) => {
        const lineNo = i + 1;
        const isChanged = changed.has(lineNo);
        const tokens = newHighlight?.[i];
        return (
          <div
            key={lineNo}
            style={{
              display: 'flex',
              background: isChanged
                ? 'color-mix(in srgb, var(--cr-success-fg) 12%, transparent)'
                : undefined,
            }}
          >
            <span style={gutterStyle} data-line-no={lineNo}>{lineNo}</span>
            <span style={contentStyle}>
              {tokens
                ? tokens.map((t, j) => <span key={j} style={{ color: t.color }}>{t.content}</span>)
                : (text || ' ')}
            </span>
          </div>
        );
      })}
    </pre>
  );
};
