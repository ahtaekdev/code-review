/**
 * Vendored from parse-git-diff v0.0.20 (MIT License)
 * https://github.com/yeonjuan/parse-git-diff
 * Consolidated into a single file.
 */

// --- Constants ---

const LineType = {
  Added: 'AddedLine',
  Deleted: 'DeletedLine',
  Unchanged: 'UnchangedLine',
  Message: 'MessageLine',
} as const;

const FileType = {
  Changed: 'ChangedFile',
  Added: 'AddedFile',
  Deleted: 'DeletedFile',
  Renamed: 'RenamedFile',
} as const;

const ExtendedHeader = {
  Index: 'index',
  OldMode: 'old mode',
  NewMode: 'new mode',
  Copy: 'copy',
  Similarity: 'similarity',
  Dissimilarity: 'dissimilarity',
  Deleted: 'deleted',
  NewFile: 'new file',
  RenameFrom: 'rename from',
  RenameTo: 'rename to',
} as const;

const ExtendedHeaderValues = Object.values(ExtendedHeader);

// --- Types ---

interface Base<Type extends string> {
  readonly type: Type;
}

interface BaseChange<Type extends string> extends Base<Type> {
  content: string;
}

export interface AddedLine extends BaseChange<'AddedLine'> {
  lineAfter: number;
}

export interface DeletedLine extends BaseChange<'DeletedLine'> {
  lineBefore: number;
}

export interface UnchangedLine extends BaseChange<'UnchangedLine'> {
  lineBefore: number;
  lineAfter: number;
}

export interface MessageLine extends BaseChange<'MessageLine'> {
  content: string;
}

export type AnyLineChange = AddedLine | DeletedLine | UnchangedLine | MessageLine;

export interface ChunkRange {
  start: number;
  lines: number;
}

export interface Chunk extends Base<'Chunk'> {
  fromFileRange: ChunkRange;
  toFileRange: ChunkRange;
  changes: AnyLineChange[];
  context: string | undefined;
}

export interface CombinedChunk extends Base<'CombinedChunk'> {
  fromFileRangeA: ChunkRange;
  fromFileRangeB: ChunkRange;
  toFileRange: ChunkRange;
  changes: AnyLineChange[];
  context: string | undefined;
}

export interface BinaryFilesChunk extends Base<'BinaryFilesChunk'> {
  pathBefore: string;
  pathAfter: string;
}

export type AnyChunk = Chunk | CombinedChunk | BinaryFilesChunk;

export interface ChangedFile extends Base<'ChangedFile'> {
  path: string;
  chunks: AnyChunk[];
  oldMode?: string;
  newMode?: string;
}

export interface AddedFile extends Base<'AddedFile'> {
  path: string;
  chunks: AnyChunk[];
}

export interface DeletedFile extends Base<'DeletedFile'> {
  path: string;
  chunks: AnyChunk[];
}

export interface RenamedFile extends Base<'RenamedFile'> {
  pathBefore: string;
  pathAfter: string;
  chunks: AnyChunk[];
  oldMode?: string;
  newMode?: string;
}

export type AnyFileChange = ChangedFile | AddedFile | DeletedFile | RenamedFile;

export interface GitDiff extends Base<'GitDiff'> {
  files: AnyFileChange[];
}

interface FilledGitDiffOptions {
  noPrefix: boolean;
}

export type GitDiffOptions = Partial<FilledGitDiffOptions>;

// --- Context ---

class Context {
  private line: number = 1;
  private lines: string[] = [];
  public options: FilledGitDiffOptions = { noPrefix: false };

  public constructor(diff: string, options?: GitDiffOptions) {
    this.lines = diff.split('\n');
    this.options.noPrefix = !!options?.noPrefix;
  }

  public getCurLine(): string {
    return this.lines[this.line - 1];
  }

  public nextLine(): string | undefined {
    this.line++;
    return this.getCurLine();
  }

  public isEof(): boolean {
    return this.line > this.lines.length;
  }
}

// --- Parser ---

export default function parseGitDiff(
  diff: string,
  options?: GitDiffOptions
): GitDiff {
  const ctx = new Context(diff, options);
  const files = parseFileChanges(ctx);
  return { type: 'GitDiff', files };
}

function parseFileChanges(ctx: Context): AnyFileChange[] {
  const changedFiles: AnyFileChange[] = [];
  while (!ctx.isEof()) {
    const changed = parseFileChange(ctx);
    if (!changed) break;
    changedFiles.push(changed);
  }
  return changedFiles;
}

