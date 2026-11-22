import { useCallback, useMemo, useState } from 'react';
import { QuickOpen } from '../search/index.ts';
import { CommandProvider, type CommandTable } from '../shared/commands/index.ts';
import type { TreeEntry } from '../shared/ipc/index.ts';
import { Banner } from '../shared/ui/index.ts';
import { useSettings } from '../shared/settings/index.ts';
import { treeHasPath, useVault } from '../shared/vault/index.ts';
import { SectionPage } from './SectionPage.tsx';
import { Sidebar } from './Sidebar.tsx';
import { Toolbar } from './Toolbar.tsx';
import type { SectionId } from './sections.ts';
import { useNoteActions } from './useNoteActions.ts';
import './shell.css';

/** The note the user chose, per vault. A null path means they closed it. */
interface ChosenNote {
  readonly vaultRoot: string;
  readonly path: string | null;
}

export function AppShell() {
  const vault = useVault();
  const { snapshot, rememberLastNote } = useSettings();
  const [section, setSection] = useState<SectionId>('notes');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [chosen, setChosen] = useState<ChosenNote | null>(null);

  const vaultRoot = vault.info?.root ?? null;
  const openPath = chooseOpenPath(chosen, vaultRoot, snapshot?.local.lastNote ?? null, vault.tree);

  const showNote = useCallback(
    (path: string | null) => {
      if (vaultRoot === null) return;
      setChosen({ vaultRoot, path });
      rememberLastNote(path);
      if (path !== null) setSection('notes');
    },
    [vaultRoot, rememberLastNote],
  );

  const actions = useNoteActions(openPath, showNote);
  const { createNote, deleteNote } = actions;
  const { chooseVault } = vault;
  const hasVault = vaultRoot !== null;
  const hasNote = openPath !== null;
  const commands = useMemo<CommandTable>(
    () => ({
      'vault.open': { title: 'Open Folder…', shortcut: 'Mod-o', enabled: true, run: () => { void chooseVault(); } },
      'note.new': { title: 'New Note', shortcut: 'Mod-n', enabled: hasVault, run: () => { void createNote(); } },
      'note.delete': { title: 'Move to Trash', shortcut: 'Mod-Backspace', enabled: hasNote, run: () => { void deleteNote(); } },
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
      'go.trash': { title: 'Trash', shortcut: 'Mod-3', enabled: true, run: () => { setSection('trash'); } },
      'app.settings': { title: 'Settings', shortcut: 'Mod-,', enabled: true, run: () => { setSection('settings'); } },
    }),
    [sidebarOpen, chooseVault, hasVault, hasNote, createNote, deleteNote],
  );

  return (
    <CommandProvider commands={commands}>
      <div className={sidebarOpen ? 'shell' : 'shell shell--collapsed'}>
        {sidebarOpen && <Sidebar current={section} openPath={openPath} onOpenNote={showNote} />}
        <div className="shell__main">
          <Toolbar sidebarOpen={sidebarOpen} />
          {vault.error !== null && <Banner message={vault.error} onDismiss={vault.clearError} />}
          <main className="shell__content">
            <SectionPage section={section} openPath={openPath} actions={actions} onOpenNote={showNote} />
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
