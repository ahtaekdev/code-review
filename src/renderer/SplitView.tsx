import React from 'react';
import type { DiffHunk, DiffLine, HighlightToken } from '../shared/rpc';
import { diffWordsWithSpace, type Change } from '../external-lib/diff-words';
import { MONO_FONT } from '../shared/theme';
import HiddenLinesGap from './HiddenLinesGap';
import {
  buildDiffRenderSections,
  getGapHiddenCount,
  type DiffGapState,
} from './diffGaps';

interface Props {
  hunks: DiffHunk[];
  oldFile: string | null;
  newFile: string | null;
  oldHighlight?: HighlightToken[][];
  newHighlight?: HighlightToken[][];
  gapState: DiffGapState | null;
  gapShortcutNumbers: Record<string, number>;
}

interface RowEntry {
  content: string;
  lineNo?: number;
  type: 'context' | 'add' | 'remove' | 'blank';
}

interface RowPair {
  left: RowEntry;
  right: RowEntry;
}

function buildRowPairs(lines: DiffLine[]): RowPair[] {
  const pairs: RowPair[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.type === 'context') {
      pairs.push({
        left: { content: line.content, lineNo: line.oldNo, type: 'context' },
        right: { content: line.content, lineNo: line.newNo, type: 'context' },
      });
      i++;
    } else if (line.type === 'remove') {
      const removes: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'remove') {
        removes.push(lines[i]);
        i++;
      }
      const adds: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'add') {
        adds.push(lines[i]);
        i++;
      }
      const maxLen = Math.max(removes.length, adds.length);
      for (let j = 0; j < maxLen; j++) {
        const rm = j < removes.length ? removes[j] : null;
        const ad = j < adds.length ? adds[j] : null;
        pairs.push({
          left: rm
            ? { content: rm.content, lineNo: rm.oldNo, type: 'remove' }
            : { content: '', type: 'blank' },
          right: ad
            ? { content: ad.content, lineNo: ad.newNo, type: 'add' }
            : { content: '', type: 'blank' },
        });
      }
    } else {
      pairs.push({
        left: { content: '', type: 'blank' },
        right: { content: line.content, lineNo: line.newNo, type: 'add' },
      });
      i++;
    }
  }
  return pairs;
}

function getIntraLineChanges(
  removeContent: string,
  addContent: string,
): { leftParts: Change[]; rightParts: Change[] } {
  const changes = diffWordsWithSpace(removeContent, addContent);
  const leftParts: Change[] = [];
  const rightParts: Change[] = [];
  for (const c of changes) {
    if (!c.added && !c.removed) {
      leftParts.push(c);
      rightParts.push(c);
    } else if (c.removed) {
      leftParts.push(c);
    } else if (c.added) {
      rightParts.push(c);
    }
  }
  return { leftParts, rightParts };
}

const gutterStyle: React.CSSProperties = {
  width: 44,
  textAlign: 'right',
  paddingRight: 8,
  color: 'var(--cr-muted-fg)',
  userSelect: 'none',
  flexShrink: 0,
};

const contentStyle: React.CSSProperties = {
  padding: '0 8px',
  flex: 1,
  minWidth: 0,
  whiteSpace: 'pre',
};

const preBase: React.CSSProperties = {
  fontFamily: MONO_FONT,
  fontSize: 13,
  lineHeight: 1.6,
  margin: 0,
  display: 'flex',
};

const ADD_WORD_BG = 'color-mix(in srgb, var(--cr-success-fg) 30%, transparent)';
const REMOVE_WORD_BG = 'color-mix(in srgb, var(--cr-danger-fg) 30%, transparent)';

function renderHighlightedTokens(tokens: HighlightToken[]): React.ReactNode {
  return tokens.map((t, i) => (
    <span key={i} style={{ color: t.color }}>{t.content}</span>
  ));
}

