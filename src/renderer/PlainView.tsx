import React from 'react';
import type { HighlightToken } from '../shared/rpc';
import { MONO_FONT } from './DiffView';

interface Props {
  content: string;
  highlight?: HighlightToken[][];
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

export const PlainView: React.FC<Props> = ({ content, highlight }) => {
  const lines = content.split(/\r?\n/);

  return (
    <pre style={{ fontFamily: MONO_FONT, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
      {lines.map((text, i) => {
        const lineNo = i + 1;
        const tokens = highlight?.[i];
        return (
          <div key={lineNo} style={{ display: 'flex' }}>
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