function parseFileChange(ctx: Context): AnyFileChange | undefined {
  if (!isComparisonInputLine(ctx.getCurLine())) return;

  const comparisonLineParsed = parseComparisonInputLine(ctx);
  let isDeleted = false;
  let isNew = false;
  let isRename = false;
  let pathBefore = '';
  let pathAfter = '';
  let oldMode: string | undefined = undefined;
  let newMode: string | undefined = undefined;

  while (!ctx.isEof()) {
    const extHeader = parseExtendedHeader(ctx);
    if (!extHeader) break;
    if (extHeader.type === ExtendedHeader.Deleted) {
      isDeleted = true;
      pathBefore = comparisonLineParsed?.from || '';
    }
    if (extHeader.type === ExtendedHeader.NewFile) {
      isNew = true;
      pathAfter = comparisonLineParsed?.to || '';
    }
    if (extHeader.type === ExtendedHeader.RenameFrom) {
      isRename = true;
      pathBefore = (extHeader as any).path as string;
    }
    if (extHeader.type === ExtendedHeader.RenameTo) {
      isRename = true;
      pathAfter = (extHeader as any).path as string;
    }
    if (extHeader.type === ExtendedHeader.OldMode) {
      oldMode = (extHeader as any).mode;
    }
    if (extHeader.type === ExtendedHeader.NewMode) {
      newMode = (extHeader as any).mode;
    }
  }

  const changeMarkers = parseChangeMarkers(ctx);
  const chunks = parseChunks(ctx);

  if (isDeleted && chunks.length && chunks[0].type === 'BinaryFilesChunk') {
    return { type: FileType.Deleted, chunks, path: chunks[0].pathBefore };
  }
  if (isDeleted) {
    return { type: FileType.Deleted, chunks, path: changeMarkers?.deleted || pathBefore };
  } else if (isNew && chunks.length && chunks[0].type === 'BinaryFilesChunk') {
    return { type: FileType.Added, chunks, path: chunks[0].pathAfter };
  } else if (isNew) {
    return { type: FileType.Added, chunks, path: changeMarkers?.added || pathAfter };
  } else if (isRename) {
    return { type: FileType.Renamed, pathAfter, pathBefore, chunks, oldMode, newMode };
  } else if (changeMarkers) {
    return { type: FileType.Changed, chunks, path: changeMarkers.added, oldMode, newMode };
  } else if (oldMode && newMode && comparisonLineParsed) {
    return { type: FileType.Changed, chunks, path: comparisonLineParsed.to, oldMode, newMode };
  } else if (chunks.length && chunks[0].type === 'BinaryFilesChunk' && chunks[0].pathAfter) {
    return { type: FileType.Changed, chunks, path: chunks[0].pathAfter };
  }
  return;
}

function isComparisonInputLine(line: string): boolean {
  return line?.indexOf('diff') === 0;
}

function parseComparisonInputLine(ctx: Context): { from: string; to: string } | null {
  const line = ctx.getCurLine();
  const [to, from] = line.split(' ').reverse();
  ctx.nextLine();
  if (to && from) {
    return {
      from: getFilePath(ctx, from, 'src'),
      to: getFilePath(ctx, to, 'dst'),
    };
  }
  return null;
}

function parseChunks(context: Context): AnyChunk[] {
  const chunks: AnyChunk[] = [];
  while (!context.isEof()) {
    const chunk = parseChunk(context);
    if (!chunk) break;
    chunks.push(chunk);
  }
  return chunks;
}

function parseChunk(context: Context): AnyChunk | undefined {
  const chunkHeader = parseChunkHeader(context);
  if (!chunkHeader) return;

  if (chunkHeader.type === 'Normal') {
    const changes = parseChanges(context, chunkHeader.fromFileRange, chunkHeader.toFileRange);
    return { ...chunkHeader, type: 'Chunk', changes };
  } else if (
    chunkHeader.type === 'Combined' &&
    chunkHeader.fromFileRangeA &&
    chunkHeader.fromFileRangeB
  ) {
    const changes = parseChanges(
      context,
      chunkHeader.fromFileRangeA.start < chunkHeader.fromFileRangeB.start
        ? chunkHeader.fromFileRangeA
        : chunkHeader.fromFileRangeB,
      chunkHeader.toFileRange,
    );
    return { ...chunkHeader, type: 'CombinedChunk', changes };
  } else if (
    chunkHeader.type === 'BinaryFiles' &&
    chunkHeader.fileA &&
    chunkHeader.fileB
  ) {
    return { type: 'BinaryFilesChunk', pathBefore: chunkHeader.fileA, pathAfter: chunkHeader.fileB };
  }
}

