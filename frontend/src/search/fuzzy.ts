/** A fuzzy match: higher scores are better; positions are the matched character indexes. */
export interface FuzzyMatch {
  readonly score: number;
  readonly positions: readonly number[];
}

export interface RankedNote {
  readonly path: string;
  readonly title: string;
  /** Matched character indexes in `title`, for highlighting. Empty if only the path matched. */
  readonly titlePositions: readonly number[];
  readonly score: number;
}

const WORD_BREAKS = new Set([' ', '/', '-', '_', '.']);
const TITLE_BONUS = 10;

/**
 * Matches when every character of `query` appears in `text` in order, ignoring case
 * and spaces. Consecutive characters and word starts score higher.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const wanted = query.toLowerCase().replaceAll(' ', '');
  if (wanted === '') return { score: 0, positions: [] };
  const haystack = text.toLowerCase();

  const positions: number[] = [];
  let score = 0;
  let searchFrom = 0;
  for (const character of wanted) {
    const index = haystack.indexOf(character, searchFrom);
    if (index === -1) return null;

    score += 1;
    const previous = positions.at(-1);
    if (previous !== undefined && index === previous + 1) score += 5;
    if (index === 0 || WORD_BREAKS.has(haystack[index - 1] ?? '')) score += 3;

    positions.push(index);
    searchFrom = index + 1;
  }
  return { score, positions };
}

/** The best matches for the quick-open palette (X-4): title matches beat path matches. */
export function rankNotes(
  query: string,
  notes: readonly { path: string; title: string }[],
  limit: number,
): RankedNote[] {
  const ranked: RankedNote[] = [];
  for (const note of notes) {
    const inTitle = fuzzyMatch(query, note.title);
    const inPath = fuzzyMatch(query, note.path);
    if (inTitle !== null) {
      ranked.push({ ...note, titlePositions: inTitle.positions, score: inTitle.score + TITLE_BONUS });
    } else if (inPath !== null) {
      ranked.push({ ...note, titlePositions: [], score: inPath.score });
    }
  }
  ranked.sort((a, b) => b.score - a.score || a.title.length - b.title.length || a.path.localeCompare(b.path));
  return ranked.slice(0, limit);
}
