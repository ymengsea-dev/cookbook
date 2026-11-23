// Tailwind class lists for controls and layouts that several features share.
// Each list sets a property once, so two lists never fight over the same property.

/** Joins class lists, skipping the ones switched off with `false`, `null` or `undefined`. */
export function classNames(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((part) => typeof part === 'string' && part !== '').join(' ');
}

const buttonShape = 'inline-flex items-center gap-2 h-(--control-height) px-4 border rounded-sm text-base font-medium disabled:opacity-45';

export const button = `${buttonShape} border-rule bg-surface`;
/** The one accent action of a view. */
export const primaryButton = `${buttonShape} border-transparent bg-accent text-on-accent`;
export const quietButton = `${buttonShape} border-transparent bg-transparent`;

/** An icon button without its size, for the rare control that needs another size. */
export const iconButtonShape =
  'inline-flex items-center justify-center p-0 border-0 rounded-sm bg-transparent text-ink-secondary enabled:hover:bg-hover enabled:hover:text-ink disabled:opacity-40';
export const iconButton = `${iconButtonShape} size-(--control-height)`;

/** A page: content capped and centred, leading with its title. */
export const page = 'w-full max-w-(--page-max-width) mx-auto pt-2 px-10 pb-8';
/** A note's page, as wide as the content width setting (U-2). */
export const notePage = 'w-full max-w-(--content-width) mx-auto pt-2 px-10 pb-8';
export const pageTitle = 'm-0 text-xl font-regular tracking-tight';
export const pageSubtitle = 'mt-1 mx-0 mb-6 text-ink-secondary tabular-nums';

/** Rows between hairlines, with a hairline above the first and below the last. */
export const rows = 'm-0 p-0 border-b border-rule list-none';
export const rowsRow = 'flex items-center gap-4 py-(--row-padding) px-0 border-t border-rule';
export const rowsMain = 'flex flex-1 flex-col min-w-0';
export const rowsName = 'truncate';
export const rowsDetail = 'text-ink-secondary text-sm tabular-nums';

/** A card is for things that truly sit apart, such as a one-off task. */
export const card = 'flex flex-col gap-2 py-4 px-5 border border-rule rounded-lg bg-surface';
export const cardTitle = 'm-0 text-md font-medium tabular-nums';
export const cardText = 'm-0 text-ink-secondary';
export const cardActions = 'flex gap-2';

/** A one-pixel rule on an `<hr>`. */
export const hairline = 'm-0 border-0 border-t border-rule';
/** Content text the user can select; app chrome can't. */
export const selectable = 'select-text cursor-auto';
