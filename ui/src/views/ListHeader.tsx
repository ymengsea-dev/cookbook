import { useRef, type PointerEvent } from 'react';
import type { PropertyInfo, PropertyType, SortRule, ViewDefinition } from '../shared/ipc/index.ts';
import { moveItem } from './board.ts';
import { Menu, type MenuItem } from './Menu.tsx';
import { PROPERTY_TYPES, TYPE_LABELS } from './values.ts';

const MIN_WIDTH = 80;
const AUTO_TYPE = 'auto';

interface ListHeaderProps {
  readonly definition: ViewDefinition;
  readonly properties: readonly PropertyInfo[];
  /** Widths while a column is being dragged wider or narrower. */
  readonly onResizing: (property: string, width: number) => void;
  readonly onSave: (definition: ViewDefinition) => void;
}

/** Column headings. Each has a menu for sort, grouping, order and type, and a resize handle (L-2, L-3, L-4). */
export function ListHeader({ definition, properties, onResizing, onSave }: ListHeaderProps) {
  const shown = new Set(definition.columns.map((column) => column.property));
  const addable = properties.filter((info) => !shown.has(info.name));

  return (
    <div className="list-view__row list-view__row--header" role="row">
      <div className="list-view__heading" role="columnheader">
        <span>Title</span>
        <SortMark definition={definition} property="title" />
        <Menu label="Title options" items={sortItems(definition, 'title', onSave)} />
      </div>
      {definition.columns.map((column, index) => (
        <div key={column.property} className="list-view__heading" role="columnheader">
          <span className="list-view__heading-name">{column.property}</span>
          <SortMark definition={definition} property={column.property} />
          <Menu label={`${column.property} options`} items={columnItems(definition, index, onSave)}>
            <TypePicker
              definition={definition}
              info={properties.find((info) => info.name === column.property)}
              property={column.property}
              onSave={onSave}
            />
          </Menu>
          <ResizeHandle
            property={column.property}
            onResizing={onResizing}
            onDone={(width) => {
              const columns = definition.columns.map((c) => (c.property === column.property ? { ...c, width } : c));
              onSave({ ...definition, columns });
            }}
          />
        </div>
      ))}
      <div className="list-view__heading list-view__heading--add" role="columnheader">
        {addable.length > 0 && (
          <select
            className="view-select"
            aria-label="Add a column"
            value=""
            onChange={(event) => {
              const columns = [...definition.columns, { property: event.target.value, width: null }];
              onSave({ ...definition, columns });
            }}
          >
            <option value="">Add column…</option>
            {addable.map((info) => (
              <option key={info.name} value={info.name}>
                {info.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function SortMark({ definition, property }: { definition: ViewDefinition; property: string }) {
  const rule = definition.sort.find((candidate) => candidate.property === property);
  if (rule === undefined) return null;
  const label = rule.dir === 'asc' ? 'Sorted ascending' : 'Sorted descending';
  return (
    <span className="list-view__sort" role="img" aria-label={label} title={label}>
      {rule.dir === 'asc' ? '↑' : '↓'}
    </span>
  );
}

/** Sorting by a column replaces the other sort rules, which is what a click on a heading means. */
function sortItems(definition: ViewDefinition, property: string, onSave: (d: ViewDefinition) => void): MenuItem[] {
  const sortBy = (dir: SortRule['dir']) => {
    onSave({ ...definition, sort: [{ property, dir }] });
  };
  const sorted = definition.sort.some((rule) => rule.property === property);
  return [
    { label: 'Sort ascending', onSelect: () => { sortBy('asc'); } },
    { label: 'Sort descending', onSelect: () => { sortBy('desc'); } },
    {
      label: 'Clear sort',
      disabled: !sorted,
      onSelect: () => { onSave({ ...definition, sort: definition.sort.filter((rule) => rule.property !== property) }); },
    },
  ];
}

function columnItems(definition: ViewDefinition, index: number, onSave: (d: ViewDefinition) => void): MenuItem[] {
  const column = definition.columns[index];
  if (column === undefined) return [];
  const grouped = definition.groupBy === column.property;
  const move = (to: number) => {
    onSave({ ...definition, columns: moveItem(definition.columns, index, to) });
  };
  return [
    ...sortItems(definition, column.property, onSave),
    {
      label: grouped ? 'Stop grouping' : 'Group by this',
      onSelect: () => { onSave({ ...definition, groupBy: grouped ? null : column.property }); },
    },
    { label: 'Move left', disabled: index === 0, onSelect: () => { move(index - 1); } },
    { label: 'Move right', disabled: index === definition.columns.length - 1, onSelect: () => { move(index + 1); } },
    {
      label: 'Hide column',
      onSelect: () => { onSave({ ...definition, columns: definition.columns.filter((_, i) => i !== index) }); },
    },
  ];
}

interface TypePickerProps {
  readonly definition: ViewDefinition;
  readonly info: PropertyInfo | undefined;
  readonly property: string;
  readonly onSave: (definition: ViewDefinition) => void;
}

/** "Automatic" follows the values in the notes; any other choice is saved in the view (L-4). */
function TypePicker({ definition, info, property, onSave }: TypePickerProps) {
  const chosen = definition.propertyTypes[property];
  const guessed = info === undefined || info.chosen ? '' : ` (${TYPE_LABELS[info.kind]})`;
  return (
    <label className="view-menu__field">
      <span>Type</span>
      <select
        className="view-select"
        value={chosen ?? AUTO_TYPE}
        onChange={(event) => {
          const value = event.target.value;
          const others = Object.entries(definition.propertyTypes).filter(([name]) => name !== property);
          const kept = value === AUTO_TYPE ? others : [...others, [property, value as PropertyType] as const];
          onSave({ ...definition, propertyTypes: Object.fromEntries(kept) });
        }}
      >
        <option value={AUTO_TYPE}>Automatic{guessed}</option>
        {PROPERTY_TYPES.map((kind) => (
          <option key={kind} value={kind}>
            {TYPE_LABELS[kind]}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ResizeHandleProps {
  readonly property: string;
  readonly onResizing: (property: string, width: number) => void;
  readonly onDone: (width: number) => void;
}

/** Drag the right edge of a heading. The width is saved once, when the drag ends. */
function ResizeHandle({ property, onResizing, onDone }: ResizeHandleProps) {
  const start = useRef<{ x: number; width: number } | null>(null);

  function widthAt(event: PointerEvent<HTMLDivElement>): number {
    const from = start.current;
    if (from === null) return MIN_WIDTH;
    return Math.max(MIN_WIDTH, Math.round(from.width + event.clientX - from.x));
  }

  return (
    <div
      className="list-view__resize"
      aria-hidden="true"
      onPointerDown={(event) => {
        const heading = event.currentTarget.parentElement;
        if (heading === null) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { x: event.clientX, width: heading.getBoundingClientRect().width };
      }}
      onPointerMove={(event) => {
        if (start.current !== null) onResizing(property, widthAt(event));
      }}
      onPointerUp={(event) => {
        if (start.current === null) return;
        onDone(widthAt(event));
        start.current = null;
      }}
    />
  );
}
