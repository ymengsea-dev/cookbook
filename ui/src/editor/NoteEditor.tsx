import { Annotation, ChangeSet, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { runCodeAtCursor, type CodeRunHost } from './setup/codeRun.ts';
import { codeRunExtension, codeRunSlot, editorExtensions, lineNumbersExtension, lineNumbersSlot } from './setup/extensions.ts';
import type { NoteContext } from './setup/noteContext.ts';
import { singleChange } from './textDiff.ts';

/** Marks edits that came from disk, so they don't count as the user typing. */
const fromDisk = Annotation.define<boolean>();

/** What the note view can ask of the editor. */
export interface NoteEditorHandle {
  getText: () => string;
  /** Starts tracking typing from now and returns the text to save. */
  beginSave: () => string;
  /** Applies what the save changed (such as a new key), keeping any typing since `beginSave`. */
  finishSave: (sentText: string, savedText: string) => void;
  /** Replaces the text with a version from disk, keeping the cursor where it can. */
  replaceText: (text: string) => void;
  /** Runs the code block under the cursor, if it has a runner (E-11). */
  runCodeAtCursor: () => void;
}

interface NoteEditorProps {
  readonly initialText: string;
  readonly context: NoteContext;
  readonly showLineNumbers: boolean;
  readonly codeRunner: CodeRunHost | null;
  readonly onEdit: () => void;
  readonly onBlur: () => void;
  readonly onSave: () => void;
  /** Gets the final text just before the editor closes. */
  readonly onClose: (text: string) => void;
  readonly ref: Ref<NoteEditorHandle>;
}

/** CodeMirror 6 inside React. React never re-renders the text; CodeMirror owns it. */
export function NoteEditor({ initialText, context, showLineNumbers, codeRunner, onEdit, onBlur, onSave, onClose, ref }: NoteEditorProps) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Typing since beginSave(), so a save's own changes can be placed around it.
  const typedSinceSave = useRef<ChangeSet | null>(null);

  // The latest callbacks, so the editor (created once) always calls current code.
  const callbacks = useRef({ onEdit, onBlur, onSave, onClose });
  useEffect(() => {
    callbacks.current = { onEdit, onBlur, onSave, onClose };
  });

  useEffect(() => {
    if (container.current === null) return;
    const editor = new EditorView({
      parent: container.current,
      state: EditorState.create({
        doc: initialText,
        extensions: [
          editorExtensions({ context, showLineNumbers, codeRunner, onSave: () => { callbacks.current.onSave(); } }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            if (typedSinceSave.current !== null) {
              typedSinceSave.current = typedSinceSave.current.compose(update.changes);
            }
            const isTyping = update.transactions.some((transaction) => transaction.annotation(fromDisk) !== true);
            if (isTyping) callbacks.current.onEdit();
          }),
          EditorView.domEventHandlers({
            blur: () => {
              callbacks.current.onBlur();
            },
          }),
        ],
      }),
    });
    view.current = editor;
    editor.focus();
    return () => {
      callbacks.current.onClose(editor.state.doc.toString());
      editor.destroy();
      view.current = null;
    };
    // The editor is created once per note; NoteView remounts it for another note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: lineNumbersSlot.reconfigure(lineNumbersExtension(showLineNumbers)) });
  }, [showLineNumbers]);

  useEffect(() => {
    view.current?.dispatch({ effects: codeRunSlot.reconfigure(codeRunExtension(codeRunner)) });
  }, [codeRunner]);

  useImperativeHandle(ref, () => ({
    getText: () => view.current?.state.doc.toString() ?? '',

    beginSave: () => {
      const doc = view.current?.state.doc;
      typedSinceSave.current = ChangeSet.empty(doc?.length ?? 0);
      return doc?.toString() ?? '';
    },

    finishSave: (sentText, savedText) => {
      const editor = view.current;
      const typed = typedSinceSave.current;
      typedSinceSave.current = null;
      const change = singleChange(sentText, savedText);
      if (editor === null || change === null) return;
      // The change is relative to the sent text; map it past anything typed since.
      let changes = ChangeSet.of([change], sentText.length);
      if (typed !== null) changes = changes.map(typed);
      editor.dispatch({ changes, annotations: fromDisk.of(true) });
    },

    replaceText: (text) => {
      const editor = view.current;
      if (editor === null) return;
      const change = singleChange(editor.state.doc.toString(), text);
      if (change !== null) editor.dispatch({ changes: change, annotations: fromDisk.of(true) });
    },

    runCodeAtCursor: () => {
      if (view.current !== null) runCodeAtCursor(view.current);
    },
  }));

  return <div ref={container} className="note-editor" />;
}
