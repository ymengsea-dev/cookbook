import { syntaxTree } from '@codemirror/language';
import type { EditorState, Range } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import type { SyntaxNodeRef } from '@lezer/common';
import { assetUrl } from '../../shared/ipc/index.ts';
import { resolveImagePath } from '../imagePath.ts';
import { noteContext } from './noteContext.ts';
import { BulletWidget, CheckboxWidget, ImageWidget } from './widgets.ts';

const hidden = Decoration.replace({});
const quoteLine = Decoration.line({ class: 'cm-lp-quote' });

/** Marks that disappear when the cursor is on another line, such as `**` or `# `. */
const HIDDEN_MARKS = new Set(['EmphasisMark', 'StrikethroughMark', 'LinkMark']);

/**
 * Obsidian-style live preview (E-1): Markdown looks formatted, and the raw syntax
 * comes back only on the lines the cursor is on.
 */
export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      const treeChanged = syntaxTree(update.startState) !== syntaxTree(update.state);
      if (update.docChanged || update.selectionSet || update.viewportChanged || treeChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const editing = linesWithCursor(state);
  const decorations: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        // Code and front matter are always shown as written; tables have their own preview.
        if (node.name === 'FencedCode' || node.name === 'FrontMatter' || node.name === 'Table') return false;
        if (node.name === 'Blockquote') {
          addQuoteLines(state, node, decorations);
          return;
        }
        if (editing.has(state.doc.lineAt(node.from).number)) return;
        decorateNode(state, node, decorations);
      },
    });
  }
  return Decoration.set(decorations, true);
}

function decorateNode(state: EditorState, node: SyntaxNodeRef, decorations: Range<Decoration>[]) {
  const parent = node.node.parent?.name;

  if (HIDDEN_MARKS.has(node.name)) {
    decorations.push(hidden.range(node.from, node.to));
  } else if (node.name === 'CodeMark' && parent === 'InlineCode') {
    decorations.push(hidden.range(node.from, node.to));
  } else if (node.name === 'URL' && parent === 'Link') {
    decorations.push(hidden.range(node.from, node.to));
  } else if (node.name === 'HeaderMark' || node.name === 'QuoteMark') {
    decorations.push(hidden.range(node.from, withFollowingSpace(state, node.to)));
  } else if (node.name === 'ListMark' && node.node.parent?.parent?.name === 'BulletList') {
    decorations.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to));
  } else if (node.name === 'TaskMarker') {
    const checked = state.sliceDoc(node.from, node.to).toLowerCase() === '[x]';
    decorations.push(Decoration.replace({ widget: new CheckboxWidget(checked, node.from) }).range(node.from, node.to));
  } else if (node.name === 'Image') {
    const image = imageWidget(state, node);
    if (image !== null) decorations.push(Decoration.replace({ widget: image }).range(node.from, node.to));
  }
}

/** Builds the image preview, or null for web images and paths outside the vault. */
function imageWidget(state: EditorState, node: SyntaxNodeRef): ImageWidget | null {
  const context = state.facet(noteContext);
  const urlNode = node.node.getChild('URL');
  if (context === null || urlNode === null) return null;

  const path = resolveImagePath(context.notePath, state.sliceDoc(urlNode.from, urlNode.to));
  if (path === null) return null;
  const altMatch = /^!\[([^\]]*)\]/.exec(state.sliceDoc(node.from, node.to));
  return new ImageWidget(assetUrl(`${context.vaultRoot}/${path}`), altMatch?.[1] ?? '');
}

function addQuoteLines(state: EditorState, node: SyntaxNodeRef, decorations: Range<Decoration>[]) {
  const first = state.doc.lineAt(node.from).number;
  const last = state.doc.lineAt(node.to).number;
  for (let number = first; number <= last; number++) {
    decorations.push(quoteLine.range(state.doc.line(number).from));
  }
}

/** Every line number that holds a cursor or part of a selection. */
function linesWithCursor(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let number = first; number <= last; number++) lines.add(number);
  }
  return lines;
}

function withFollowingSpace(state: EditorState, position: number): number {
  return state.sliceDoc(position, position + 1) === ' ' ? position + 1 : position;
}
