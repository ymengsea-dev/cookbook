import { WidgetType, type EditorView } from '@codemirror/view';
import { formatBytes, isProblem, statusText, type RunPanel } from '../runPanel.ts';

/** Starts the block at `blockFrom`; set by codeRun.ts so the widgets need no import of it. */
type RunAction = (view: EditorView, blockFrom: number) => void;
type PanelAction = (view: EditorView, runId: string) => void;

/** The Run button on a code block's opening fence (E-11). */
export class RunButton extends WidgetType {
  readonly blockFrom: number;
  readonly running: boolean;
  readonly onRun: RunAction;

  constructor(blockFrom: number, running: boolean, onRun: RunAction) {
    super();
    this.blockFrom = blockFrom;
    this.running = running;
    this.onRun = onRun;
  }

  override eq(other: RunButton): boolean {
    return other.blockFrom === this.blockFrom && other.running === this.running;
  }

  toDOM(view: EditorView): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-run-button';
    button.textContent = this.running ? 'Running…' : 'Run';
    button.disabled = this.running;
    button.title = 'Run (⌘↩)';
    button.addEventListener('mousedown', (event) => {
      // Keep the cursor where it is instead of moving it onto the fence.
      event.preventDefault();
    });
    button.addEventListener('click', () => {
      this.onRun(view, this.blockFrom);
    });
    return button;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/** Output under a code block, as it arrives, with Stop and Clear (E-12). */
export class OutputPanel extends WidgetType {
  readonly panel: RunPanel;
  readonly onStop: PanelAction;
  readonly onClear: PanelAction;

  constructor(panel: RunPanel, onStop: PanelAction, onClear: PanelAction) {
    super();
    this.panel = panel;
    this.onStop = onStop;
    this.onClear = onClear;
  }

  override eq(other: OutputPanel): boolean {
    return other.panel === this.panel;
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement('div');
    root.className = 'cm-run-output';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Code output');
    const bar = document.createElement('div');
    bar.className = 'cm-run-output__bar';
    const text = document.createElement('pre');
    text.className = 'cm-run-output__text';
    text.setAttribute('aria-live', 'polite');
    root.append(bar, text);
    this.render(root, view);
    return root;
  }

  // Updates in place, so the scroll position and selected text survive new output.
  override updateDOM(dom: HTMLElement, view: EditorView): boolean {
    this.render(dom, view);
    return true;
  }

  override ignoreEvent(): boolean {
    return true;
  }

  private render(root: HTMLElement, view: EditorView) {
    const bar = root.firstElementChild;
    const text = root.lastElementChild;
    if (!(bar instanceof HTMLElement) || !(text instanceof HTMLElement)) return;
    const runId = this.panel.runId;
    const action =
      this.panel.state.kind === 'running'
        ? button('Stop', () => { this.onStop(view, runId); })
        : button('Clear', () => { this.onClear(view, runId); });
    renderBar(bar, this.panel, action);
    renderText(text, this.panel);
  }
}

function renderBar(bar: HTMLElement, panel: RunPanel, action: HTMLElement) {
  const status = document.createElement('span');
  status.className = isProblem(panel.state) ? 'cm-run-output__status cm-run-output__status--problem' : 'cm-run-output__status';
  status.textContent = statusText(panel.state);
  bar.replaceChildren(status, action);
}

// Output only grows, so only the new segments are added.
function renderText(text: HTMLElement, panel: RunPanel) {
  if (text.dataset.runId !== panel.runId) {
    text.replaceChildren();
    text.dataset.runId = panel.runId;
    text.dataset.shown = '0';
  }
  const atBottom = text.scrollTop + text.clientHeight >= text.scrollHeight - 4;
  const shown = Number(text.dataset.shown);
  for (const segment of panel.segments.slice(shown)) {
    const span = document.createElement('span');
    span.textContent = segment.text;
    if (segment.stream === 'stderr') {
      span.className = 'cm-run-output__stderr';
      span.title = 'Error output';
    }
    text.append(span);
  }
  text.dataset.shown = String(panel.segments.length);
  addNoteOnce(text, 'truncated', panel.truncatedAt === null ? null : `Output cut off after ${formatBytes(panel.truncatedAt)}.`);
  addNoteOnce(text, 'failed', panel.state.kind === 'failed' ? panel.state.message : null);
  if (atBottom) text.scrollTop = text.scrollHeight;
}

function addNoteOnce(text: HTMLElement, name: string, message: string | null) {
  if (message === null || text.querySelector(`[data-note="${name}"]`) !== null) return;
  const note = document.createElement('span');
  note.className = 'cm-run-output__note';
  note.dataset.note = name;
  note.textContent = message;
  text.append(note);
}

function button(label: string, onClick: () => void): HTMLElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'cm-run-output__button';
  element.textContent = label;
  element.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  element.addEventListener('click', onClick);
  return element;
}
