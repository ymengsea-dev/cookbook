import type { ReactNode } from 'react';
import { useCommand, type CommandId } from '../commands/index.ts';
import './controls.css';

interface EmptyStateProps {
  readonly title: string;
  readonly children: ReactNode;
  /** The one primary action for this screen, if it has one. */
  readonly action?: CommandId;
}

/** Shared "nothing here yet" screen, so every section's empty state matches. */
export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <section className="empty-state">
      <h1 className="empty-state__title">{title}</h1>
      <p className="empty-state__text">{children}</p>
      {action !== undefined && <PrimaryButton command={action} />}
    </section>
  );
}

function PrimaryButton({ command }: { command: CommandId }) {
  const { title, enabled, run } = useCommand(command);
  return (
    <button type="button" className="button button--primary" disabled={!enabled} onClick={run}>
      {title}
    </button>
  );
}
