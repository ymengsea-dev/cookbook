import type { BoardColumn } from '../../shared/ipc/index.ts';

/** The column for notes without a value. Must match `NO_VALUE` in vault-views. */
export const NO_VALUE = '';

/** Where a dragged card was dropped: before `beforeKey`, or at the end when null. */
export interface CardDrop {
  readonly cardKey: string;
  readonly toColumn: string;
  readonly beforeKey: string | null;
}

/** The board after a drop, so the card moves at once while the note saves (B-4). */
export function moveCardLocally(columns: readonly BoardColumn[], drop: CardDrop): BoardColumn[] {
  const card = columns.flatMap((column) => column.cards).find((candidate) => candidate.key === drop.cardKey);
  if (card === undefined) return [...columns];
  return columns.map((column) => {
    const cards = column.cards.filter((candidate) => candidate.key !== drop.cardKey);
    if (column.value !== drop.toColumn) return { ...column, cards };
    const at = drop.beforeKey === null ? -1 : cards.findIndex((candidate) => candidate.key === drop.beforeKey);
    if (at === -1) cards.push(card);
    else cards.splice(at, 0, card);
    return { ...column, cards };
  });
}

/** Card keys of one column, top to bottom: the order saved in the view file (B-5). */
export function columnKeys(columns: readonly BoardColumn[], value: string): string[] {
  const column = columns.find((candidate) => candidate.value === value);
  return column === undefined ? [] : column.cards.map((card) => card.key);
}

/** The column names to save after reordering, without "No value", which always stays last. */
export function savedColumnNames(columns: readonly BoardColumn[]): string[] {
  return columns.map((column) => column.value).filter((value) => value !== NO_VALUE);
}

/** `items` with the item at `from` moved to `to`. Out-of-range moves change nothing. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const result = [...items];
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return result;
  const [item] = result.splice(from, 1);
  if (item !== undefined) result.splice(to, 0, item);
  return result;
}
