import { NoteView } from '../editor/index.ts';
import { SettingsPage } from '../settings/index.ts';
import { EmptyState } from '../shared/ui/index.ts';
import { useVault } from '../shared/vault/index.ts';
import { AdoptCard } from './AdoptCard.tsx';
import type { SectionId } from './sections.ts';
import { TrashPage } from './TrashPage.tsx';
import type { NoteActions } from './useNoteActions.ts';

interface SectionPageProps {
  readonly section: SectionId;
  readonly openPath: string | null;
  readonly actions: NoteActions;
}

export function SectionPage({ section, openPath, actions }: SectionPageProps) {
  switch (section) {
    case 'notes':
      return <NotesPage openPath={openPath} actions={actions} />;
    case 'books':
      return (
        <EmptyState title="No books yet">
          Imported PDFs are copied into your vault, and the reader remembers the page where you stopped.
        </EmptyState>
      );
    case 'trash':
      return <TrashPage />;
    case 'settings':
      return <SettingsPage />;
  }
}

function NotesPage({ openPath, actions }: { openPath: string | null; actions: NoteActions }) {
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
      <div className="notes-start">
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
      path={openPath}
      onRename={(newName) => { void actions.renameNote(newName); }}
      onMove={(folder) => { void actions.moveNote(folder); }}
    />
  );
}
