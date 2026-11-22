import { Facet } from '@codemirror/state';

/** Where the open note lives, so previews can find images next to it. */
export interface NoteContext {
  readonly vaultRoot: string;
  readonly notePath: string;
}

export const noteContext = Facet.define<NoteContext, NoteContext | null>({
  combine: (values) => values[0] ?? null,
});
