import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

/** One fenced code block in a note. */
export interface CodeBlock {
  /** Where the block starts. Its output panel stays tied to this position. */
  readonly from: number;
  /** The end of its last line, where the output panel goes. */
  readonly end: number;
  /** The first word after the opening fence, in lowercase, such as `js`. */
  readonly label: string;
  readonly code: string;
}

/** The label in a fence's info string: ```` ```Python title="a" ```` gives `python`. */
export function fenceLabel(info: string): string {
  const [first = ''] = info.trim().split(/\s+/);
  return first.toLowerCase();
}

/** The code block that contains `pos`, or null. */
export function codeBlockAt(state: EditorState, pos: number): CodeBlock | null {
  const found: SyntaxNode[] = [];
  syntaxTree(state).iterate({
    from: pos,
    to: pos,
    enter: (node) => {
      if (found.length > 0) return false;
      if (node.name !== 'FencedCode') return;
      found.push(node.node);
      return false;
    },
  });
  const [node] = found;
  return node === undefined ? null : readCodeBlock(state, node);
}

/** The code block that starts exactly at `from`, or null if it has gone. */
export function codeBlockStartingAt(state: EditorState, from: number): CodeBlock | null {
  const block = codeBlockAt(state, from);
  return block !== null && block.from === from ? block : null;
}

/** Reads a `FencedCode` syntax node. The code is the lines between the fences. */
export function readCodeBlock(state: EditorState, node: SyntaxNode): CodeBlock {
  const doc = state.doc;
  const first = doc.lineAt(node.from);
  const last = doc.lineAt(node.to);
  const hasClosingFence = last.number > first.number && /^\s*(```|~~~)/.test(last.text);
  const lastCodeLine = hasClosingFence ? last.number - 1 : last.number;
  const code = lastCodeLine > first.number ? doc.sliceString(doc.line(first.number + 1).from, doc.line(lastCodeLine).to) : '';

  const info = node.getChild('CodeInfo');
  const label = info === null ? '' : fenceLabel(doc.sliceString(info.from, info.to));
  return { from: node.from, end: last.to, label, code };
}
