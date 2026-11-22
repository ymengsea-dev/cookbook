import type { ReactNode } from 'react';

// Must match MATCH_START and MATCH_END in crates/vault-index/src/search.rs.
const MATCH_START = '\u{E000}';
const MATCH_END = '\u{E001}';

/** A search snippet with its matches wrapped in <mark>. */
export function Snippet({ text }: { text: string }) {
  const parts = text.split(MATCH_START);
  return (
    <>
      {parts.map((part, index) => {
        if (index === 0) return part;
        const [matched = '', rest = ''] = part.split(MATCH_END);
        return (
          <span key={index}>
            <mark>{matched}</mark>
            {rest}
          </span>
        );
      })}
    </>
  );
}

/** Text with the characters at `positions` wrapped in <mark>, for fuzzy matches. */
export function MarkedCharacters({ text, positions }: { text: string; positions: readonly number[] }) {
  if (positions.length === 0) return text;
  // Positions are string indexes from fuzzyMatch, so the text is cut with slice.
  const pieces: ReactNode[] = [];
  let from = 0;
  for (const position of positions) {
    pieces.push(text.slice(from, position));
    pieces.push(<mark key={position}>{text.slice(position, position + 1)}</mark>);
    from = position + 1;
  }
  pieces.push(text.slice(from));
  return <>{pieces}</>;
}

/** Wraps every occurrence of each term in `text` with <mark>, for the preview pane. */
export function MarkedTerms({ text, terms }: { text: string; terms: readonly string[] }) {
  const usable = terms.filter((term) => term !== '');
  if (usable.length === 0) return text;
  const escaped = usable.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pieces = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'));
  return (
    <>
      {pieces.map((piece, index) => (index % 2 === 1 ? <mark key={index}>{piece}</mark> : piece))}
    </>
  );
}
