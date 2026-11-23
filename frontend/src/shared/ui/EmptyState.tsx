import type { ReactNode } from 'react';
import { useCommand, type CommandId } from '../commands/index.ts';
import { primaryButton } from './styles.ts';

interface EmptyStateProps {
  readonly title: string;
  readonly children: ReactNode;
  /** The one primary action for this screen, if it has one. */
  readonly action?: CommandId;
}

/** Shared "nothing here yet" screen, so every section's empty state matches. */
export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <section className="flex flex-col items-center gap-4 m-auto p-10 text-center">
      <h1 className="m-0 text-display font-light tracking-tight leading-[1.2]">{title}</h1>
      <p className="max-w-(--text-max-width) mt-0 mx-0 mb-2 text-ink-secondary text-md">{children}</p>
      {action !== undefined && <PrimaryButton command={action} />}
    </section>
  );
}

function PrimaryButton({ command }: { command: CommandId }) {
  const { title, enabled, run } = useCommand(command);
  return (
    <button type="button" className={primaryButton} disabled={!enabled} onClick={run}>
      {title}
    </button>
  );
}
