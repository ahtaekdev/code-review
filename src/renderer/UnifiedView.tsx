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

const gutterStyle: React.CSSProperties = {
  width: 50,
  textAlign: 'right',
  paddingRight: 8,
  userSelect: 'none',
  color: 'var(--cr-muted-fg)',
  flexShrink: 0,
};

const contentBaseStyle: React.CSSProperties = {
  padding: '0 12px',
  flex: 1,
  minWidth: 0,
  whiteSpace: 'pre',
};

const ADD_BG = 'color-mix(in srgb, var(--cr-success-fg) 12%, transparent)';
const REMOVE_BG = 'color-mix(in srgb, var(--cr-danger-fg) 12%, transparent)';
const ADD_WORD_BG = 'color-mix(in srgb, var(--cr-success-fg) 30%, transparent)';
const REMOVE_WORD_BG = 'color-mix(in srgb, var(--cr-danger-fg) 30%, transparent)';

function computeIntraLinePairs(lines: DiffLine[]): Map<number, Change[]> {
  const result = new Map<number, Change[]>();
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type !== 'remove') { i++; continue; }
    const removeStart = i;
    while (i < lines.length && lines[i].type === 'remove') i++;
    const addStart = i;
    while (i < lines.length && lines[i].type === 'add') i++;
    const addEnd = i;

    const removeCount = addStart - removeStart;
    const addCount = addEnd - addStart;
    const paired = Math.min(removeCount, addCount);

    for (let p = 0; p < paired; p++) {
      const changes = diffWordsWithSpace(
        lines[removeStart + p].content,
        lines[addStart + p].content,
      );
      result.set(removeStart + p, changes);
      result.set(addStart + p, changes);
    }
  }
  return result;
}

function renderHighlightedTokens(tokens: HighlightToken[]): React.ReactNode[] {
  return tokens.map((t, i) => (
    <span key={i} style={{ color: t.color }}>{t.content}</span>
  ));
}

function renderWordDiff(changes: Change[], mode: 'add' | 'remove'): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    if (!c.added && !c.removed) {
      nodes.push(<span key={i}>{c.value}</span>);
    } else if (c.removed && mode === 'remove') {
      nodes.push(<span key={i} style={{ background: REMOVE_WORD_BG }}>{c.value}</span>);
    } else if (c.added && mode === 'add') {
      nodes.push(<span key={i} style={{ background: ADD_WORD_BG }}>{c.value}</span>);
    }
  }
  return nodes;
}

function mergeHighlightWithWordDiff(
  tokens: HighlightToken[],
  changes: Change[],
  mode: 'add' | 'remove',
): React.ReactNode[] {
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

export const UnifiedView: React.FC<Props> = ({
  hunks,
  oldFile,
  newFile,
  oldHighlight,
  newHighlight,
  gapState,
  gapShortcutNumbers,
}) => {
  const oldLines = oldFile?.split('\n') ?? [];
  const newLines = newFile?.split('\n') ?? [];

  if (hunks.length === 0) {
    return <pre style={{ fontFamily: MONO_FONT, fontSize: 13, lineHeight: 1.6, margin: 0 }} />;
  }

  function renderContextLines(oldStart: number, newStart: number, count: number, keyPrefix: string) {
    const rows: React.ReactNode[] = [];
    for (let i = 0; i < count; i++) {
      const oldNo = oldStart + i > 0 && oldStart + i <= oldLines.length ? oldStart + i : undefined;
      const newNo = newStart + i > 0 && newStart + i <= newLines.length ? newStart + i : undefined;
      const content = newNo != null
        ? newLines[newNo - 1]
        : oldNo != null
          ? oldLines[oldNo - 1]
          : '';
      const tokens = newNo != null
        ? newHighlight?.[newNo - 1]
        : oldNo != null
          ? oldHighlight?.[oldNo - 1]
          : undefined;
      rows.push(
        <div key={`${keyPrefix}-${i}`} style={{ display: 'flex' }}>
          <span style={gutterStyle}>{oldNo ?? ''}</span>
          <span style={gutterStyle} {...(newNo != null ? { 'data-line-no': newNo } : {})}>{newNo ?? ''}</span>
          <span style={contentBaseStyle}>
            {tokens ? renderHighlightedTokens(tokens) : content}
          </span>
        </div>,
      );
    }
    return rows;
  }

  function getLineTokens(line: DiffLine): HighlightToken[] | undefined {
    if (line.type === 'remove' && oldHighlight && line.oldNo != null) {
      return oldHighlight[line.oldNo - 1];
    }
    if ((line.type === 'add' || line.type === 'context') && newHighlight && line.newNo != null) {
      return newHighlight[line.newNo - 1];
    }
    return undefined;
  }

  function renderLine(line: DiffLine, key: string, wordDiff: Change[] | undefined) {
    let rowBg: string | undefined;
    if (line.type === 'add') rowBg = ADD_BG;
    else if (line.type === 'remove') rowBg = REMOVE_BG;

    const tokens = getLineTokens(line);
    let contentNode: React.ReactNode;

    if (wordDiff && tokens) {
      contentNode = mergeHighlightWithWordDiff(tokens, wordDiff, line.type as 'add' | 'remove');
    } else if (wordDiff) {
      contentNode = renderWordDiff(wordDiff, line.type as 'add' | 'remove');
    } else if (tokens) {
      contentNode = renderHighlightedTokens(tokens);
    } else {
      contentNode = line.content;
    }

    return (
      <div key={key} style={{ display: 'flex', background: rowBg }}>
        <span style={gutterStyle}>{line.oldNo ?? ''}</span>
        <span style={gutterStyle} {...(line.newNo != null ? { 'data-line-no': line.newNo } : {})}>{line.newNo ?? ''}</span>
        <span style={contentBaseStyle}>{contentNode}</span>
      </div>
    );
  }

  function renderHunk(hunk: DiffHunk, hunkIdx: number) {
    const pairs = computeIntraLinePairs(hunk.lines);
    return hunk.lines.map((line, lineIdx) =>
      renderLine(line, `h${hunkIdx}-l${lineIdx}`, pairs.get(lineIdx)),
    );
  }

  const elements: React.ReactNode[] = [];
  const sections = buildDiffRenderSections(hunks, gapState);

  sections.forEach((section) => {
    if (section.kind === 'context') {
      elements.push(...renderContextLines(section.oldStart, section.newStart, section.count, section.key));
    } else if (section.kind === 'gap') {
      const gapIndex = Number(section.gap.id.replace('gap-', '')) || 0;
      elements.push(
        <HiddenLinesGap
          key={section.key}
          count={getGapHiddenCount(section.gap)}
          index={gapIndex}
          shortcutNumber={gapShortcutNumbers[section.gap.id]}
        />,
      );
    } else {
      elements.push(
        <React.Fragment key={section.key}>{renderHunk(section.hunk, section.hunkIndex)}</React.Fragment>,
      );
    }
  });

  return (
    <pre style={{ fontFamily: MONO_FONT, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
      {elements}
    </pre>
  );
};
