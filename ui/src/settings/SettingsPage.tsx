import { useEffect, useState, type ReactNode } from 'react';
import { useCommand } from '../shared/commands/index.ts';
import { invoke } from '../shared/ipc/index.ts';
import { useSettings } from '../shared/settings/index.ts';
import { EmptyState } from '../shared/ui/index.ts';
import { useVault } from '../shared/vault/index.ts';
import './settings.css';

const AUTOSAVE_CHOICES_MS = [500, 800, 1500, 3000];

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
    <section className="page">
      <h1 className="page__title">Settings</h1>
      <p className="page__subtitle">Saved in .vault/settings.json. Edit that file by hand and this page follows.</p>
      {locked && (
        <p className="settings__notice">These settings come from a newer version of the app, so they can't be changed here.</p>
      )}

      <h2 className="settings__heading">Editor</h2>
      <div className="rows">
        <SettingRow label="Save after a pause of" detail="Notes also save when you click away.">
          <select
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
            disabled={locked}
            checked={editor.lineNumbers}
            onChange={(event) => {
              updateVaultSettings({ editor: { ...editor, lineNumbers: event.target.checked } });
            }}
          />
        </SettingRow>
      </div>

      <h2 className="settings__heading">Vault</h2>
      <div className="rows">
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
    <label className="rows__row">
      <span className="rows__main">
        <span className="rows__name">{label}</span>
        <span className="rows__detail selectable">{detail}</span>
      </span>
      {children}
    </label>
  );
}

function OpenOtherFolderButton() {
  const { run } = useCommand('vault.open');
  return (
    <button type="button" className="button" onClick={run}>
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

  return <p className="settings__version">Notes {version}</p>;
}

function formatSeconds(ms: number): string {
  const seconds = ms / 1000;
  return seconds === 1 ? '1 second' : `${String(seconds)} seconds`;
}
