import { useState, type SyntheticEvent } from 'react';
import type { ViewKind, ViewSource } from '../../shared/ipc/index.ts';
import { EmptyState, Icon, styles } from '../../shared/ui/index.ts';
import { useVault } from '../../shared/vault/index.ts';
import { SourcePicker } from '../components/settings/SourcePicker.tsx';
import * as viewStyles from '../components/styles.ts';
import { sourceLabel } from '../logic/values.ts';
import { useViews } from '../hooks/ViewsProvider.tsx';

const field = 'flex items-center gap-4';

/** Every saved view, and the form for a new one (L-8). */
export function ViewsPage({ onOpenView }: { onOpenView: (id: string) => void }) {
  const { info } = useVault();
  const { views } = useViews();

  if (info === null) {
    return (
      <EmptyState title="Views" action="vault.open">
        Views show your notes as a table or a board, built from their properties. Open a folder first.
      </EmptyState>
    );
  }

  return (
    <section className={styles.page}>
      <h1 className={styles.pageTitle}>Views</h1>
      <p className={styles.pageSubtitle}>Saved in .vault/views. Pin a view to keep it in the sidebar.</p>
      {views.length > 0 && (
        <ul className={styles.rows}>
          {views.map((view) => (
            <li key={view.id} className={styles.rowsRow}>
              <button
                type="button"
                className="flex flex-1 items-center gap-3 min-w-0 p-0 border-0 bg-transparent text-left [&_svg]:text-ink-secondary"
                onClick={() => {
                  onOpenView(view.id);
                }}
              >
                <Icon name={view.type === 'board' ? 'board' : 'list'} />
                <span className="font-medium">{view.name}</span>
                <span className="flex-1 text-ink-secondary text-sm">{sourceLabel(view.source)}</span>
                {view.pinned && <span className="text-ink-secondary text-sm">Pinned</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h2 className="mt-10 mx-0 mb-4 text-lg font-regular">New view</h2>
      <NewViewForm onCreated={onOpenView} />
    </section>
  );
}

function NewViewForm({ onCreated }: { onCreated: (id: string) => void }) {
  const { createView } = useViews();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ViewKind>('list');
  const [source, setSource] = useState<ViewSource>({ kind: 'vault' });

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await createView(name, kind, source);
    if (created === null) return;
    setName('');
    onCreated(created.id);
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => { void onSubmit(event); }}>
      <label className={field}>
        <span className={viewStyles.label}>Name</span>
        <input
          className={viewStyles.input}
          value={name}
          placeholder="Website tasks"
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </label>
      <fieldset className={`${field} m-0 p-0 border-0`}>
        <legend className={`${viewStyles.label} float-left p-0`}>Show as</legend>
        {(['list', 'board'] as const).map((choice) => (
          <label key={choice} className={`${viewStyles.check} mr-4`}>
            <input
              type="radio"
              className={viewStyles.checkbox}
              name="kind"
              checked={kind === choice}
              onChange={() => {
                setKind(choice);
              }}
            />
            {choice === 'list' ? 'List' : 'Board'}
          </label>
        ))}
      </fieldset>
      <div className={field}>
        <span className={viewStyles.label}>Notes from</span>
        <SourcePicker source={source} onChange={setSource} />
      </div>
      <div>
        <button type="submit" className={styles.primaryButton} disabled={name.trim() === ''}>
          Create view
        </button>
      </div>
    </form>
  );
}
