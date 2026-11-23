import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NoteViewHandle } from '../editor/index.ts';
import { useIoStatus } from '../io/index.ts';
import { QuickOpen } from '../search/index.ts';
import { CommandProvider, type CommandTable } from '../shared/commands/index.ts';
import { invoke, isCommandError, listen, type TreeEntry } from '../shared/ipc/index.ts';
import { Banner, classNames } from '../shared/ui/index.ts';
import { useSettings } from '../shared/settings/index.ts';
import { treeHasPath, useVault } from '../shared/vault/index.ts';
import { useOpenView } from '../views/index.ts';
import { SectionPage } from './SectionPage.tsx';
import { Sidebar } from './Sidebar.tsx';
import { Toolbar } from './Toolbar.tsx';
import type { SectionId } from './sections.ts';
import { useNoteActions } from './useNoteActions.ts';

/** The note the user chose, per vault. A null path means they closed it. */
interface ChosenNote {
  readonly vaultRoot: string;
  readonly path: string | null;
}

/** The saved view the user opened, per vault. */
interface ChosenView {
  readonly vaultRoot: string;
  readonly id: string;
}

export function AppShell() {
  const vault = useVault();
  const { snapshot, rememberLastNote } = useSettings();
  const [section, setSection] = useState<SectionId>('notes');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [chosen, setChosen] = useState<ChosenNote | null>(null);
  const [chosenView, setChosenView] = useState<ChosenView | null>(null);
  const noteView = useRef<NoteViewHandle>(null);

  const vaultRoot = vault.info?.root ?? null;
  const openPath = chooseOpenPath(chosen, vaultRoot, snapshot?.local.lastNote ?? null, vault.tree);
  const openViewId = chosenView !== null && chosenView.vaultRoot === vaultRoot ? chosenView.id : null;
  const openView = useOpenView(section === 'view' ? openViewId : null);

  const showNote = useCallback(
    (path: string | null) => {
      if (vaultRoot === null) return;
      setChosen({ vaultRoot, path });
      rememberLastNote(path);
      if (path !== null) setSection('notes');
    },
    [vaultRoot, rememberLastNote],
  );

  const showView = useCallback(
    (id: string) => {
      if (vaultRoot === null) return;
      setChosenView({ vaultRoot, id });
      setSection('view');
    },
    [vaultRoot],
  );

  const actions = useNoteActions(openPath, showNote);
  const { createNote, deleteNote } = actions;
  const { chooseVault, showError } = vault;
  const ioStatus = useIoStatus(useCallback(() => { setSection('io'); }, []));

  // Cancelling is not a problem worth a banner.
  const runIo = useCallback(
    (work: Promise<null>) => {
      work.catch((cause: unknown) => {
        if (!isCommandError(cause) || cause.code !== 'cancelled') showError(cause);
      });
    },
    [showError],
  );

  // PDFs imported from the menu or dropped on the window (R-1): show them, and any problems.
  useEffect(() => {
    const stopListening = listen('books-imported', (report) => {
      if (report.problems.length > 0) showError(report.problems.join(' '));
      if (report.imported.length > 0) setSection('books');
    });
    return () => {
      void stopListening.then((stop) => {
        stop();
      });
    };
  }, [showError]);
  const hasVault = vaultRoot !== null;
  const hasNote = openPath !== null;
  const { data: viewData, save: saveView, newNote: newNoteInView } = openView;
  const commands = useMemo<CommandTable>(
    () => ({
      'vault.open': { title: 'Open Folder…', shortcut: 'Mod-o', enabled: true, run: () => { void chooseVault(); } },
      'note.new': { title: 'New Note', shortcut: 'Mod-n', enabled: hasVault, run: () => { void createNote(); } },
      'note.delete': { title: 'Move to Trash', shortcut: 'Mod-Backspace', enabled: hasNote, run: () => { void deleteNote(); } },
      'code.run': {
        title: 'Run Code Block',
        shortcut: 'Mod-Enter',
        enabled: hasNote && section === 'notes',
        run: () => { noteView.current?.runCodeAtCursor(); },
      },
      'book.import': {
        title: 'Import Books…',
        enabled: hasVault,
        run: () => { invoke('book_import', {}).catch(showError); },
      },
      'io.importFolder': {
        title: 'Import Folder…',
        enabled: hasVault,
        run: () => { setSection('io'); runIo(invoke('io_import_folder', {})); },
      },
      'io.importFiles': {
        title: 'Import Files…',
        enabled: hasVault,
        run: () => { setSection('io'); runIo(invoke('io_import_files', {})); },
      },
      'note.exportMarkdown': {
        title: 'Export Markdown…',
        enabled: openPath !== null,
        run: () => { if (openPath !== null) runIo(invoke('note_export_markdown', { path: openPath })); },
      },
      'note.exportHtml': {
        title: 'Export HTML…',
        enabled: openPath !== null,
        run: () => { if (openPath !== null) runIo(invoke('note_export_html', { path: openPath })); },
      },
      'search.quickOpen': { title: 'Open Note…', shortcut: 'Mod-p', enabled: hasVault, run: () => { setQuickOpenVisible(true); } },
      'sidebar.toggle': {
        title: sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar',
        shortcut: 'Mod-\\',
        enabled: true,
        run: () => { setSidebarOpen((open) => !open); },
      },
      'go.notes': { title: 'All Notes', shortcut: 'Mod-1', enabled: true, run: () => { setSection('notes'); } },
      'go.search': { title: 'Search', shortcut: 'Mod-Shift-f', enabled: true, run: () => { setSection('search'); } },
      'go.books': { title: 'Books', shortcut: 'Mod-2', enabled: true, run: () => { setSection('books'); } },
      'go.views': { title: 'All Views', shortcut: 'Mod-4', enabled: true, run: () => { setSection('views'); } },
      'go.io': { title: 'Import & Export', enabled: true, run: () => { setSection('io'); } },
      'go.trash': { title: 'Trash', shortcut: 'Mod-3', enabled: true, run: () => { setSection('trash'); } },
      'app.settings': { title: 'Settings', shortcut: 'Mod-,', enabled: true, run: () => { setSection('settings'); } },
      'view.newNote': {
        title: 'New Note in View',
        shortcut: 'Mod-Shift-n',
        enabled: viewData !== null,
        run: () => {
          void newNoteInView(null).then((path) => {
            if (path !== null) showNote(path);
          });
        },
      },
      'view.togglePin': {
        title: viewData?.definition.pinned === true ? 'Unpin from Sidebar' : 'Pin to Sidebar',
        enabled: viewData !== null,
        run: () => {
          if (viewData === null) return;
          saveView({ ...viewData.definition, pinned: !viewData.definition.pinned });
        },
      },
    }),
    [sidebarOpen, chooseVault, showError, runIo, openPath, hasVault, hasNote, section, createNote, deleteNote, viewData, saveView, newNoteInView, showNote],
  );

  return (
    <CommandProvider commands={commands}>
      <div
        className={classNames(
          'grid h-full',
          sidebarOpen ? 'grid-cols-[var(--sidebar-width)_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)]',
        )}
      >
        {sidebarOpen && (
          <Sidebar current={section} openPath={openPath} openViewId={openViewId} onOpenNote={showNote} onOpenView={showView} />
        )}
        <div className="flex flex-col min-w-0 min-h-0">
          <Toolbar sidebarOpen={sidebarOpen} />
          {vault.error !== null && <Banner message={vault.error} onDismiss={vault.clearError} />}
          <main className="flex flex-1 flex-col min-h-0 overflow-y-auto">
            <SectionPage
              section={section}
              openPath={openPath}
              openView={openView}
              actions={actions}
              noteRef={noteView}
              ioStatus={ioStatus}
              onOpenNote={showNote}
              onOpenView={showView}
            />
          </main>
        </div>
      </div>
      {quickOpenVisible && <QuickOpen onOpenNote={showNote} onClose={() => { setQuickOpenVisible(false); }} />}
    </CommandProvider>
  );
}

/** The note the user picked in this vault, or else last session's note if it still exists. */
function chooseOpenPath(
  chosen: ChosenNote | null,
  vaultRoot: string | null,
  lastNote: string | null,
  tree: readonly TreeEntry[],
): string | null {
  if (vaultRoot === null) return null;
  if (chosen !== null && chosen.vaultRoot === vaultRoot) return chosen.path;
  return lastNote !== null && treeHasPath(tree, lastNote) ? lastNote : null;
}
