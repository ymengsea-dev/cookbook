import { useEffect, useState, type ReactNode } from 'react';
import { useCommand } from '../shared/commands/index.ts';
import { invoke } from '../shared/ipc/index.ts';
import { useSettings } from '../shared/settings/index.ts';
import { EmptyState, styles } from '../shared/ui/index.ts';
import { useVault } from '../shared/vault/index.ts';

const AUTOSAVE_CHOICES_MS = [500, 800, 1500, 3000];

const heading = 'mt-8 mx-0 mb-3 text-lg font-regular';
const select = 'py-1 px-2 border border-rule rounded-sm bg-surface text-ink [font:inherit]';
const checkbox = 'size-4 accent-accent';

/**
 * Edits the same JSON files the app reads (S-6). A change here is saved to
 * `.vault/settings.json` a moment later, and a hand edit of that file shows up here.
 */
export function SettingsPage() {
  const { info } = useVault();
  const { snapshot, updateVaultSettings } = useSettings();

  if (info === null || snapshot === null) {
    return (
      <EmptyState title="Settings" action="vault.open">
        Settings are saved as JSON files in your vault, so open a folder first. You can also edit those files by hand.
      </EmptyState>
    );
  }

  const { editor } = snapshot.vault;
  const locked = snapshot.readOnly;
  const choices = AUTOSAVE_CHOICES_MS.includes(editor.autosaveMs)
    ? AUTOSAVE_CHOICES_MS
    : [...AUTOSAVE_CHOICES_MS, editor.autosaveMs].sort((a, b) => a - b);

  return (
    <section className={styles.page}>
      <h1 className={styles.pageTitle}>Settings</h1>
      <p className={styles.pageSubtitle}>Saved in .vault/settings.json. Edit that file by hand and this page follows.</p>
      {locked && (
        <p className="mt-0 mx-0 mb-4 text-[color-mix(in_srgb,var(--mustard),var(--ink)_45%)]">These settings come from a newer version of the app, so they can't be changed here.</p>
      )}

      <h2 className={heading}>Editor</h2>
      <div className={styles.rows}>
        <SettingRow label="Save after a pause of" detail="Notes also save when you click away.">
          <select
            className={select}
            disabled={locked}
            value={editor.autosaveMs}
            onChange={(event) => {
              updateVaultSettings({ editor: { ...editor, autosaveMs: Number(event.target.value) } });
            }}
          >
            {choices.map((ms) => (
              <option key={ms} value={ms}>
                {formatSeconds(ms)}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Line numbers" detail="Show a number beside every line of a note.">
          <input
            type="checkbox"
            className={checkbox}
            disabled={locked}
            checked={editor.lineNumbers}
            onChange={(event) => {
              updateVaultSettings({ editor: { ...editor, lineNumbers: event.target.checked } });
            }}
          />
        </SettingRow>
      </div>

      <h2 className={heading}>Vault</h2>
      <div className={styles.rows}>
        <SettingRow label={info.name} detail={info.root}>
          <OpenOtherFolderButton />
        </SettingRow>
      </div>

      <AppVersion />
    </section>
  );
}

function SettingRow({ label, detail, children }: { label: string; detail: string; children: ReactNode }) {
  return (
    <label className={styles.rowsRow}>
      <span className={styles.rowsMain}>
        <span className={styles.rowsName}>{label}</span>
        <span className={`${styles.rowsDetail} ${styles.selectable}`}>{detail}</span>
      </span>
      {children}
    </label>
  );
}

function OpenOtherFolderButton() {
  const { run } = useCommand('vault.open');
  return (
    <button type="button" className={styles.button} onClick={run}>
      Open Another Folder…
    </button>
  );
}

function AppVersion() {
  const [version, setVersion] = useState('');

  useEffect(() => {
    invoke('app_info', {}).then(
      (info) => {
        setVersion(info.version);
      },
      () => {
        setVersion('unknown');
      },
    );
  }, []);

  return <p className="mt-10 mx-0 mb-0 text-ink-secondary text-sm tabular-nums">Notes {version}</p>;
}

function formatSeconds(ms: number): string {
  const seconds = ms / 1000;
  return seconds === 1 ? '1 second' : `${String(seconds)} seconds`;
}
