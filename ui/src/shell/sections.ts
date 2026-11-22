import type { CommandId } from '../shared/commands/index.ts';
import type { IconName } from '../shared/ui/index.ts';

export type SectionId = 'notes' | 'books' | 'trash' | 'settings';

export interface Section {
  readonly id: SectionId;
  readonly title: string;
  readonly icon: IconName;
  readonly command: CommandId;
}

export const LIBRARY: readonly Section[] = [
  { id: 'notes', title: 'All Notes', icon: 'note', command: 'go.notes' },
  { id: 'books', title: 'Books', icon: 'book', command: 'go.books' },
];

export const TRASH: Section = { id: 'trash', title: 'Trash', icon: 'trash', command: 'go.trash' };

export const SETTINGS: Section = { id: 'settings', title: 'Settings', icon: 'sliders', command: 'app.settings' };
