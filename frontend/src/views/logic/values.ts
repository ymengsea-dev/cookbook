import type { PropertyType, PropertyValue, ViewSource } from '../../shared/ipc/index.ts';

export const TYPE_LABELS: Readonly<Record<PropertyType, string>> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  checkbox: 'Checkbox',
  select: 'Select',
  multiSelect: 'Multi-select',
  url: 'URL',
};

export const PROPERTY_TYPES = Object.keys(TYPE_LABELS) as PropertyType[];

/** The value as a person reads it. Lists are joined with ", ". */
export function displayValue(value: PropertyValue | undefined): string {
  if (value === undefined) return '';
  switch (value.type) {
    case 'text':
      return value.value;
    case 'number':
      return String(value.value);
    case 'bool':
      return value.value ? 'true' : 'false';
    case 'null':
      return '';
    case 'list':
      return value.value.map(displayValue).filter((text) => text !== '').join(', ');
  }
}

export function isChecked(value: PropertyValue | undefined): boolean {
  if (value === undefined) return false;
  if (value.type === 'bool') return value.value;
  return value.type === 'text' && value.value.trim().toLowerCase() === 'true';
}

/** Turns what the user typed into a value of `kind`. Blank text clears the value. */
export function valueFromInput(kind: PropertyType, text: string): PropertyValue {
  const trimmed = text.trim();
  if (kind === 'checkbox') return { type: 'bool', value: trimmed.toLowerCase() === 'true' };
  if (trimmed === '') return { type: 'null' };
  if (kind === 'number') {
    const number = Number(trimmed);
    return Number.isFinite(number) ? { type: 'number', value: number } : { type: 'text', value: trimmed };
  }
  if (kind === 'multiSelect') {
    const items = trimmed
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '');
    return { type: 'list', value: items.map((item) => ({ type: 'text', value: item })) };
  }
  return { type: 'text', value: trimmed };
}

/** True when saving `next` would change nothing, so no write is needed. */
export function sameValue(current: PropertyValue | undefined, next: PropertyValue): boolean {
  const before = current ?? { type: 'null' };
  return JSON.stringify(before) === JSON.stringify(next);
}

/** Where a view's notes come from, in words: "Whole vault", "Projects and subfolders", "#web". */
export function sourceLabel(source: ViewSource): string {
  switch (source.kind) {
    case 'vault':
      return 'Whole vault';
    case 'folder':
      return source.recursive ? `${source.folder} and subfolders` : source.folder;
    case 'tag':
      return source.tag === '' ? 'No tag chosen' : `#${source.tag}`;
  }
}

export function noteCount(count: number): string {
  return count === 1 ? '1 note' : `${count.toLocaleString()} notes`;
}
