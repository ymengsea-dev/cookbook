import { useCallback, useEffect, useRef, useState } from 'react';
import type { PropertyValue, ViewData, ViewDefinition, ViewRow } from '../../shared/ipc/index.ts';
import { useVault } from '../../shared/vault/index.ts';
import { createNoteInView, moveBoardCard, onIndexUpdated, openView, renameBoardColumn, saveView, setNoteProperty } from '../api/viewsApi.ts';
import { columnKeys, moveCardLocally, type CardDrop } from '../logic/board.ts';
import { useViews } from './ViewsProvider.tsx';

export interface OpenView {
  /** The view's notes and settings, or null while loading. */
  readonly data: ViewData | null;
  /** Saves new settings (columns, filters, sort, grouping, pin) and runs the view again. */
  readonly save: (definition: ViewDefinition) => void;
  /** Writes one property of one note, changing only that line (L-5). */
  readonly setProperty: (row: ViewRow, name: string, value: PropertyValue) => void;
  /** Moves a card on the board and saves the new card order (B-4, B-5). */
  readonly moveCard: (drop: CardDrop) => void;
  readonly renameColumn: (from: string, to: string) => void;
  /** Creates a note that belongs in this view and returns its path (L-6, B-6). */
  readonly newNote: (column: string | null) => Promise<string | null>;
}

interface Loaded {
  readonly id: string;
  readonly data: ViewData;
}

/** The view that is open on screen. It runs again whenever the index changes. */
export function useOpenView(id: string | null): OpenView {
  const { showError } = useVault();
  const { refreshViews } = useViews();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Only the answer to the latest load is shown.
  const latestLoad = useRef(0);

  const load = useCallback(() => {
    if (id === null) return;
    const ticket = ++latestLoad.current;
    openView(id).then(
      (data) => {
        if (ticket === latestLoad.current) setLoaded({ id, data });
      },
      (cause: unknown) => {
        showError(cause);
      },
    );
  }, [id, showError]);

  useEffect(load, [load]);
  useIndexUpdates(load);

  const data = loaded !== null && loaded.id === id ? loaded.data : null;

  /** Shows a change at once, before the files and index catch up. */
  const showLocally = useCallback(
    (change: (current: ViewData) => ViewData) => {
      setLoaded((current) => (current === null ? null : { ...current, data: change(current.data) }));
    },
    [],
  );

  const reportAndReload = useCallback(
    (cause: unknown) => {
      showError(cause);
      load();
    },
    [showError, load],
  );

  const save = useCallback(
    (definition: ViewDefinition) => {
      showLocally((current) => ({ ...current, definition }));
      saveView(definition).then(() => {
        load();
        void refreshViews();
      }, reportAndReload);
    },
    [showLocally, load, refreshViews, reportAndReload],
  );

  const setProperty = useCallback(
    (row: ViewRow, name: string, value: PropertyValue) => {
      showLocally((current) => withRowProperty(current, row.path, name, value));
      const change = { path: row.path, key: name, value, expectedHash: row.hash };
      setNoteProperty(change).catch(reportAndReload);
    },
    [showLocally, reportAndReload],
  );

  const moveCard = useCallback(
    (drop: CardDrop) => {
      if (data === null || id === null || data.content.type !== 'board') return;
      const card = data.content.columns.flatMap((column) => column.cards).find((c) => c.key === drop.cardKey);
      if (card === undefined) return;
      const columns = moveCardLocally(data.content.columns, drop);
      showLocally((current) => ({ ...current, content: { type: 'board', columns } }));
      const order = columnKeys(columns, drop.toColumn);
      const move = { id, path: card.path, expectedHash: card.hash, column: drop.toColumn, order };
      moveBoardCard(move).then(load, reportAndReload);
    },
    [data, id, showLocally, load, reportAndReload],
  );

  const renameColumn = useCallback(
    (from: string, to: string) => {
      if (id === null) return;
      renameBoardColumn(id, from, to).then(load, reportAndReload);
    },
    [id, load, reportAndReload],
  );

  const newNote = useCallback(
    async (column: string | null) => {
      if (id === null) return null;
      try {
        const note = await createNoteInView(id, column);
        return note.path;
      } catch (cause) {
        showError(cause);
        return null;
      }
    },
    [id, showError],
  );

  return { data, save, setProperty, moveCard, renameColumn, newNote };
}

/** Runs `onUpdate` whenever the index changes, such as after an edit in another app. */
function useIndexUpdates(onUpdate: () => void) {
  const handler = useRef(onUpdate);
  useEffect(() => {
    handler.current = onUpdate;
  });

  useEffect(() => {
    let stop: (() => void) | undefined;
    let unmounted = false;
    void onIndexUpdated(() => {
      handler.current();
    }).then((unlisten) => {
      if (unmounted) unlisten();
      else stop = unlisten;
    });
    return () => {
      unmounted = true;
      stop?.();
    };
  }, []);
}

function withRowProperty(data: ViewData, path: string, name: string, value: PropertyValue): ViewData {
  const update = (row: ViewRow): ViewRow =>
    row.path === path ? { ...row, properties: { ...row.properties, [name]: value } } : row;
  if (data.content.type === 'list') {
    const groups = data.content.groups.map((group) => ({ ...group, rows: group.rows.map(update) }));
    return { ...data, content: { type: 'list', groups } };
  }
  const columns = data.content.columns.map((column) => ({ ...column, cards: column.cards.map(update) }));
  return { ...data, content: { type: 'board', columns } };
}
