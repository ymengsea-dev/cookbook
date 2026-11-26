import { syntaxTree } from '@codemirror/language';
import {
  Facet,
  MapMode,
  StateEffect,
  StateField,
  type ChangeDesc,
  type EditorState,
  type Extension,
  type Range,
} from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type { RunEvent } from '../../../shared/ipc/index.ts';
import { codeBlockAt, codeBlockStartingAt, readCodeBlock, type CodeBlock } from '../../logic/codeFence.ts';
import { applyRunEvent, failPanel, newPanel, type RunPanel } from '../../logic/runPanel.ts';
import { OutputPanel, RunButton } from './runWidgets.ts';

/** What the editor needs from the app to run code. NoteView provides it. */
export interface CodeRunHost {
  /** Fence labels that have a runner in settings.local.json (E-14). */
  readonly labels: ReadonlySet<string>;
  /** Starts a run. Progress comes back through the effects below. */
  readonly start: (view: EditorView, block: CodeBlock) => void;
  readonly stop: (runId: string) => void;
}

export const codeRunHost = Facet.define<CodeRunHost, CodeRunHost | null>({
  combine: (values) => values[0] ?? null,
});

export const runStarted = StateEffect.define<{ runId: string; blockFrom: number }>();
export const runEvent = StateEffect.define<{ runId: string; event: RunEvent }>();
export const runFailed = StateEffect.define<{ runId: string; message: string }>();
export const runCleared = StateEffect.define<string>();

/**
 * One output panel per block that ran, kept in place as the text changes.
 * Only effects add panels: nothing here starts a run (E-11).
 */
export const runPanels = StateField.define<readonly RunPanel[]>({
  create: () => [],
  update: (panels, transaction) => {
    let next = transaction.docChanged ? mapPanels(panels, transaction.changes) : panels;
    for (const effect of transaction.effects) next = applyEffect(next, effect);
    return next;
  },
});

// A panel whose block was deleted goes with it.
function mapPanels(panels: readonly RunPanel[], changes: ChangeDesc): readonly RunPanel[] {
  if (panels.length === 0) return panels;
  const mapped: RunPanel[] = [];
  for (const panel of panels) {
    const blockFrom = changes.mapPos(panel.blockFrom, 1, MapMode.TrackDel);
    if (blockFrom !== null) mapped.push({ ...panel, blockFrom });
  }
  return mapped;
}

function applyEffect(panels: readonly RunPanel[], effect: StateEffect<unknown>): readonly RunPanel[] {
  if (effect.is(runStarted)) {
    const { runId, blockFrom } = effect.value;
    // A new run replaces the block's old output.
    return [...panels.filter((panel) => panel.blockFrom !== blockFrom), newPanel(runId, blockFrom)];
  }
  if (effect.is(runEvent)) {
    const { runId, event } = effect.value;
    return panels.map((panel) => (panel.runId === runId ? applyRunEvent(panel, event) : panel));
  }
  if (effect.is(runFailed)) {
    const { runId, message } = effect.value;
    return panels.map((panel) => (panel.runId === runId ? failPanel(panel, message) : panel));
  }
  if (effect.is(runCleared)) {
    const runId = effect.value;
    return panels.filter((panel) => panel.runId !== runId);
  }
  return panels;
}

function isRunning(state: EditorState, blockFrom: number): boolean {
  return state.field(runPanels).some((panel) => panel.blockFrom === blockFrom && panel.state.kind === 'running');
}

/** The block under `pos` if a runner is set up for its label. */
export function runnableBlockAt(state: EditorState, pos: number): CodeBlock | null {
  const host = state.facet(codeRunHost);
  const block = codeBlockAt(state, pos);
  if (host === null || block === null || !host.labels.has(block.label)) return null;
  return block;
}

/** ⌘↩ runs the block under the cursor. Outside a runnable block the key does its usual job. */
export function runCodeAtCursor(view: EditorView): boolean {
  const block = runnableBlockAt(view.state, view.state.selection.main.head);
  if (block === null) return false;
  runBlock(view, block.from);
  return true;
}

// The only place a run starts: the Run button and ⌘↩ both end up here.
function runBlock(view: EditorView, blockFrom: number) {
  const host = view.state.facet(codeRunHost);
  const block = codeBlockStartingAt(view.state, blockFrom);
  if (host === null || block === null || !host.labels.has(block.label)) return;
  // Don't start a block again while it is running (E-12).
  if (isRunning(view.state, block.from)) return;
  host.start(view, block);
}

function stopRun(view: EditorView, runId: string) {
  view.state.facet(codeRunHost)?.stop(runId);
}

function clearRun(view: EditorView, runId: string) {
  view.dispatch({ effects: runCleared.of(runId) });
}

// Block widgets must come from a state field, not a view plugin.
const panelDecorations = StateField.define<DecorationSet>({
  create: (state) => buildPanels(state),
  update: (decorations, transaction) => {
    const panelsChanged = transaction.startState.field(runPanels) !== transaction.state.field(runPanels);
    const treeChanged = syntaxTree(transaction.startState) !== syntaxTree(transaction.state);
    if (panelsChanged || treeChanged || transaction.docChanged) return buildPanels(transaction.state);
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function buildPanels(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  for (const panel of state.field(runPanels)) {
    const block = codeBlockStartingAt(state, panel.blockFrom);
    if (block === null) continue;
    const widget = new OutputPanel(panel, stopRun, clearRun);
    decorations.push(Decoration.widget({ widget, block: true, side: 1 }).range(block.end));
  }
  return Decoration.set(decorations, true);
}

const runButtons = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildRunButtons(view);
    }

    update(update: ViewUpdate) {
      const treeChanged = syntaxTree(update.startState) !== syntaxTree(update.state);
      const hostChanged = update.startState.facet(codeRunHost) !== update.state.facet(codeRunHost);
      const panelsChanged = update.startState.field(runPanels) !== update.state.field(runPanels);
      if (update.docChanged || update.viewportChanged || treeChanged || hostChanged || panelsChanged) {
        this.decorations = buildRunButtons(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

function buildRunButtons(view: EditorView): DecorationSet {
  const host = view.state.facet(codeRunHost);
  if (host === null) return Decoration.none;
  const decorations: Range<Decoration>[] = [];
  const seenBlocks = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'FencedCode') return;
        // A block can span two visible ranges; give it one button.
        if (seenBlocks.has(node.from)) return false;
        seenBlocks.add(node.from);
        const block = readCodeBlock(view.state, node.node);
        if (host.labels.has(block.label)) {
          const widget = new RunButton(block.from, isRunning(view.state, block.from), runBlock);
          // Side 2 puts it after the Copy button (codeBlocks.ts), which floats right.
          decorations.push(Decoration.widget({ widget, side: 2 }).range(view.state.doc.lineAt(block.from).to));
        }
        return false;
      },
    });
  }
  return Decoration.set(decorations, true);
}

/** Running code blocks keep going if their text is deleted; stop them instead. */
const stopDeletedRuns = EditorView.updateListener.of((update) => {
  const after = update.state.field(runPanels);
  for (const panel of update.startState.field(runPanels)) {
    const removed = !after.some((other) => other.runId === panel.runId);
    if (removed && panel.state.kind === 'running') update.state.facet(codeRunHost)?.stop(panel.runId);
  }
});

/** Run buttons and output panels for code blocks (E-11, E-12). Needs a `codeRunHost`. */
export const codeRun: Extension = [runPanels, panelDecorations, runButtons, stopDeletedRuns];
