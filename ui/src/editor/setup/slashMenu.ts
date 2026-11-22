import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { SLASH_ITEMS, type SlashItem } from '../slashItems.ts';

/** `/` at the start of a line or after a space, plus whatever was typed after it. */
const SLASH_TRIGGER = /(?:^|\s)\/(\w*)$/;

/** Typing `/` opens a menu of blocks to insert (E-4). */
export const slashMenu = autocompletion({ override: [slashCompletions], icons: false });

function slashCompletions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  const match = SLASH_TRIGGER.exec(before);
  if (match === null) return null;

  const typed = match[1] ?? '';
  return {
    from: context.pos - typed.length - 1,
    options: SLASH_ITEMS.map((item) => toCompletion(item)),
    validFor: /^\/?\w*$/,
  };
}

function toCompletion(item: SlashItem): Completion {
  return {
    label: item.label,
    detail: item.detail,
    apply: (view, _completion, from, to) => {
      insertItem(view, item, from, to);
    },
  };
}

function insertItem(view: EditorView, item: SlashItem, from: number, to: number) {
  const line = view.state.doc.lineAt(from);
  const startsLine = line.text.slice(0, from - line.from).trim() === '';
  const lineAbove = line.number > 1 ? view.state.doc.line(line.number - 1).text : '';

  // Blocks start on their own line, with an empty line above when they need one.
  let prefix = startsLine ? '' : '\n';
  const lineAboveHasText = startsLine ? lineAbove.trim() !== '' : true;
  if (item.needsBlankLineBefore && lineAboveHasText) prefix += '\n';

  const insert = prefix + item.text;
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(from + prefix.length + item.cursor),
    userEvent: 'input.complete',
  });
}
