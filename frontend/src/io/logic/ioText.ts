import type { ImportReport, IoOutcome, IoProgress } from '../../shared/ipc/index.ts';

function count(value: number, one: string, many: string): string {
  return value === 1 ? `1 ${one}` : `${String(value)} ${many}`;
}

/** One sentence for how an import or export ended (IO-1 to IO-5). */
export function outcomeText(outcome: IoOutcome): string {
  switch (outcome.kind) {
    case 'imported':
      return importText(outcome.report);
    case 'exported':
      return `Exported ${count(outcome.files, 'file', 'files')} to ${outcome.place}.`;
    case 'failed':
      return outcome.message;
  }
}

function importText(report: ImportReport): string {
  const what = `${count(report.notes, 'note', 'notes')} and ${count(report.attachments, 'attachment', 'attachments')}`;
  const where = report.destination === null ? '' : ` into ${report.destination}`;
  if (report.cancelled) {
    return `Import cancelled after ${what}. Everything copied so far was kept.`;
  }
  const links = report.linksFixed > 0 ? ` ${count(report.linksFixed, 'link was', 'links were')} fixed.` : '';
  return `Imported ${what}${where}.${links}`;
}

export function progressText(progress: IoProgress): string {
  return `${String(progress.done)} of ${String(progress.total)} files`;
}