function renderIntraParts(parts: Change[]): React.ReactNode {
  return parts.map((part, i) => {
    let bg: string | undefined;
    if (part.removed) bg = REMOVE_WORD_BG;
    else if (part.added) bg = ADD_WORD_BG;
    return (
      <span key={i} style={bg ? { background: bg } : undefined}>
        {part.value}
      </span>
    );
  });
}

function mergeHighlightWithIntra(
  tokens: HighlightToken[],
  changes: Change[],
  mode: 'add' | 'remove',
): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  let tokenIdx = 0;
  let tokenOffset = 0;
  let nodeKey = 0;

  for (const change of changes) {
    if (change.removed && mode === 'add') continue;
    if (change.added && mode === 'remove') continue;

    const isChanged = change.added || change.removed;
    const bg = isChanged
      ? (mode === 'add' ? ADD_WORD_BG : REMOVE_WORD_BG)
      : undefined;

    let remaining = change.value.length;
    while (remaining > 0 && tokenIdx < tokens.length) {
      const token = tokens[tokenIdx];
      const available = token.content.length - tokenOffset;
      const take = Math.min(remaining, available);
      const text = token.content.slice(tokenOffset, tokenOffset + take);

      nodes.push(
        <span key={nodeKey++} style={{ color: token.color, background: bg }}>
          {text}
        </span>,
      );

      remaining -= take;
      tokenOffset += take;
      if (tokenOffset >= token.content.length) {
        tokenIdx++;
        tokenOffset = 0;
      }
    }
  }

  return nodes;
}

function renderRow(
  entry: RowEntry,
  key: string,
  intraHighlight?: Change[],
  tokens?: HighlightToken[],
  lineNoAttr?: boolean,
): React.ReactNode {
  if (entry.type === 'blank') {
    return (
      <pre key={key} style={preBase}>
        <span style={gutterStyle} />
        <span style={contentStyle}>{' '}</span>
      </pre>
    );
  }

  let bg: string | undefined;
  if (entry.type === 'remove') {
    bg = 'color-mix(in srgb, var(--cr-danger-fg) 12%, transparent)';
  } else if (entry.type === 'add') {
    bg = 'color-mix(in srgb, var(--cr-success-fg) 12%, transparent)';
  }

  let contentEl: React.ReactNode;
  if (intraHighlight && tokens) {
    const mode = entry.type === 'add' ? 'add' : 'remove';
    contentEl = mergeHighlightWithIntra(tokens, intraHighlight, mode as 'add' | 'remove');
  } else if (intraHighlight) {
    contentEl = renderIntraParts(intraHighlight);
  } else if (tokens) {
    contentEl = renderHighlightedTokens(tokens);
  } else {
    contentEl = entry.content || ' ';
  }

  return (
    <pre key={key} style={{ ...preBase, background: bg }}>
      <span style={gutterStyle} {...(lineNoAttr && entry.lineNo != null ? { 'data-line-no': entry.lineNo } : {})}>{entry.lineNo ?? ''}</span>
      <span style={contentStyle}>{contentEl}</span>
    </pre>
  );
}

function renderContextRow(
  content: string,
  lineNo: number,
  key: string,
  tokens?: HighlightToken[],
  lineNoAttr?: boolean,
): React.ReactNode {
  return (
    <pre key={key} style={preBase}>
      <span style={gutterStyle} {...(lineNoAttr ? { 'data-line-no': lineNo } : {})}>{lineNo}</span>
      <span style={contentStyle}>
        {tokens ? renderHighlightedTokens(tokens) : (content || ' ')}
      </span>
    </pre>
  );
}

function renderPadRow(key: string): React.ReactNode {
  return (
    <pre key={key} style={preBase}>
      <span style={gutterStyle} />
      <span style={contentStyle}>{' '}</span>
    </pre>
  );
}

