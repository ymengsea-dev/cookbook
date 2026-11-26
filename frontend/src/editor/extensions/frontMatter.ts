import type { MarkdownConfig } from '@lezer/markdown';
import { tags } from '@lezer/highlight';

const FENCE = /^---\s*$/;
const CLOSING_FENCE = /^(---|\.\.\.)\s*$/;

/**
 * Parses YAML front matter at the very top of a note as its own block. Without this,
 * Markdown reads the closing `---` as a heading underline and styles the YAML as a title.
 */
export const frontMatter: MarkdownConfig = {
  defineNodes: [{ name: 'FrontMatter', block: true, style: tags.meta }],
  parseBlock: [
    {
      name: 'FrontMatter',
      before: 'HorizontalRule',
      parse(context, line) {
        if (context.lineStart !== 0 || !FENCE.test(line.text)) return false;
        const start = context.lineStart;
        while (context.nextLine()) {
          if (CLOSING_FENCE.test(line.text)) {
            context.nextLine();
            break;
          }
        }
        context.addElement(context.elt('FrontMatter', start, context.prevLineEnd()));
        return true;
      },
    },
  ],
};
