// Tailwind class lists for the controls that list, board and settings share.

const field =
  'h-(--control-height) px-2 border border-rule rounded-sm bg-surface text-ink [font:inherit] focus-visible:border-accent focus-visible:outline-1 focus-visible:outline-accent focus-visible:outline-offset-0';

export const select = field;
export const input = `${field} min-w-0`;
export const checkbox = 'size-4 m-0 accent-accent';

export const chips = 'inline-flex flex-wrap gap-1';
export const chip = 'px-2 rounded-sm bg-[color-mix(in_srgb,var(--stone)_28%,transparent)] text-sm leading-[1.6]';

/** Settings rows: a fixed-width label, then the controls. */
export const label = 'flex-none w-[calc(var(--space-14)+var(--space-8))] leading-(--control-height) text-ink-secondary text-sm font-medium';
export const line = 'flex items-center gap-2';
export const check = 'inline-flex items-center gap-2';

export const value = 'truncate';
export const numericValue = 'truncate tabular-nums';

/** A list-view table row; the columns come from `--list-columns` on the table. */
export const listRow = 'grid grid-cols-(--list-columns) min-w-max border-t border-rule';