export const SplitView: React.FC<Props> = ({
  hunks,
  oldFile,
  newFile,
  oldHighlight,
  newHighlight,
  gapState,
  gapShortcutNumbers,
}) => {
  const leftRef = React.useRef<HTMLDivElement>(null);
  const rightRef = React.useRef<HTMLDivElement>(null);
  const scrollSource = React.useRef<'left' | 'right' | null>(null);

  const handleScroll = React.useCallback((source: 'left' | 'right') => {
    if (scrollSource.current && scrollSource.current !== source) return;
    scrollSource.current = source;
    const from = source === 'left' ? leftRef.current : rightRef.current;
    const to = source === 'left' ? rightRef.current : leftRef.current;
    if (from && to) {
      to.scrollTop = from.scrollTop;
    }
    requestAnimationFrame(() => {
      scrollSource.current = null;
    });
  }, []);

  const oldLines = React.useMemo(() => oldFile?.split('\n') ?? [], [oldFile]);
  const newLines = React.useMemo(() => newFile?.split('\n') ?? [], [newFile]);
  const sections = React.useMemo(() => buildDiffRenderSections(hunks, gapState), [hunks, gapState]);

  const leftNodes: React.ReactNode[] = [];
  const rightNodes: React.ReactNode[] = [];

  sections.forEach((section) => {
    if (section.kind === 'context') {
      for (let i = 0; i < section.count; i++) {
        const oldNo = section.oldStart + i > 0 && section.oldStart + i <= oldLines.length ? section.oldStart + i : undefined;
        const newNo = section.newStart + i > 0 && section.newStart + i <= newLines.length ? section.newStart + i : undefined;

        if (oldNo != null) {
          leftNodes.push(renderContextRow(
            oldLines[oldNo - 1],
            oldNo,
            `${section.key}-l${i}`,
            oldHighlight?.[oldNo - 1],
          ));
        } else {
          leftNodes.push(renderPadRow(`${section.key}-lp${i}`));
        }

        if (newNo != null) {
          rightNodes.push(renderContextRow(
            newLines[newNo - 1],
            newNo,
            `${section.key}-r${i}`,
            newHighlight?.[newNo - 1],
            true,
          ));
        } else {
          rightNodes.push(renderPadRow(`${section.key}-rp${i}`));
        }
      }
    } else if (section.kind === 'gap') {
      const gapIndex = Number(section.gap.id.replace('gap-', '')) || 0;
      const gapEl = (key: string) => (
        <HiddenLinesGap
          key={key}
          count={getGapHiddenCount(section.gap)}
          index={gapIndex}
          shortcutNumber={gapShortcutNumbers[section.gap.id]}
        />
      );
      leftNodes.push(gapEl(`${section.key}-l`));
      rightNodes.push(gapEl(`${section.key}-r`));
    } else {
      const pairs = buildRowPairs(section.hunk.lines);
      pairs.forEach((pair, pi) => {
        let leftHL: Change[] | undefined;
        let rightHL: Change[] | undefined;

        if (pair.left.type === 'remove' && pair.right.type === 'add') {
          const { leftParts, rightParts } = getIntraLineChanges(
            pair.left.content,
            pair.right.content,
          );
          leftHL = leftParts;
          rightHL = rightParts;
        }

        const leftTokens = pair.left.lineNo != null ? oldHighlight?.[pair.left.lineNo - 1] : undefined;
        const rightTokens = pair.right.lineNo != null ? newHighlight?.[pair.right.lineNo - 1] : undefined;

        leftNodes.push(renderRow(pair.left, `h${section.hunkIndex}-l${pi}`, leftHL, leftTokens, false));
        rightNodes.push(renderRow(pair.right, `h${section.hunkIndex}-r${pi}`, rightHL, rightTokens, true));
      });
    }
  });

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div
        ref={leftRef}
        data-split-scroll
        style={{ flex: 1, overflow: 'auto', borderRight: '1px solid var(--cr-border)' }}
        onScroll={() => handleScroll('left')}
      >
        {leftNodes}
      </div>
      <div
        ref={rightRef}
        data-split-scroll
        style={{ flex: 1, overflow: 'auto' }}
        onScroll={() => handleScroll('right')}
      >
        {rightNodes}
      </div>
    </div>
  );
};
