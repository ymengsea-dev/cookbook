import { syntaxTree } from '@codemirror/language';
import type { EditorState, Range } from '@codemirror/state';
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';

const fenceLine = Decoration.line({ class: 'cm-code-fence' });

/** Numbers every line inside a fenced code block and adds a Copy button to its fence (E-2). */
export const codeBlocks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      const treeChanged = syntaxTree(update.startState) !== syntaxTree(update.state);
      if (update.docChanged || update.viewportChanged || treeChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

function buildDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const seenBlocks = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'FencedCode') return;
        // A block can span two visible ranges; decorate it once.
        if (!seenBlocks.has(node.from)) {
          seenBlocks.add(node.from);
          decorations.push(...decorateBlock(view.state, node.from, node.to));
        }
        return false;
      },
    });
  }
  return Decoration.set(decorations, true);
}

function decorateBlock(state: EditorState, from: number, to: number): Range<Decoration>[] {
  const doc = state.doc;
  const first = doc.lineAt(from);
  const last = doc.lineAt(to);
  const hasClosingFence = last.number > first.number && /^\s*(```|~~~)/.test(last.text);
  const lastCodeLine = hasClosingFence ? last.number - 1 : last.number;

  const ranges: Range<Decoration>[] = [fenceLine.range(first.from)];
  for (let number = first.number + 1; number <= lastCodeLine; number++) {
    const line = doc.line(number);
    const codeLine = Decoration.line({ class: 'cm-code-line', attributes: { 'data-line': String(number - first.number) } });
    ranges.push(codeLine.range(line.from));
  }
  if (hasClosingFence) ranges.push(fenceLine.range(last.from));

  const code = lastCodeLine > first.number ? doc.sliceString(doc.line(first.number + 1).from, doc.line(lastCodeLine).to) : '';
  ranges.push(Decoration.widget({ widget: new CopyButton(code), side: 1 }).range(first.to));
  return ranges;
}

class CopyButton extends WidgetType {
  readonly code: string;

  constructor(code: string) {
    super();
    this.code = code;
  }

  override eq(other: CopyButton): boolean {
    return other.code === this.code;
  }

  toDOM(): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-copy-button';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', 'Copy code');
    button.addEventListener('mousedown', (event) => {
      // Keep the cursor where it is instead of moving it onto the fence.
      event.preventDefault();
    });
    button.addEventListener('click', () => {
      void navigator.clipboard.writeText(this.code).then(() => {
        button.textContent = 'Copied';
      });
    });
    return button;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}
