import type { ReactNode } from 'react';
import type { Filter, FilterOp, PropertyInfo, SortRule, ViewData, ViewDefinition } from '../shared/ipc/index.ts';
import { Icon, styles as sharedStyles } from '../shared/ui/index.ts';
import { SourcePicker } from './SourcePicker.tsx';
import * as styles from './styles.ts';

const OPS: ReadonlyArray<readonly [FilterOp, string]> = [
  ['is', 'is'],
  ['isNot', 'is not'],
  ['contains', 'contains'],
  ['isEmpty', 'is empty'],
  ['isNotEmpty', 'is not empty'],
  ['before', 'is before'],
  ['after', 'is after'],
];
const MAX_CARD_PROPERTIES = 3;

interface ViewSettingsProps {
  readonly data: ViewData;
  readonly onSave: (definition: ViewDefinition) => void;
}

/** Source, filters, sort and grouping of a view (L-1, L-3, B-1, B-3). Every change saves. */
export function ViewSettings({ data, onSave }: ViewSettingsProps) {
  const { definition, properties } = data;
  const names = ['title', ...properties.map((info) => info.name)];
  const update = (change: Partial<ViewDefinition>) => {
    onSave({ ...definition, ...change });
  };

  return (
    <section className="flex flex-col gap-3 mb-4 py-4 px-0 border-y border-rule" aria-label="View settings">
      <Setting label="Notes from">
        <SourcePicker source={definition.source} onChange={(source) => { update({ source }); }} />
      </Setting>
      <Setting label="Filter">
        {definition.filter.map((filter, index) => (
          <FilterRow
            key={`${String(index)}-${filter.property}`}
            filter={filter}
            names={names}
            onChange={(next) => { update({ filter: replaceAt(definition.filter, index, next) }); }}
            onRemove={() => { update({ filter: definition.filter.filter((_, i) => i !== index) }); }}
          />
        ))}
        <AddButton
          label="Add filter"
          onAdd={() => { update({ filter: [...definition.filter, { property: names[1] ?? 'title', op: 'is', value: '' }] }); }}
        />
      </Setting>
      <Setting label="Sort">
        {definition.sort.map((rule, index) => (
          <SortRow
            key={`${String(index)}-${rule.property}`}
            rule={rule}
            names={names}
            onChange={(next) => { update({ sort: replaceAt(definition.sort, index, next) }); }}
            onRemove={() => { update({ sort: definition.sort.filter((_, i) => i !== index) }); }}
          />
        ))}
        <AddButton label="Add sort" onAdd={() => { update({ sort: [...definition.sort, { property: 'title', dir: 'asc' }] }); }} />
      </Setting>
      {definition.type === 'list' ? (
        <Setting label="Group by">
          <PropertySelect
            label="Group by"
            value={definition.groupBy}
            properties={properties}
            onChange={(groupBy) => { update({ groupBy }); }}
          />
        </Setting>
      ) : (
        <BoardSettings data={data} onSave={onSave} />
      )}
    </section>
  );
}

function BoardSettings({ data, onSave }: ViewSettingsProps) {
  const { definition, properties } = data;
  const board = definition.board;
  const shown = board.cardProperties;
  const toggle = (name: string, on: boolean) => {
    const cardProperties = on ? [...shown, name] : shown.filter((property) => property !== name);
    onSave({ ...definition, board: { ...board, cardProperties } });
  };
  return (
    <>
      <Setting label="Columns from">
        <PropertySelect
          label="Columns from"
          value={board.groupBy}
          properties={properties}
          onChange={(groupBy) => { onSave({ ...definition, board: { ...board, groupBy, columns: [], hidden: [], cardOrder: {} } }); }}
        />
      </Setting>
      <Setting label="On cards">
        <div className={`${styles.line} flex-wrap gap-x-4`}>
          {properties
            .filter((info) => info.name !== board.groupBy)
            .map((info) => {
              const on = shown.includes(info.name);
              return (
                <label key={info.name} className={styles.check}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={on}
                    disabled={!on && shown.length >= MAX_CARD_PROPERTIES}
                    onChange={(event) => { toggle(info.name, event.target.checked); }}
                  />
                  {info.name}
                </label>
              );
            })}
        </div>
      </Setting>
    </>
  );
}

