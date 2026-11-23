import { useState } from 'react';
import { useCommand, type CommandId } from '../shared/commands/index.ts';
import { invoke, isCommandError, type ImportReport } from '../shared/ipc/index.ts';
import { classNames, styles } from '../shared/ui/index.ts';
import { folderPaths, useVault } from '../shared/vault/index.ts';
import { outcomeText, progressText } from './ioText.ts';
import type { IoStatus } from './useIoStatus.ts';

const WHOLE_VAULT = '';
const sectionTitle = 'mt-8 mb-0 mx-0 text-md font-medium';

/** Import and export (IO-1 to IO-5): plain files in and out, never overwriting anything. */
export function IoPage({ status }: { status: IoStatus }) {
  return (
    <section className={styles.page}>
      <h1 className={styles.pageTitle}>Import & Export</h1>
      <p className={styles.pageSubtitle}>Notes come in and go out as plain files. An import never replaces anything.</p>
      <Status status={status} />

      <h2 className={sectionTitle}>Import</h2>
      <ul className={classNames(styles.rows, 'mt-3')}>
        <ActionRow command="io.importFolder" detail="Keeps its folders and attachments, and fixes links between its notes." />
        <ActionRow command="io.importFiles" detail=".md and .txt files become notes. A ZIP exported from this app keeps its folders." />
      </ul>

      <h2 className={sectionTitle}>Export</h2>
      <ZipExportRow busy={status.progress !== null} />
    </section>
  );
}

function Status({ status }: { status: IoStatus }) {
  const { progress, outcome } = status;
  if (progress !== null) {
    return (
      <div className="flex items-center gap-3 py-3 border-y border-rule" role="status">
        <span className="tabular-nums">Working… {progressText(progress)}</span>
        <progress className="flex-1 accent-(--accent)" value={progress.done} max={Math.max(1, progress.total)} />
        <button type="button" className={styles.button} onClick={() => { void invoke('io_cancel', {}); }}>
          Cancel
        </button>
      </div>
    );
  }
  if (outcome === null) return null;
  return (
    <div className="flex flex-col gap-2 py-3 border-y border-rule" role="status">
      <p className="m-0">{outcomeText(outcome)}</p>
      {outcome.kind === 'imported' && <ReportDetails report={outcome.report} />}
    </div>
  );
}

function ReportDetails({ report }: { report: ImportReport }) {
  const lines = [
    ...report.renamed.map((item) => `${item.from} came in as ${item.to}`),
    ...report.skipped.map((item) => `${item.path} was skipped: ${item.reason}`),
  ];
  return (
    <>
      {lines.length > 0 && (
        <ul className="m-0 pl-5 text-ink-secondary text-sm">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {report.savedAs !== null && <p className="m-0 text-ink-secondary text-sm">The full report is saved in {report.savedAs}.</p>}
    </>
  );
}

function ActionRow({ command, detail }: { command: CommandId; detail: string }) {
  const { title, enabled, run } = useCommand(command);
  return (
    <li className={styles.rowsRow}>
      <div className={styles.rowsMain}>
        <span className={styles.rowsName}>{title.replace('…', '')}</span>
        <span className={styles.rowsDetail}>{detail}</span>
      </div>
      <button type="button" className={styles.button} disabled={!enabled} onClick={run}>
        {title}
      </button>
    </li>
  );
}

/** A ZIP of a folder or the whole vault (IO-5). */
function ZipExportRow({ busy }: { busy: boolean }) {
  const { info, tree, showError } = useVault();
  const [folder, setFolder] = useState(WHOLE_VAULT);
  const [includeVaultDir, setIncludeVaultDir] = useState(true);
  const [stripKeys, setStripKeys] = useState(false);
  const wholeVault = folder === WHOLE_VAULT;

  function exportZip() {
    const options = { folder: wholeVault ? null : folder, includeVaultDir: wholeVault && includeVaultDir, stripKeys };
    invoke('io_export_zip', { options }).catch((cause: unknown) => {
      if (!isCommandError(cause) || cause.code !== 'cancelled') showError(cause);
    });
  }

  return (
    <div className={classNames('flex flex-col gap-3 mt-3 py-3 border-y border-rule')}>
      <label className="flex items-center gap-2">
        <span>Export</span>
        <select
          className="py-1 px-2 border border-rule rounded-sm bg-surface text-ink"
          value={folder}
          onChange={(event) => { setFolder(event.target.value); }}
        >
          <option value={WHOLE_VAULT}>The whole vault</option>
          {folderPaths(tree).map((path) => (
            <option key={path} value={path}>
              {path}
            </option>
          ))}
        </select>
        <span>as a ZIP of plain files</span>
      </label>
      <label className={classNames('flex items-center gap-2', !wholeVault && 'text-ink-secondary')}>
        <input
          type="checkbox"
          checked={wholeVault && includeVaultDir}
          disabled={!wholeVault}
          onChange={(event) => { setIncludeVaultDir(event.target.checked); }}
        />
        Include settings, saved views and reading progress (the .vault folder)
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={stripKeys} onChange={(event) => { setStripKeys(event.target.checked); }} />
        Leave out each note&apos;s key line, for sharing outside this app
      </label>
      <div>
        <button type="button" className={styles.button} disabled={info === null || busy} onClick={exportZip}>
          Export ZIP…
        </button>
      </div>
    </div>
  );
}