function parseExtendedHeader(ctx: Context) {
  if (isComparisonInputLine(ctx.getCurLine())) return null;
  const line = ctx.getCurLine();
  const type = ExtendedHeaderValues.find((v) => line.startsWith(v));

  if (type) ctx.nextLine();

  if (type === ExtendedHeader.RenameFrom || type === ExtendedHeader.RenameTo) {
    return { type, path: line.slice(`${type} `.length) } as const;
  } else if (type === ExtendedHeader.OldMode || type === ExtendedHeader.NewMode) {
    return { type, mode: line.slice(`${type} `.length) } as const;
  } else if (type) {
    return { type } as const;
  }
  return null;
}

function parseChunkHeader(ctx: Context) {
  const line = ctx.getCurLine();
  const normalChunkExec = /^@@\s\-(\d+),?(\d+)?\s\+(\d+),?(\d+)?\s@@\s?(.+)?/.exec(line);
  if (!normalChunkExec) {
    const combinedChunkExec =
      /^@@@\s\-(\d+),?(\d+)?\s\-(\d+),?(\d+)?\s\+(\d+),?(\d+)?\s@@@\s?(.+)?/.exec(line);
    if (!combinedChunkExec) {
      const binaryChunkExec = /^Binary\sfiles\s(.*)\sand\s(.*)\sdiffer$/.exec(line);
      if (binaryChunkExec) {
        const [, fileA, fileB] = binaryChunkExec;
        ctx.nextLine();
        return {
          type: 'BinaryFiles' as const,
          fileA: getFilePath(ctx, fileA, 'src'),
          fileB: getFilePath(ctx, fileB, 'dst'),
        };
      }
      return null;
    }
    const [, delStartA, delLinesA, delStartB, delLinesB, addStart, addLines, context] =
      combinedChunkExec;
    ctx.nextLine();
    return {
      context,
      type: 'Combined' as const,
      fromFileRangeA: getRange(delStartA, delLinesA),
      fromFileRangeB: getRange(delStartB, delLinesB),
      toFileRange: getRange(addStart, addLines),
    };
  }
  const [, delStart, delLines, addStart, addLines, context] = normalChunkExec;
  ctx.nextLine();
  return {
    context,
    type: 'Normal' as const,
    toFileRange: getRange(addStart, addLines),
    fromFileRange: getRange(delStart, delLines),
  };
}

function getRange(start: string, lines?: string) {
  return {
    start: parseInt(start, 10),
    lines: lines === undefined ? 1 : parseInt(lines, 10),
  };
}

function parseChangeMarkers(context: Context): { deleted: string; added: string } | null {
  const deleterMarker = parseMarker(context, '--- ');
  const deleted = deleterMarker ? getFilePath(context, deleterMarker, 'src') : deleterMarker;
  const addedMarker = parseMarker(context, '+++ ');
  const added = addedMarker ? getFilePath(context, addedMarker, 'dst') : addedMarker;
  return added && deleted ? { added, deleted } : null;
}

function parseMarker(context: Context, marker: string): string | null {
  const line = context.getCurLine();
  if (line?.startsWith(marker)) {
    context.nextLine();
    return line.replace(marker, '');
  }
  return null;
}

type LineTypeValue = AnyLineChange['type'];

const CHAR_TYPE_MAP: Record<string, LineTypeValue> = {
  '+': LineType.Added,
  '-': LineType.Deleted,
  ' ': LineType.Unchanged,
  '\\': LineType.Message,
};

function parseChanges(
  ctx: Context,
  rangeBefore: ChunkRange,
  rangeAfter: ChunkRange,
): AnyLineChange[] {
  const changes: AnyLineChange[] = [];
  let lineBefore = rangeBefore.start;
  let lineAfter = rangeAfter.start;

  while (!ctx.isEof()) {
    const line = ctx.getCurLine()!;
    const type = getLineType(line);
    if (!type) break;
    ctx.nextLine();

    let change: AnyLineChange;
    const content = line.slice(1);
    switch (type) {
      case LineType.Added:
        change = { type, lineAfter: lineAfter++, content };
        break;
      case LineType.Deleted:
        change = { type, lineBefore: lineBefore++, content };
        break;
      case LineType.Unchanged:
        change = { type, lineBefore: lineBefore++, lineAfter: lineAfter++, content };
        break;
      case LineType.Message:
        change = { type, content: content.trim() };
        break;
    }
    changes.push(change);
  }
  return changes;
}

function getLineType(line: string): LineTypeValue | null {
  return CHAR_TYPE_MAP[line[0]] || null;
}

function getFilePath(ctx: Context, input: string, type: 'src' | 'dst') {
  if (ctx.options.noPrefix) return input;
  if (type === 'src') return input.replace(/^a\//, '');
  if (type === 'dst') return input.replace(/^b\//, '');
  throw new Error('Unexpected unreachable code');
}
