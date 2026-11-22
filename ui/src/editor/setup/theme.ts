import { HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

// Coloured text is mixed toward ink so it stays readable on the paper background.
const readable = (color: string) => `color-mix(in srgb, var(${color}), var(--ink) 40%)`;
const tint = (color: string, percent: number) => `color-mix(in srgb, var(${color}) ${String(percent)}%, transparent)`;

/** Editor chrome from the design tokens. One font everywhere, including code. */
export const editorTheme = EditorView.theme({
  '&': {
    color: 'var(--ink)',
    backgroundColor: 'transparent',
    fontSize: 'var(--text-md)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font)', lineHeight: 'var(--line-height)' },
  '.cm-content': { padding: 'var(--space-4) 0 var(--space-14)', caretColor: 'var(--accent)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: tint('--accent', 22),
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--ink-secondary)',
    fontSize: 'var(--text-sm)',
  },
  '.cm-foldGutter .cm-gutterElement': { padding: '0 var(--space-1)', cursor: 'pointer' },
  '.cm-searchMatch': { backgroundColor: tint('--mustard', 30) },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: tint('--mustard', 55) },
  '.cm-selectionMatch': { backgroundColor: tint('--slate', 18) },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: tint('--sage', 30), outline: 'none' },
  '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--ink)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--rule)' },
  '.cm-panel input, .cm-panel button, .cm-panel label': { fontFamily: 'var(--font)', fontSize: 'var(--text-sm)' },
  '.cm-textfield': { border: '1px solid var(--rule)', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--paper)' },
  '.cm-button': { backgroundImage: 'none', backgroundColor: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--radius-sm)' },
  '.cm-tooltip': { backgroundColor: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 'var(--radius-md)' },

  // Fenced code blocks: a soft band with line numbers drawn from data-line (see codeBlocks.ts).
  '.cm-code-line, .cm-code-fence': { backgroundColor: tint('--ink', 4) },
  '.cm-code-line': { position: 'relative', paddingLeft: 'var(--space-10)' },
  '.cm-code-line::before': {
    content: 'attr(data-line)',
    position: 'absolute',
    left: 'var(--space-2)',
    width: 'var(--space-6)',
    textAlign: 'right',
    color: 'var(--ink-secondary)',
    fontSize: 'var(--text-sm)',
    fontVariantNumeric: 'tabular-nums',
  },
  '.cm-code-fence': { color: 'var(--ink-secondary)' },

  // Live preview (livePreview.ts, tablePreview.ts).
  '.cm-lp-bullet': { display: 'inline-block', width: '1ch', color: 'var(--ink-secondary)' },
  '.cm-lp-checkbox': { margin: '0 var(--space-1) 0 0', verticalAlign: 'middle', accentColor: 'var(--accent)' },
  '.cm-lp-quote': { borderLeft: '3px solid var(--rule)', paddingLeft: 'var(--space-3)' },
  '.cm-lp-image': { display: 'block', maxWidth: '100%', margin: 'var(--space-2) 0', borderRadius: 'var(--radius-md)' },
  '.cm-lp-table': { borderCollapse: 'collapse', margin: 'var(--space-2) 0', cursor: 'text' },
  '.cm-lp-table th, .cm-lp-table td': {
    padding: 'var(--space-1) var(--space-3)',
    border: '1px solid var(--rule)',
    textAlign: 'left',
  },
  '.cm-lp-table th': { fontWeight: 'var(--weight-semibold)', backgroundColor: tint('--ink', 4) },
  '.cm-copy-button': {
    float: 'right',
    padding: '0 var(--space-2)',
    border: '1px solid var(--rule)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--surface)',
    color: 'var(--ink-secondary)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
  },
});

/** Syntax colours: the muted data palette, never bright system colours. */
export const highlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.6em', fontWeight: 'var(--weight-semibold)' },
  { tag: tags.heading2, fontSize: '1.35em', fontWeight: 'var(--weight-semibold)' },
  { tag: tags.heading3, fontSize: '1.15em', fontWeight: 'var(--weight-semibold)' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: 'var(--weight-semibold)' },
  { tag: tags.strong, fontWeight: 'var(--weight-semibold)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: readable('--slate'), textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--ink-secondary)' },
  { tag: tags.quote, color: 'var(--ink-secondary)', fontStyle: 'italic' },
  { tag: tags.monospace, backgroundColor: tint('--ink', 6), borderRadius: 'var(--radius-sm)' },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: 'var(--ink-secondary)' },
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword], color: readable('--rust') },
  { tag: [tags.string, tags.special(tags.string)], color: readable('--sage') },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: readable('--mustard') },
  { tag: tags.comment, color: 'var(--ink-secondary)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: readable('--slate') },
  { tag: [tags.typeName, tags.className], color: readable('--teal') },
  { tag: [tags.propertyName, tags.attributeName], color: readable('--mauve') },
]);
