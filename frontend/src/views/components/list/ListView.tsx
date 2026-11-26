import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { PropertyValue, RowGroup, ViewData, ViewDefinition, ViewRow } from '../../../shared/ipc/index.ts';
import { moveCell, type CellPosition } from '../../logic/grid.ts';
import { ListHeader } from './ListHeader.tsx';
import { PeekPane } from '../PeekPane.tsx';
import { PropertyCell } from '../PropertyCell.tsx';
import type { OpenView } from '../../hooks/useOpenView.ts';
import { listRow } from '../styles.ts';
import { isChecked, sameValue } from '../../logic/values.ts';

const cell = 'flex items-center min-w-0 min-h-[calc(var(--control-height)+var(--space-2))] px-2';
// The active cell's ring shows only while the table has focus, like a native table.
const activeCell =
  'bg-hover group-focus-within/table:rounded-sm group-focus-within/table:shadow-[inset_0_0_0_1px_var(--accent)]';

// Default widths in pixels; a width the user drags is saved in the view file (L-2).
const TITLE_WIDTH = 280;
const COLUMN_WIDTH = 160;

interface ListViewProps {
  readonly view: OpenView;
  readonly data: ViewData;
  readonly groups: readonly RowGroup[];
  readonly onOpenNote: (path: string) => void;
}

/** Notes as rows and properties as columns. Arrows move, Enter edits, Space peeks (L-2, L-5, L-7). */
export function ListView({ view, data, groups, onOpenNote }: ListViewProps) {
  const { definition, properties } = data;
  const gridId = useId();
  const grid = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<CellPosition>({ row: 0, column: 0 });
  const [editing, setEditing] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);
  const [resizing, setResizing] = useState<Readonly<Record<string, number>>>({});

  const rows = groups.flatMap((group) => group.rows);
  const columnCount = definition.columns.length + 1;
  const activeRow = rows[Math.min(active.row, rows.length - 1)];
  const cellId = (row: number, column: number) => `${gridId}-${String(row)}-${String(column)}`;

  useEffect(() => {
    const id = `${gridId}-${String(active.row)}-${String(active.column)}`;
    document.getElementById(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [gridId, active]);

  function save(next: ViewDefinition) {
    setResizing({});
    view.save(next);
  }

  function commit(row: ViewRow, property: string, value: PropertyValue | null) {
    setEditing(false);
    grid.current?.focus();
    if (value === null || sameValue(row.properties[property], value)) return;
    view.setProperty(row, property, value);
  }

  /** Enter on the title opens the note; on a checkbox it toggles; elsewhere it edits. */
  function activate(position: CellPosition) {
    const row = rows[position.row];
    if (row === undefined) return;
    if (position.column === 0) {
      onOpenNote(row.path);
      return;
    }
    const property = definition.columns[position.column - 1]?.property;
    if (property === undefined) return;
    const kind = properties.find((info) => info.name === property)?.kind;
    if (kind === 'checkbox') view.setProperty(row, property, { type: 'bool', value: !isChecked(row.properties[property]) });
    else setEditing(true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (editing) return;
    const moved = moveCell(active, event.key, rows.length, columnCount);
    if (moved !== null) {
      event.preventDefault();
      setActive(moved);
    } else if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      activate(active);
    } else if (event.key === ' ') {
      event.preventDefault();
      setPeekOpen((open) => !open);
    } else if (event.key === 'Escape') {
      setPeekOpen(false);
    }
  }

  const widths = [
    `${String(TITLE_WIDTH)}px`,
    ...definition.columns.map((column) => `${String(resizing[column.property] ?? column.width ?? COLUMN_WIDTH)}px`),
    'minmax(var(--space-10), 1fr)',
  ];
  const style = { '--list-columns': widths.join(' ') } as CSSProperties;
  const groupStarts = groups.map((_, index) => groups.slice(0, index).reduce((sum, group) => sum + group.rows.length, 0));

  return (
    <div className="flex flex-1 gap-6 min-h-0">
      <div
        ref={grid}
        className="group/table flex-1 self-start min-w-0 max-h-full overflow-auto border-b border-rule focus-visible:outline-none"
        role="grid"
        tabIndex={0}
        aria-label={definition.name}
        aria-rowcount={rows.length + 1}
        aria-activedescendant={rows.length > 0 ? cellId(active.row, active.column) : undefined}
        style={style}
        onKeyDown={onKeyDown}
      >
        <ListHeader
          definition={definition}
          properties={properties}
          onResizing={(property, width) => {
            setResizing((current) => ({ ...current, [property]: width }));
          }}
          onSave={save}
        />
        {groups.map((group, groupIndex) => (
          <div key={group.value} role="rowgroup">
            {definition.groupBy !== null && (
              <div className="flex items-baseline gap-2 pt-4 px-2 pb-2 border-t border-rule font-medium" role="row">
                <span role="rowheader">{group.value === '' ? 'No value' : group.value}</span>
                <span className="text-ink-secondary text-sm tabular-nums">{group.rows.length}</span>
              </div>
            )}
            {group.rows.map((row, rowIndex) => {
              const number = (groupStarts[groupIndex] ?? 0) + rowIndex;
              return (
                <div key={`${group.value}/${row.path}`} className={listRow} role="row">
                  {[null, ...definition.columns].map((column, columnIndex) => {
                    const isActive = number === active.row && columnIndex === active.column;
                    const property = column?.property ?? 'title';
                    return (
                      <div
                        key={property}
                        id={cellId(number, columnIndex)}
                        role="gridcell"
                        className={isActive ? `${cell} ${activeCell}` : cell}
                        aria-selected={isActive}
                        onClick={() => {
                          if (isActive && !editing) activate({ row: number, column: columnIndex });
                          else setActive({ row: number, column: columnIndex });
                        }}
                      >
                        {column === null ? (
                          <span className="truncate font-medium">{row.title}</span>
                        ) : (
                          <PropertyCell
                            value={row.properties[property]}
                            info={properties.find((info) => info.name === property)}
                            editing={isActive && editing}
                            onCommit={(value) => {
                              commit(row, property, value);
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {rows.length === 0 && <p className="text-ink-secondary">No notes match this view.</p>}
      {peekOpen && activeRow !== undefined && (
        <PeekPane
          path={activeRow.path}
          title={activeRow.title}
          onOpenNote={onOpenNote}
          onClose={() => {
            setPeekOpen(false);
            grid.current?.focus();
          }}
        />
      )}
    </div>
  );
}
