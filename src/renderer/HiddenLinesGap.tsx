import React from 'react';
import { GAP_REVEAL_LINES } from './diffGaps';

interface Props {
  count: number;
  index: number;
  shortcutNumber?: number;
}

const containerStyle: React.CSSProperties = {
  color: 'var(--cr-muted-fg)',
  padding: '6px 12px',
  fontSize: 12,
  borderTop: '1px dashed var(--cr-border)',
  borderBottom: '1px dashed var(--cr-border)',
  background: 'color-mix(in srgb, var(--cr-accent-bg) 5%, transparent)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
};

const firstStyle: React.CSSProperties = {
  ...containerStyle,
  borderTop: 'none',
};

const countStyle: React.CSSProperties = {
  color: 'var(--cr-accent-fg)',
  fontWeight: 700,
};

const detailStyle: React.CSSProperties = {
  color: 'var(--cr-muted-fg)',
};

const shortcutsStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  marginLeft: 'auto',
  flexWrap: 'wrap',
  color: 'var(--cr-muted-fg)',
};

const keyStyle: React.CSSProperties = {
  color: 'var(--cr-accent-fg)',
  fontWeight: 700,
};

const HiddenLinesGap: React.FC<Props> = ({
  count,
  index,
  shortcutNumber,
}) => (
  <div style={index === 0 ? firstStyle : containerStyle}>
    <span style={detailStyle}>
      <span style={countStyle}>{count}</span> {count === 1 ? 'line' : 'lines'} hidden
    </span>
    {shortcutNumber != null && (
      <span style={shortcutsStyle}>
        <span><span style={keyStyle}>{shortcutNumber}</span> top {GAP_REVEAL_LINES}</span>
        <span><span style={keyStyle}>Ctrl+{shortcutNumber}</span> bottom {GAP_REVEAL_LINES}</span>
        <span><span style={keyStyle}>Ctrl+Shift+{shortcutNumber}</span> all/reset</span>
      </span>
    )}
  </div>
);

export default HiddenLinesGap;
