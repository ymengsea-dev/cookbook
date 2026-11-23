import { useState, type SyntheticEvent } from 'react';
import type { BoardColumn, PropertyInfo, ViewData, ViewDefinition, ViewRow } from '../shared/ipc/index.ts';
import { Icon, styles as sharedStyles } from '../shared/ui/index.ts';
import { moveItem, NO_VALUE, savedColumnNames } from './board.ts';
import { Menu } from './Menu.tsx';
import { ValueText } from './PropertyCell.tsx';
import * as styles from './styles.ts';
import { useCardDrag, type CardDrag } from './useCardDrag.ts';
import type { OpenView } from './useOpenView.ts';

const columnHeader = 'flex items-center gap-2 py-0 px-1';
const cardClass =
  'flex flex-col items-start gap-1 p-3 border border-rule rounded-md bg-surface text-left cursor-grab touch-none hover:border-[color-mix(in_srgb,var(--ink)_18%,var(--rule))]';

interface BoardViewProps {
  readonly view: OpenView;
  readonly data: ViewData;
  readonly columns: readonly BoardColumn[];
  readonly onOpenNote: (path: string) => void;
}

/** A Kanban board: one column per value of a property, one card per note (B-1 to B-7). */
export function BoardView({ view, data, columns, onOpenNote }: BoardViewProps) {
  const { definition } = data;
  const drag = useCardDrag(view.moveCard);

  if (definition.board.groupBy === null) {
    return <GroupPicker data={data} onSave={view.save} />;
  }

  const hidden = columns.filter((column) => column.hidden);
  const setColumns = (names: string[], hiddenNames = definition.board.hidden) => {
    view.save({ ...definition, board: { ...definition.board, columns: names, hidden: hiddenNames } });
  };

  async function addCard(column: string) {
    const path = await view.newNote(column);
    if (path !== null) onOpenNote(path);
  }

  return (
    <div className="flex flex-1 items-start gap-4 min-h-0 pb-4 overflow-auto">
      {columns.map((column, index) => {
        if (column.hidden) return null;
        const names = savedColumnNames(columns);
        const isNoValue = column.value === NO_VALUE;
        return (
          <section
            key={column.value}
            className="flex flex-none flex-col gap-2 w-(--board-column-width) p-2 rounded-lg bg-[color-mix(in_srgb,var(--ink)_3%,transparent)]"
            data-board-column={column.value}
            aria-label={columnTitle(column)}
          >
            <ColumnHeader
              column={column}
              canMoveLeft={!isNoValue && index > 0}
              canMoveRight={!isNoValue && index < names.length - 1}
              onMove={(delta) => { setColumns(moveItem(names, index, index + delta)); }}
              onHide={() => { setColumns(names, [...definition.board.hidden, column.value]); }}
              onRename={(to) => { view.renameColumn(column.value, to); }}
            />
            <div className="flex flex-col gap-2 min-h-10">
              {column.cards.map((card) => (
                <Card
                  key={card.key}
                  card={card}
                  column={column.value}
                  definition={definition}
                  properties={data.properties}
                  drag={drag}
                  onOpenNote={onOpenNote}
                />
              ))}
              {drag.target?.column === column.value && drag.target.beforeKey === null && <DropLine />}
            </div>
            <button
              type="button"
              className="flex items-center gap-1 p-1 border-0 rounded-sm bg-transparent text-ink-secondary hover:bg-hover hover:text-ink"
              onClick={() => { void addCard(column.value); }}>
              <Icon name="plus" />
              <span>Add card</span>
            </button>
          </section>
        );
      })}
      <aside className="flex flex-none flex-col gap-4 w-(--board-column-width)">
        <AddColumn existing={columns.map((column) => column.value)} onAdd={(name) => { setColumns([...savedColumnNames(columns), name]); }} />
        {hidden.length > 0 && (
          <div className="flex flex-col items-start gap-1">
            <p className="m-0 text-ink-secondary text-sm font-medium">Hidden columns</p>
            {hidden.map((column) => (
              <button
                key={column.value}
                type="button"
                className="p-0 border-0 bg-transparent text-ink hover:underline"
                onClick={() => { setColumns(savedColumnNames(columns), definition.board.hidden.filter((v) => v !== column.value)); }}
              >
                Show {columnTitle(column)} ({column.cards.length})
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

function columnTitle(column: BoardColumn): string {
  return column.value === NO_VALUE ? 'No value' : column.value;
}

interface ColumnHeaderProps {
  readonly column: BoardColumn;
  readonly canMoveLeft: boolean;
  readonly canMoveRight: boolean;
  readonly onMove: (delta: number) => void;
  readonly onHide: () => void;
  readonly onRename: (to: string) => void;
}

function ColumnHeader({ column, canMoveLeft, canMoveRight, onMove, onHide, onRename }: ColumnHeaderProps) {
  const [renaming, setRenaming] = useState(false);
  if (renaming) {
    return (
      <form
        className={columnHeader}
        onSubmit={(event: SyntheticEvent<HTMLFormElement>) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem('name');
          const name = input instanceof HTMLInputElement ? input.value.trim() : '';
          setRenaming(false);
          if (name !== '' && name !== column.value) onRename(name);
        }}
      >
        <input
          name="name"
          className={`${styles.input} flex-1`}
          aria-label="Column name"
          defaultValue={column.value}
          // Shown because the user chose "Rename".
          autoFocus
          onBlur={() => { setRenaming(false); }}
          onKeyDown={(event) => { if (event.key === 'Escape') setRenaming(false); }}
        />
      </form>
    );
  }
  const items = [
    { label: 'Rename…', disabled: column.value === NO_VALUE, onSelect: () => { setRenaming(true); } },
    { label: 'Move left', disabled: !canMoveLeft, onSelect: () => { onMove(-1); } },
    { label: 'Move right', disabled: !canMoveRight, onSelect: () => { onMove(1); } },
    { label: 'Hide column', onSelect: onHide },
  ];
  return (
    <header className={columnHeader}>
      <h2 className="m-0 truncate text-base font-semibold">{columnTitle(column)}</h2>
      <span className="flex-1 text-ink-secondary text-sm tabular-nums">{column.cards.length}</span>
      <Menu label={`${columnTitle(column)} column options`} items={items} />
    </header>
  );
}

interface CardProps {
  readonly card: ViewRow;
  readonly column: string;
  readonly definition: ViewDefinition;
  readonly properties: readonly PropertyInfo[];
  readonly drag: CardDrag;
  readonly onOpenNote: (path: string) => void;
}

function Card({ card, column, definition, properties, drag, onOpenNote }: CardProps) {
  const shown = definition.board.cardProperties.slice(0, 3);
  const isTarget = drag.target?.column === column && drag.target.beforeKey === card.key;
  return (
    <>
      {isTarget && <DropLine />}
      <button
        type="button"
        className={drag.draggingKey === card.key ? `${cardClass} opacity-40` : cardClass}
        data-card-key={card.key}
        onPointerDown={(event) => { drag.startPress(event, card.key); }}
        onClick={() => {
          if (!drag.endedDrag()) onOpenNote(card.path);
        }}
      >
        <span className="font-medium wrap-anywhere">{card.title}</span>
        {shown.map((property) => (
          <span key={property} className="max-w-full text-ink-secondary text-sm">
            <ValueText
              kind={properties.find((info) => info.name === property)?.kind ?? 'text'}
              value={card.properties[property]}
            />
          </span>
        ))}
      </button>
    </>
  );
}

function DropLine() {
  return <div className="h-0.5 rounded-sm bg-accent" aria-hidden="true" />;
}

function AddColumn({ existing, onAdd }: { existing: readonly string[]; onAdd: (name: string) => void }) {
  return (
    <form
      className="flex gap-2"
      onSubmit={(event: SyntheticEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        const input = form.elements.namedItem('column');
        const name = input instanceof HTMLInputElement ? input.value.trim() : '';
        if (name === '' || existing.includes(name)) return;
        onAdd(name);
        form.reset();
      }}
    >
      <input name="column" className={`${styles.input} flex-1`} aria-label="New column name" placeholder="New column" />
      <button type="submit" className={sharedStyles.button}>
        Add column
      </button>
    </form>
  );
}

/** Shown until the board knows which property makes its columns (B-1). */
function GroupPicker({ data, onSave }: { data: ViewData; onSave: (definition: ViewDefinition) => void }) {
  const { definition } = data;
  const choices = data.properties.filter((info) => info.kind !== 'url');
  return (
    <div className="flex flex-col items-start gap-3 py-6 px-0">
      <p className="max-w-(--text-max-width) m-0 text-ink-secondary">Pick the property whose values become the columns, such as status.</p>
      <select
        className={styles.select}
        aria-label="Column property"
        value=""
        onChange={(event) => {
          onSave({ ...definition, board: { ...definition.board, groupBy: event.target.value } });
        }}
      >
        <option value="">Choose a property…</option>
        {choices.map((info) => (
          <option key={info.name} value={info.name}>
            {info.name}
          </option>
        ))}
      </select>
    </div>
  );
}
