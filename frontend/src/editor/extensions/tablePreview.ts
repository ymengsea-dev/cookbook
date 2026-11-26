import { syntaxTree } from '@codemirror/language';
import { EditorSelection, StateField, type EditorState, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { tableCells } from '../logic/tableCells.ts';

/**
 * Shows Markdown tables as real tables while the cursor is elsewhere (E-1).
 * Block widgets must come from a state field, not a view plugin.
 */
export const tablePreview = StateField.define<DecorationSet>({
  create: (state) => buildTables(state),
  update: (decorations, transaction) => {
    const treeChanged = syntaxTree(transaction.startState) !== syntaxTree(transaction.state);
    if (transaction.docChanged || transaction.selection !== undefined || treeChanged) {
      return buildTables(transaction.state);
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function buildTables(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== 'Table') return;
      const first = state.doc.lineAt(node.from);
      const last = state.doc.lineAt(node.to);
      const cursorInside = state.selection.ranges.some((range) => range.to >= first.from && range.from <= last.to);
      if (!cursorInside) {
        const widget = new TableWidget(state.sliceDoc(first.from, last.to), first.from);
        decorations.push(Decoration.replace({ widget, block: true }).range(first.from, last.to));
      }
      return false;
    },
  });
  return Decoration.set(decorations, true);
}

class TableWidget extends WidgetType {
  readonly source: string;
  /** Where the table starts, so a click can put the cursor back into its text. */
  readonly start: number;

  constructor(source: string, start: number) {
    super();
    this.source = source;
    this.start = start;
  }

  override eq(other: TableWidget): boolean {
    return other.source === this.source && other.start === this.start;
  }

  toDOM(view: EditorView): HTMLElement {
    const [header = '', , ...rows] = this.source.split('\n');
    const table = document.createElement('table');
    table.className = 'cm-lp-table';
    table.append(makeRow('th', tableCells(header)));
    for (const row of rows) table.append(makeRow('td', tableCells(row)));

    // Clicking the table shows its Markdown so it can be edited.
    table.addEventListener('mousedown', (event) => {
      event.preventDefault();
      view.dispatch({ selection: EditorSelection.cursor(this.start) });
      view.focus();
    });
    return table;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

function makeRow(cellTag: 'th' | 'td', cells: string[]): HTMLTableRowElement {
  const row = document.createElement('tr');
  for (const text of cells) {
    const cell = document.createElement(cellTag);
    cell.textContent = text;
    row.append(cell);
  }
  return row;
}
