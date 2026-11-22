import { useState, type SyntheticEvent } from 'react';
import type { ViewKind, ViewSource } from '../shared/ipc/index.ts';
import { EmptyState, Icon } from '../shared/ui/index.ts';
import { useVault } from '../shared/vault/index.ts';
import { SourcePicker } from './SourcePicker.tsx';
import { sourceLabel } from './values.ts';
import { useViews } from './ViewsProvider.tsx';
import './views.css';

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
    <section className="page">
      <h1 className="page__title">Views</h1>
      <p className="page__subtitle">Saved in .vault/views. Pin a view to keep it in the sidebar.</p>
      {views.length > 0 && (
        <ul className="rows">
          {views.map((view) => (
            <li key={view.id} className="rows__row">
              <button
                type="button"
                className="views-page__open"
                onClick={() => {
                  onOpenView(view.id);
                }}
              >
                <Icon name={view.type === 'board' ? 'board' : 'list'} />
                <span className="views-page__name">{view.name}</span>
                <span className="views-page__source">{sourceLabel(view.source)}</span>
                {view.pinned && <span className="views-page__pinned">Pinned</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h2 className="views-page__heading">New view</h2>
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
    <form className="views-page__form" onSubmit={(event) => { void onSubmit(event); }}>
      <label className="views-page__field">
        <span className="view-settings__label">Name</span>
        <input
          className="view-input"
          value={name}
          placeholder="Website tasks"
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </label>
      <fieldset className="views-page__field views-page__kinds">
        <legend className="view-settings__label">Show as</legend>
        {(['list', 'board'] as const).map((choice) => (
          <label key={choice} className="view-settings__check">
            <input
              type="radio"
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
      <div className="views-page__field">
        <span className="view-settings__label">Notes from</span>
        <SourcePicker source={source} onChange={setSource} />
      </div>
      <div>
        <button type="submit" className="button button--primary" disabled={name.trim() === ''}>
          Create view
        </button>
      </div>
    </form>
  );
}
