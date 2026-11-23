import { styles } from '../shared/ui/index.ts';

interface ConflictBarProps {
  readonly onKeepMine: () => void;
  readonly onTakeTheirs: () => void;
}

/** Shown when the file changed in another app while this note had unsaved edits (V-7). */
export function ConflictBar({ onKeepMine, onTakeTheirs }: ConflictBarProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 mb-4 py-3 px-4 border border-[color-mix(in_srgb,var(--rust)_40%,var(--rule))] rounded-lg bg-[color-mix(in_srgb,var(--rust)_10%,var(--paper))]"
      role="alert"
    >
      <p className="flex-1 min-w-0 m-0">
        This note was changed in another app while you were editing. Which version should be kept?
      </p>
      <div className="flex gap-2">
        <button type="button" className={styles.button} onClick={onKeepMine}>
          Keep My Version
        </button>
        <button type="button" className={styles.button} onClick={onTakeTheirs}>
          Use the Other Version
        </button>
      </div>
    </div>
  );
}
