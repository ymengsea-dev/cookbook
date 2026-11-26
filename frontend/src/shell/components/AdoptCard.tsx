import { useEffect, useState } from 'react';
import type { AdoptReport } from '../../shared/ipc/index.ts';
import { styles } from '../../shared/ui/index.ts';
import { useVault } from '../../shared/vault/index.ts';
import { adoptVault, previewAdopt } from '../api/adoptApi.ts';

const adoptCard = `${styles.card} w-[calc(100%-2*var(--space-10))] max-w-(--page-max-width) mt-2 mx-auto mb-0`;
const fileList = `${styles.selectable} max-h-[calc(var(--space-10)*4)] m-0 py-2 px-3 overflow-y-auto border-y border-rule list-none text-sm`;
// In a card, buttons keep their own width.
const cardButton = `${styles.button} self-start`;

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
    previewAdopt().then(
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
      const report = await adoptVault();
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
    <section className={adoptCard}>
      <p className={styles.cardTitle}>{count} without a key</p>
      <p className={styles.cardText}>
        The app gives each note a permanent key in its front matter, so renames and moves never break links,
        views or sync. Nothing else in the files changes.
      </p>
      {step.kind === 'idle' ? (
        <button type="button" className={cardButton} onClick={() => { setStep({ kind: 'review' }); }}>
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
      <ul className={fileList}>
        {missing.slice(0, PREVIEW_LIMIT).map((path) => (
          <li key={path}>{path}</li>
        ))}
        {hidden > 0 && <li>…and {notesLabel(hidden)} more</li>}
      </ul>
      <p className={styles.cardText}>A copy of these notes is saved in .vault/backups before anything changes.</p>
      <div className={styles.cardActions}>
        <button type="button" className={cardButton} disabled={working} onClick={onAdopt}>
          {working ? 'Adding keys…' : `Add keys to ${notesLabel(missing.length)}`}
        </button>
        <button type="button" className={`${styles.quietButton} self-start`} disabled={working} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </>
  );
}

function AdoptDone({ report }: { report: AdoptReport }) {
  return (
    <section className={adoptCard} role="status">
      <p className={styles.cardTitle}>Added keys to {notesLabel(report.updated.length)}</p>
      <p className={`${styles.cardText} ${styles.selectable}`}>Backup: {report.backup}</p>
      {report.skipped.length > 0 && (
        <ul className={fileList}>
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
