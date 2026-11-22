import { useEffect, useState } from 'react';
import { invoke, type AdoptReport } from '../shared/ipc/index.ts';
import { useVault } from '../shared/vault/index.ts';

const PREVIEW_LIMIT = 50;

type Step = { kind: 'idle' } | { kind: 'review' } | { kind: 'working' } | { kind: 'done'; report: AdoptReport };

/**
 * Offers "adopt vault" when notes have no key yet (V-5): a preview of the files,
 * a backup, then the keys. Never runs without a click.
 */
export function AdoptCard() {
  const { info, refreshTree, showError } = useVault();
  const [missing, setMissing] = useState<readonly string[]>([]);
  const [step, setStep] = useState<Step>({ kind: 'idle' });

  useEffect(() => {
    if (info === null) return;
    let cancelled = false;
    invoke('vault_adopt_preview', {}).then(
      (paths) => {
        if (!cancelled) setMissing(paths);
      },
      (cause: unknown) => {
        if (!cancelled) showError(cause);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [info, showError]);

  async function adopt() {
    setStep({ kind: 'working' });
    try {
      const report = await invoke('vault_adopt', {});
      setStep({ kind: 'done', report });
      setMissing([]);
      await refreshTree();
    } catch (cause) {
      showError(cause);
      setStep({ kind: 'review' });
    }
  }

  if (step.kind === 'done') {
    return <AdoptDone report={step.report} />;
  }
  if (missing.length === 0) {
    return null;
  }

  const count = notesLabel(missing.length);
  return (
    <section className="card adopt-card">
      <p className="card__title">{count} without a key</p>
      <p className="card__text">
        The app gives each note a permanent key in its front matter, so renames and moves never break links,
        views or sync. Nothing else in the files changes.
      </p>
      {step.kind === 'idle' ? (
        <button type="button" className="button" onClick={() => { setStep({ kind: 'review' }); }}>
          Review…
        </button>
      ) : (
        <AdoptReview missing={missing} working={step.kind === 'working'} onAdopt={() => { void adopt(); }} onCancel={() => { setStep({ kind: 'idle' }); }} />
      )}
    </section>
  );
}

interface AdoptReviewProps {
  readonly missing: readonly string[];
  readonly working: boolean;
  readonly onAdopt: () => void;
  readonly onCancel: () => void;
}

function AdoptReview({ missing, working, onAdopt, onCancel }: AdoptReviewProps) {
  const hidden = missing.length - PREVIEW_LIMIT;
  return (
    <>
      <ul className="adopt-card__list selectable">
        {missing.slice(0, PREVIEW_LIMIT).map((path) => (
          <li key={path}>{path}</li>
        ))}
        {hidden > 0 && <li>…and {notesLabel(hidden)} more</li>}
      </ul>
      <p className="card__text">A copy of these notes is saved in .vault/backups before anything changes.</p>
      <div className="card__actions">
        <button type="button" className="button" disabled={working} onClick={onAdopt}>
          {working ? 'Adding keys…' : `Add keys to ${notesLabel(missing.length)}`}
        </button>
        <button type="button" className="button button--quiet" disabled={working} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </>
  );
}

function AdoptDone({ report }: { report: AdoptReport }) {
  return (
    <section className="card adopt-card" role="status">
      <p className="card__title">Added keys to {notesLabel(report.updated.length)}</p>
      <p className="card__text selectable">Backup: {report.backup}</p>
      {report.skipped.length > 0 && (
        <ul className="adopt-card__list selectable">
          {report.skipped.map((note) => (
            <li key={note.path}>
              Skipped {note.path}: {note.reason}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function notesLabel(count: number): string {
  return count === 1 ? '1 note' : `${String(count)} notes`;
}
