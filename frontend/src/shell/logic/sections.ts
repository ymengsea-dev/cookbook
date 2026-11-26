import type { CommandId } from '../../shared/commands/index.ts';
import type { IconName } from '../../shared/ui/index.ts';

/** `view` is one saved view; `views` lists them all. */
export type SectionId = 'notes' | 'search' | 'books' | 'views' | 'view' | 'trash' | 'io' | 'settings';

export interface Section {
  readonly id: SectionId;
  readonly title: string;
  readonly icon: IconName;
  readonly command: CommandId;
}

export const LIBRARY: readonly Section[] = [
  { id: 'notes', title: 'All Notes', icon: 'note', command: 'go.notes' },
  { id: 'search', title: 'Search', icon: 'search', command: 'go.search' },
  { id: 'books', title: 'Books', icon: 'book', command: 'go.books' },
];

export const ALL_VIEWS: Section = { id: 'views', title: 'All Views', icon: 'list', command: 'go.views' };

export const TRASH: Section = { id: 'trash', title: 'Trash', icon: 'trash', command: 'go.trash' };

export const IMPORT_EXPORT: Section = { id: 'io', title: 'Import & Export', icon: 'transfer', command: 'go.io' };

export const SETTINGS: Section = { id: 'settings', title: 'Settings', icon: 'sliders', command: 'app.settings' };
