export interface ReviewCommentFormatItem {
  filePath: string;
  startLine: number;
  endLine: number;
  codeSnippet: string;
  comment: string;
}

export function formatReviewComments(comments: ReviewCommentFormatItem[]): string {
  return comments
    .map((c) => {
      const lineRange = c.startLine === c.endLine ? `line ${c.startLine}` : `lines ${c.startLine}-${c.endLine}`;
      return `Comment on ${c.filePath}:\nCode (${lineRange}):\n${c.codeSnippet}\nComment: ${c.comment}`;
    })
    .join('\n\n');
}
