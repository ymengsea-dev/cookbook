const PATHS = {
  sidebar: 'M3.5 3h9a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7A1.5 1.5 0 0 1 3.5 3ZM6.5 3v10',
  plus: 'M8 3.5v9M3.5 8h9',
  chevron: 'M6 4l4 4-4 4',
  folder: 'M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.5 1.5h4.9A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5Z',
  close: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  search: 'M7 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM10.5 10.5 14 14',
  note: 'M4.5 2h4.5l3 3v8.5a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5ZM9 2v3h3M6 8.5h4M6 11h3',
  book: 'M2 3.5h4a2 2 0 0 1 2 2V13a1.5 1.5 0 0 0-1.5-1.5H2ZM14 3.5h-4a2 2 0 0 0-2 2V13a1.5 1.5 0 0 1 1.5-1.5H14Z',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9',
  sliders: 'M3 5h6M12 5h1M3 11h1M7 11h6M10.5 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM5.5 12.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
} as const;

export type IconName = keyof typeof PATHS;

/** 16 px line icon. Decorative: the control next to it carries the accessible name. */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
