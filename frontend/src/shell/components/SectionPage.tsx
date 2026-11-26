import type { RefObject } from 'react';
import { NoteView, type NoteViewHandle } from '../../editor/index.ts';
import { IoPage, type IoStatus } from '../../io/index.ts';
import { BooksPage } from '../../reader/index.ts';
import { SearchPage } from '../../search/index.ts';
import { SettingsPage } from '../../settings/index.ts';
import { EmptyState } from '../../shared/ui/index.ts';
import { useVault } from '../../shared/vault/index.ts';
import { ViewPage, ViewsPage, type OpenView } from '../../views/index.ts';
import { AdoptCard } from './AdoptCard.tsx';
import type { SectionId } from '../logic/sections.ts';
import { TrashPage } from '../pages/TrashPage.tsx';
import type { NoteActions } from '../hooks/useNoteActions.ts';

interface SectionPageProps {
  readonly section: SectionId;
  readonly openPath: string | null;
  readonly openView: OpenView;
  readonly actions: NoteActions;
  /** The open note, so app commands such as ⌘↩ can reach it. */
  readonly noteRef: RefObject<NoteViewHandle | null>;
  /** The import or export under way, and how the last one ended. */
  readonly ioStatus: IoStatus;
  readonly onOpenNote: (path: string) => void;
  readonly onOpenView: (id: string) => void;
}

export function SectionPage(props: SectionPageProps) {
  const { section, openPath, openView, actions, noteRef, ioStatus, onOpenNote, onOpenView } = props;
  switch (section) {
    case 'notes':
      return <NotesPage openPath={openPath} actions={actions} noteRef={noteRef} />;
    case 'search':
      return <SearchPage onOpenNote={onOpenNote} />;
    case 'books':
      return <BooksPage />;
    case 'views':
      return <ViewsPage onOpenView={onOpenView} />;
    case 'view':
      return <ViewPage view={openView} onOpenNote={onOpenNote} />;
    case 'trash':
      return <TrashPage />;
    case 'io':
      return <IoPage status={ioStatus} />;
    case 'settings':
      return <SettingsPage />;
  }
}

interface NotesPageProps {
  readonly openPath: string | null;
  readonly actions: NoteActions;
  readonly noteRef: RefObject<NoteViewHandle | null>;
}

function NotesPage({ openPath, actions, noteRef }: NotesPageProps) {
  const { info } = useVault();

  if (info === null) {
    return (
      <EmptyState title="Your notes, as plain files on your Mac" action="vault.open">
        Open any folder of Markdown files, or an empty one to start fresh. Every note stays a normal .md file, so
        other editors can open it too.
      </EmptyState>
    );
  }
  if (openPath === null) {
    return (
      <div className="flex flex-1 flex-col">
        <AdoptCard />
        <EmptyState title="Pick a note" action="note.new">
          Choose a note in the sidebar to open it here, or start a new one.
        </EmptyState>
      </div>
    );
  }
  // The key gives each note a fresh view, so nothing leaks from the previous note.
  return (
    <NoteView
      key={openPath}
      ref={noteRef}
      path={openPath}
      onRename={(newName) => { void actions.renameNote(newName); }}
      onMove={(folder) => { void actions.moveNote(folder); }}
    />
  );
}
