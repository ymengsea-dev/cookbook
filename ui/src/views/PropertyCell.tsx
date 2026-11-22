import { useId, useRef, type KeyboardEvent } from 'react';
import type { PropertyInfo, PropertyType, PropertyValue } from '../shared/ipc/index.ts';
import { displayValue, isChecked, valueFromInput } from './values.ts';

interface PropertyCellProps {
  readonly value: PropertyValue | undefined;
  readonly info: PropertyInfo | undefined;
  readonly editing: boolean;
  /** A new value, or null when the edit was cancelled. */
  readonly onCommit: (value: PropertyValue | null) => void;
}

/** One property value in a list row or on a card. Editable when `editing` is set. */
export function PropertyCell({ value, info, editing, onCommit }: PropertyCellProps) {
  const kind = info?.kind ?? 'text';
  if (kind === 'checkbox') {
    const checked = isChecked(value);
    return (
      <input
        type="checkbox"
        className="view-checkbox"
        aria-label={info?.name ?? 'Checkbox'}
        checked={checked}
        tabIndex={-1}
        // The cell around it would treat the click as "edit" and toggle a second time.
        onClick={(event) => {
          event.stopPropagation();
        }}
        onChange={() => {
          onCommit({ type: 'bool', value: !checked });
        }}
      />
    );
  }
  if (editing) return <CellInput kind={kind} value={value} options={info?.values ?? []} onCommit={onCommit} />;
  return <ValueText kind={kind} value={value} />;
}

/** A value as text. Select values show as quiet chips so they scan as categories. */
export function ValueText({ kind, value }: { kind: PropertyType; value: PropertyValue | undefined }) {
  const text = displayValue(value);
  if (text === '') return null;
  if (kind === 'select' || kind === 'multiSelect') {
    const items = value?.type === 'list' ? value.value.map(displayValue) : [text];
    return (
      <span className="view-chips">
        {items
          .filter((item) => item !== '')
          .map((item, index) => (
            <span key={`${item}-${String(index)}`} className="view-chip">
              {item}
            </span>
          ))}
      </span>
    );
  }
  const numeric = kind === 'number' || kind === 'date';
  return <span className={numeric ? 'view-value view-value--numeric' : 'view-value'}>{text}</span>;
}

interface CellInputProps {
  readonly kind: PropertyType;
  readonly value: PropertyValue | undefined;
  readonly options: readonly string[];
  readonly onCommit: (value: PropertyValue | null) => void;
}

/** Enter or leaving the field saves; Escape cancels. */
function CellInput({ kind, value, options, onCommit }: CellInputProps) {
  const listId = useId();
  const hasOptions = kind === 'select' || kind === 'multiSelect';
  const text = displayValue(value);
  // A date with a time can't go in a date picker without losing the time.
  const asDatePicker = kind === 'date' && (text === '' || text.length === 10);
  // Enter or Escape closes the field, and the blur that follows must not save again.
  const finished = useRef(false);

  function finish(next: PropertyValue | null) {
    if (finished.current) return;
    finished.current = true;
    onCommit(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Keys typed here belong to the field, not to the table around it.
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(valueFromInput(kind, event.currentTarget.value));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finish(null);
    }
  }

  return (
    <>
      <input
        className="view-input"
        type={asDatePicker ? 'date' : 'text'}
        inputMode={kind === 'number' ? 'decimal' : undefined}
        aria-label="Edit value"
        list={hasOptions ? listId : undefined}
        defaultValue={text}
        // The field appears because the user asked to edit this cell.
        autoFocus
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          finish(valueFromInput(kind, event.currentTarget.value));
        }}
      />
      {hasOptions && (
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
    </>
  );
}
