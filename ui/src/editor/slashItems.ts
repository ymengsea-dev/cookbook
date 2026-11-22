/** One entry in the `/` menu (E-4). */
export interface SlashItem {
  readonly label: string;
  readonly detail: string;
  /** The Markdown inserted in place of the `/` and what was typed after it. */
  readonly text: string;
  /** Where the cursor lands, counted from the start of `text`. */
  readonly cursor: number;
  /** Blocks such as tables need an empty line above them to parse. */
  readonly needsBlankLineBefore: boolean;
}

const TABLE = '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |';
const CODE = '```\n\n```';

export const SLASH_ITEMS: readonly SlashItem[] = [
  { label: 'Heading 1', detail: '#', text: '# ', cursor: 2, needsBlankLineBefore: false },
  { label: 'Heading 2', detail: '##', text: '## ', cursor: 3, needsBlankLineBefore: false },
  { label: 'Heading 3', detail: '###', text: '### ', cursor: 4, needsBlankLineBefore: false },
  { label: 'Bulleted list', detail: '-', text: '- ', cursor: 2, needsBlankLineBefore: false },
  { label: 'Numbered list', detail: '1.', text: '1. ', cursor: 3, needsBlankLineBefore: false },
  { label: 'Task', detail: '- [ ]', text: '- [ ] ', cursor: 6, needsBlankLineBefore: false },
  { label: 'Quote', detail: '>', text: '> ', cursor: 2, needsBlankLineBefore: false },
  { label: 'Code block', detail: '```', text: CODE, cursor: 4, needsBlankLineBefore: true },
  { label: 'Table', detail: '| |', text: TABLE, cursor: TABLE.lastIndexOf('|  |') + 2, needsBlankLineBefore: true },
  { label: 'Divider', detail: '---', text: '---\n', cursor: 4, needsBlankLineBefore: true },
];
