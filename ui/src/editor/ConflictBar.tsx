interface ConflictBarProps {
  readonly onKeepMine: () => void;
  readonly onTakeTheirs: () => void;
}

/** Shown when the file changed in another app while this note had unsaved edits (V-7). */
export function ConflictBar({ onKeepMine, onTakeTheirs }: ConflictBarProps) {
  return (
    <div className="conflict-bar" role="alert">
      <p className="conflict-bar__text">
        This note was changed in another app while you were editing. Which version should be kept?
      </p>
      <div className="conflict-bar__actions">
        <button type="button" className="button" onClick={onKeepMine}>
          Keep My Version
        </button>
        <button type="button" className="button" onClick={onTakeTheirs}>
          Use the Other Version
        </button>
      </div>
    </div>
  );
}
