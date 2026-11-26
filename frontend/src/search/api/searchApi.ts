import { invoke, type SearchHit } from '../../shared/ipc/index.ts';

/** Rust calls for full-text search. */

export function searchNotes(query: string, limit: number): Promise<SearchHit[]> {
  return invoke('search_notes', { query, limit });
}