function Setting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className={styles.label}>{label}</span>
      <div className="flex flex-col items-start gap-2 min-w-0">{children}</div>
    </div>
  );
}

interface FilterRowProps {
  readonly filter: Filter;
  readonly names: readonly string[];
  readonly onChange: (filter: Filter) => void;
  readonly onRemove: () => void;
}

function FilterRow({ filter, names, onChange, onRemove }: FilterRowProps) {
  const needsValue = filter.op !== 'isEmpty' && filter.op !== 'isNotEmpty';
  return (
    <div className={styles.line}>
      <NameSelect label="Filter property" value={filter.property} names={names} onChange={(property) => { onChange({ ...filter, property }); }} />
      <select
        className={styles.select}
        aria-label="Condition"
        value={filter.op}
        onChange={(event) => { onChange({ ...filter, op: event.target.value as FilterOp }); }}
      >
        {OPS.map(([op, label]) => (
          <option key={op} value={op}>
            {label}
          </option>
        ))}
      </select>
      {needsValue && (
        <input
          key={filter.value}
          className={styles.input}
          aria-label="Filter value"
          placeholder="value"
          defaultValue={filter.value}
          onBlur={(event) => {
            if (event.target.value !== filter.value) onChange({ ...filter, value: event.target.value });
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      )}
      <RemoveButton label="Remove filter" onRemove={onRemove} />
    </div>
  );
}

interface SortRowProps {
  readonly rule: SortRule;
  readonly names: readonly string[];
  readonly onChange: (rule: SortRule) => void;
  readonly onRemove: () => void;
}

function SortRow({ rule, names, onChange, onRemove }: SortRowProps) {
  return (
    <div className={styles.line}>
      <NameSelect label="Sort property" value={rule.property} names={names} onChange={(property) => { onChange({ ...rule, property }); }} />
      <select
        className={styles.select}
        aria-label="Direction"
        value={rule.dir}
        onChange={(event) => { onChange({ ...rule, dir: event.target.value === 'desc' ? 'desc' : 'asc' }); }}
      >
        <option value="asc">Ascending</option>
        <option value="desc">Descending</option>
      </select>
      <RemoveButton label="Remove sort" onRemove={onRemove} />
    </div>
  );
}

interface NameSelectProps {
  readonly label: string;
  readonly value: string;
  readonly names: readonly string[];
  readonly onChange: (name: string) => void;
}

function NameSelect({ label, value, names, onChange }: NameSelectProps) {
  // Keep a property that no note has any more, so the saved setting stays visible.
  const choices = names.includes(value) ? names : [value, ...names];
  return (
    <select className={styles.select} aria-label={label} value={value} onChange={(event) => { onChange(event.target.value); }}>
      {choices.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

interface PropertySelectProps {
  readonly label: string;
  readonly value: string | null;
  readonly properties: readonly PropertyInfo[];
  readonly onChange: (name: string | null) => void;
}

function PropertySelect({ label, value, properties, onChange }: PropertySelectProps) {
  return (
    <select
      className={styles.select}
      aria-label={label}
      value={value ?? ''}
      onChange={(event) => { onChange(event.target.value === '' ? null : event.target.value); }}
    >
      <option value="">None</option>
      {properties.map((info) => (
        <option key={info.name} value={info.name}>
          {info.name}
        </option>
      ))}
    </select>
  );
}

function AddButton({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 h-(--control-height) p-0 border-0 bg-transparent text-ink-secondary hover:text-ink"
      onClick={onAdd}
    >
      <Icon name="plus" />
      <span>{label}</span>
    </button>
  );
}

function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button type="button" className={sharedStyles.iconButton} aria-label={label} title={label} onClick={onRemove}>
      <Icon name="close" />
    </button>
  );
}

function replaceAt<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((current, i) => (i === index ? item : current));
}
