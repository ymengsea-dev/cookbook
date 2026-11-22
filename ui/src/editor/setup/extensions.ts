import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { codeBlocks } from './codeBlocks.ts';
import { codeLanguages } from './codeLanguages.ts';
import { frontMatter } from './frontMatter.ts';
import { livePreview } from './livePreview.ts';
import { noteContext, type NoteContext } from './noteContext.ts';
import { slashMenu } from './slashMenu.ts';
import { tablePreview } from './tablePreview.ts';
import { editorTheme, highlightStyle } from './theme.ts';

/** Holds the line-number gutter so the setting can change without rebuilding the editor. */
export const lineNumbersSlot = new Compartment();

export function lineNumbersExtension(show: boolean): Extension {
  return show ? lineNumbers() : [];
}

interface EditorOptions {
  readonly context: NoteContext;
  readonly showLineNumbers: boolean;
  readonly onSave: () => void;
}

/** Everything the note editor needs (E-1 to E-4). Order matters: earlier keymaps win. */
export function editorExtensions({ context, showLineNumbers, onSave }: EditorOptions): Extension[] {
  return [
    noteContext.of(context),
    lineNumbersSlot.of(lineNumbersExtension(showLineNumbers)),
    foldGutter(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    rectangularSelection(),
    crosshairCursor(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    highlightSelectionMatches(),
    search({ top: true }),
    keymap.of([
      { key: 'Mod-s', run: () => { onSave(); return true; } },
      indentWithTab,
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
    ]),
    markdown({ base: markdownLanguage, codeLanguages, extensions: [frontMatter] }),
    syntaxHighlighting(highlightStyle),
    codeBlocks,
    livePreview,
    tablePreview,
    slashMenu,
    EditorView.lineWrapping,
    editorTheme,
  ];
}
