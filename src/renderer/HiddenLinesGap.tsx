import React from 'react';

interface Props {
  count: number;
  index: number;
  onClick: () => void;
}

const style: React.CSSProperties = {
  color: 'var(--cr-accent-fg)',
  cursor: 'pointer',
  padding: '4px 12px',
  fontSize: 12,
  borderTop: '1px dashed var(--cr-border)',
  borderBottom: '1px dashed var(--cr-border)',
};

const firstStyle: React.CSSProperties = {
  ...style,
  borderTop: 'none',
};

const HiddenLinesGap: React.FC<Props> = ({ count, index, onClick }) => (
  <div onClick={onClick} style={index === 0 ? firstStyle : style}>
    ⋯ {count} hidden lines ⋯
  </div>
);

export default HiddenLinesGap;
